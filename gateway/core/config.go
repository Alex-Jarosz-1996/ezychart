package core

import "time"

// ApiQuota defines the rate limits for a single external API.
// Limit is the hard ceiling imposed by the API provider.
// FrontDoorLimit is the app-side limit, set below Limit to create a safety
// buffer — the gateway stops accepting requests for this API before the real
// quota is exhausted.
type ApiQuota struct {
	Limit          int64
	FrontDoorLimit int64
	Window         time.Duration
}

// RouteRule maps a URL path prefix to the external API it calls and how long
// its responses should be cached. An empty API means no quota is tracked.
// A zero CacheTTL means the response is not cached.
type RouteRule struct {
	API      string
	CacheTTL time.Duration
}

// Quotas defines the free-tier limits for each external API.
var Quotas = map[string]ApiQuota{
	"finnhub":   {Limit: 30, FrontDoorLimit: 25, Window: time.Second},
	"fmp":       {Limit: 250, FrontDoorLimit: 200, Window: 24 * time.Hour},
	"stockdata": {Limit: 100, FrontDoorLimit: 80, Window: 24 * time.Hour},
	"massive":   {Limit: 5, FrontDoorLimit: 4, Window: time.Minute},
}

// routeRules maps path prefixes to their RouteRule. Evaluated in order so
// more specific prefixes must appear before shorter ones.
var routeRules = []struct {
	prefix string
	rule   RouteRule
}{
	{"/api/chart/eod-candle/", RouteRule{API: "fmp", CacheTTL: 24 * time.Hour}},
	{"/api/chart/eod/", RouteRule{API: "fmp", CacheTTL: 24 * time.Hour}},
	{"/api/chart/intraday/", RouteRule{API: "stockdata", CacheTTL: 5 * time.Minute}},
	{"/api/options/", RouteRule{API: "massive", CacheTTL: 5 * time.Minute}},
	{"/api/quote/", RouteRule{API: "finnhub", CacheTTL: 15 * time.Minute}},
	{"/api/financials/", RouteRule{API: "finnhub", CacheTTL: 15 * time.Minute}},
	{"/api/backtest/", RouteRule{API: "", CacheTTL: 0}}, // Backtest: pure compute, no quota, no cache
	{"/api/chat", RouteRule{API: "", CacheTTL: 0}},      // AI chat: no quota (Gemini free tier is generous), no cache (responses are dynamic)
	{"/api/auth/", RouteRule{API: "", CacheTTL: 0}},     // Auth: no quota, no cache
}

// RuleFor returns the RouteRule for the given request path, and whether a
// matching rule was found.
func RuleFor(path string) (RouteRule, bool) {
	for _, entry := range routeRules {
		if len(path) >= len(entry.prefix) && path[:len(entry.prefix)] == entry.prefix {
			return entry.rule, true
		}
		// exact match (e.g. /api/chat has no trailing slash)
		if path == entry.prefix {
			return entry.rule, true
		}
	}
	return RouteRule{}, false
}
