package core

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"net/http/httputil"
	"net/url"
	"strings"
)

// Gateway is the HTTP handler. It checks the Redis cache, enforces API quotas,
// and proxies requests to the FastAPI backend or backtest service.
type Gateway struct {
	Store          *Store
	Proxy          *httputil.ReverseProxy
	BacktestProxy  *httputil.ReverseProxy
}

// NewGateway creates a Gateway wired to the given store and proxies.
func NewGateway(store *Store, proxy *httputil.ReverseProxy, backtestProxy *httputil.ReverseProxy) *Gateway {
	return &Gateway{Store: store, Proxy: proxy, BacktestProxy: backtestProxy}
}

// HandleAPI is the main entry point for all /api/* requests except /api/quota/status.
func (g *Gateway) HandleAPI(w http.ResponseWriter, r *http.Request) {
	// Backtest requests bypass quota and cache — route directly to the backtest service.
	if strings.HasPrefix(r.URL.Path, "/api/backtest/") {
		g.BacktestProxy.ServeHTTP(w, r)
		return
	}

	ctx := r.Context()
	rule, hasRule := RuleFor(r.URL.Path)

	// Pass through requests that match no rule (unknown paths).
	if !hasRule {
		g.Proxy.ServeHTTP(w, r)
		return
	}

	// Only cache GET requests with a positive TTL.
	shouldCache := rule.CacheTTL > 0 && r.Method == http.MethodGet

	// --- Cache check ---
	if shouldCache {
		if body, hit, err := g.Store.GetCache(ctx, r.URL.Path, r.URL.RawQuery); err == nil && hit {
			w.Header().Set("Content-Type", "application/json")
			w.Header().Set("X-Cache", "HIT")
			w.Write([]byte(body))
			return
		}
	}

	// --- Front door quota check (app-side limit, below the real API limit) ---
	if rule.API != "" {
		if q, ok := Quotas[rule.API]; ok && q.FrontDoorLimit > 0 {
			used, err := g.Store.CheckFrontDoorQuota(ctx, rule.API, q.Window)
			if err != nil {
				slog.Warn("front door quota check error", "api", rule.API, "error", err)
			} else if used >= q.FrontDoorLimit {
				w.Header().Set("Content-Type", "application/json")
				w.Header().Set("Retry-After", fmt.Sprintf("%d", int(q.Window.Seconds())))
				w.WriteHeader(http.StatusTooManyRequests)
				json.NewEncoder(w).Encode(map[string]any{
					"error":  "front door quota exhausted",
					"api":    rule.API,
					"used":   used,
					"limit":  q.FrontDoorLimit,
					"window": q.Window.String(),
				})
				return
			}
		}
	}

	// --- Real API quota check (hard ceiling imposed by the provider) ---
	if rule.API != "" {
		if q, ok := Quotas[rule.API]; ok {
			used, err := g.Store.CheckQuota(ctx, rule.API, q.Window)
			if err != nil {
				slog.Warn("quota check error", "api", rule.API, "error", err)
			} else if used >= q.Limit {
				w.Header().Set("Content-Type", "application/json")
				w.Header().Set("Retry-After", fmt.Sprintf("%d", int(q.Window.Seconds())))
				w.WriteHeader(http.StatusTooManyRequests)
				json.NewEncoder(w).Encode(map[string]any{
					"error":  "quota exhausted",
					"api":    rule.API,
					"used":   used,
					"limit":  q.Limit,
					"window": q.Window.String(),
				})
				return
			}
		}
	}

	// Attach the rule to the request context so ModifyResponse in the proxy
	// can access it when deciding what to cache and which quota to increment.
	r = r.WithContext(withRouteRule(ctx, rule))
	g.Proxy.ServeHTTP(w, r)
}

// HandleQuotaStatus serves GET /api/quota/status directly from Redis data.
func (g *Gateway) HandleQuotaStatus(w http.ResponseWriter, r *http.Request) {
	status := g.Store.AllQuotaStatus(r.Context())
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(status)
}

// NewBacktestProxy builds a simple reverse proxy to the backtest service with
// no caching or quota tracking.
func NewBacktestProxy(target *url.URL) *httputil.ReverseProxy {
	proxy := httputil.NewSingleHostReverseProxy(target)
	proxy.ErrorHandler = func(w http.ResponseWriter, r *http.Request, err error) {
		slog.Error("backtest proxy error", "path", r.URL.Path, "error", err)
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusBadGateway)
		json.NewEncoder(w).Encode(map[string]string{"error": "backtest service unavailable"})
	}
	return proxy
}

// NewProxy builds a reverse proxy targeting upstream that captures successful
// responses for caching and increments quota counters.
func NewProxy(target *url.URL, db *Store) *httputil.ReverseProxy {
	proxy := httputil.NewSingleHostReverseProxy(target)

	proxy.ModifyResponse = func(resp *http.Response) error {
		if resp.StatusCode != http.StatusOK {
			return nil
		}

		ctx := resp.Request.Context()
		rule, ok := routeRuleFromCtx(ctx)
		if !ok {
			return nil
		}

		// Increment both quota counters for the external API this route uses.
		if rule.API != "" {
			if q, ok := Quotas[rule.API]; ok {
				if _, err := db.IncrQuota(ctx, rule.API, q.Window); err != nil {
					slog.Warn("quota increment error", "api", rule.API, "error", err)
				}
				if q.FrontDoorLimit > 0 {
					if _, err := db.IncrFrontDoorQuota(ctx, rule.API, q.Window); err != nil {
						slog.Warn("front door quota increment error", "api", rule.API, "error", err)
					}
				}
			}
		}

		// Cache the response body for eligible GET requests.
		if rule.CacheTTL > 0 && resp.Request.Method == http.MethodGet {
			body, err := io.ReadAll(resp.Body)
			if err != nil {
				return err
			}
			resp.Body = io.NopCloser(bytes.NewReader(body))

			path := resp.Request.URL.Path
			query := resp.Request.URL.RawQuery
			if err := db.SetCache(ctx, path, query, string(body), rule.CacheTTL); err != nil {
				slog.Warn("cache write error", "path", path, "error", err)
			}
		}

		return nil
	}

	proxy.ErrorHandler = func(w http.ResponseWriter, r *http.Request, err error) {
		slog.Error("proxy error", "path", r.URL.Path, "error", err)
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusBadGateway)
		json.NewEncoder(w).Encode(map[string]string{"error": "upstream unavailable"})
	}

	return proxy
}

// --- context helpers (unexported — internal to this package) ---

type ctxKey struct{}

func withRouteRule(ctx context.Context, r RouteRule) context.Context {
	return context.WithValue(ctx, ctxKey{}, r)
}

func routeRuleFromCtx(ctx context.Context) (RouteRule, bool) {
	r, ok := ctx.Value(ctxKey{}).(RouteRule)
	return r, ok
}
