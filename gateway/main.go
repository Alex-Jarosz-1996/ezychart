package main

import (
	"context"
	"encoding/hex"
	"encoding/json"
	"log/slog"
	"math/rand"
	"net/http"
	"net/url"
	"os"
	"strings"
	"time"

	"gateway/core"

	"github.com/golang-jwt/jwt/v5"
)

var jwtSecret []byte

// statusWriter captures the HTTP status code written by a handler.
type statusWriter struct {
	http.ResponseWriter
	status int
}

func (sw *statusWriter) WriteHeader(code int) {
	sw.status = code
	sw.ResponseWriter.WriteHeader(code)
}

// Flush propagates flushes so streaming responses (SSE, chunked) work through
// the middleware.
func (sw *statusWriter) Flush() {
	if f, ok := sw.ResponseWriter.(http.Flusher); ok {
		f.Flush()
	}
}

func newRequestID() string {
	b := make([]byte, 6)
	rand.Read(b) //nolint:gosec — request IDs need not be cryptographically random
	return hex.EncodeToString(b)
}

func loggingMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		reqID := r.Header.Get("X-Request-ID")
		if reqID == "" {
			reqID = newRequestID()
			r.Header.Set("X-Request-ID", reqID)
		}
		start := time.Now()
		sw := &statusWriter{ResponseWriter: w, status: http.StatusOK}
		next.ServeHTTP(sw, r)
		slog.Info("request",
			"request_id", reqID,
			"method", r.Method,
			"path", r.URL.Path,
			"status", sw.status,
			"ms", time.Since(start).Milliseconds(),
		)
	})
}

func main() {
	slog.SetDefault(slog.New(slog.NewJSONHandler(os.Stdout, &slog.HandlerOptions{
		Level: slog.LevelInfo,
	})))

	secret := os.Getenv("JWT_SECRET")
	if secret == "" {
		slog.Error("JWT_SECRET env var is required")
		os.Exit(1)
	}
	jwtSecret = []byte(secret)

	fastapiURL := getenv("FASTAPI_URL", "http://localhost:8000")
	backtestURL := getenv("BACKTEST_URL", "http://localhost:8090")
	redisAddr := getenv("REDIS_URL", "localhost:6379")

	db := core.NewStore(redisAddr)

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	if err := db.Ping(ctx); err != nil {
		slog.Error("cannot connect to Redis", "addr", redisAddr, "error", err)
		os.Exit(1)
	}
	slog.Info("connected to Redis", "addr", redisAddr)

	target, err := url.Parse(fastapiURL)
	if err != nil {
		slog.Error("invalid FASTAPI_URL", "url", fastapiURL, "error", err)
		os.Exit(1)
	}

	backtestTarget, err := url.Parse(backtestURL)
	if err != nil {
		slog.Error("invalid BACKTEST_URL", "url", backtestURL, "error", err)
		os.Exit(1)
	}

	gw := core.NewGateway(db, core.NewProxy(target, db), core.NewBacktestProxy(backtestTarget))

	mux := http.NewServeMux()
	mux.HandleFunc("/health", func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
	})
	mux.HandleFunc("/api/quota/status", authMiddleware(gw.HandleQuotaStatus))
	mux.HandleFunc("/api/", gw.HandleAPI)

	slog.Info("gateway listening", "addr", ":8080", "fastapi", fastapiURL, "backtest", backtestURL)
	if err := http.ListenAndServe(":8080", loggingMiddleware(mux)); err != nil {
		slog.Error("server error", "error", err)
		os.Exit(1)
	}
}

func authMiddleware(next http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		authHeader := r.Header.Get("Authorization")
		if !strings.HasPrefix(authHeader, "Bearer ") {
			jsonError(w, "missing token", http.StatusUnauthorized)
			return
		}
		tokenStr := strings.TrimPrefix(authHeader, "Bearer ")
		_, err := jwt.Parse(tokenStr, func(t *jwt.Token) (any, error) {
			if _, ok := t.Method.(*jwt.SigningMethodHMAC); !ok {
				return nil, jwt.ErrSignatureInvalid
			}
			return jwtSecret, nil
		})
		if err != nil {
			jsonError(w, "invalid token", http.StatusUnauthorized)
			return
		}
		next(w, r)
	}
}

func jsonError(w http.ResponseWriter, msg string, code int) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(code)
	json.NewEncoder(w).Encode(map[string]string{"error": msg})
}

func getenv(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}
