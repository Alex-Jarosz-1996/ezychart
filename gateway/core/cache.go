package core

import (
	"context"
	"fmt"
	"time"

	"github.com/redis/go-redis/v9"
)

// Store holds the Redis client used for both response caching and quota tracking.
type Store struct {
	rdb *redis.Client
}

// NewStore creates a Store connected to the Redis instance at the given URL.
// Accepts full redis:// URLs (including password) or plain host:port addresses.
func NewStore(redisURL string) *Store {
	opt, err := redis.ParseURL(redisURL)
	if err != nil {
		opt = &redis.Options{Addr: redisURL}
	}
	return &Store{rdb: redis.NewClient(opt)}
}

// Ping checks the Redis connection. Used for startup health checks.
func (s *Store) Ping(ctx context.Context) error {
	return s.rdb.Ping(ctx).Err()
}

// --- Response cache ---

// CacheKey returns the Redis key for a cached API response.
func CacheKey(path, query string) string {
	if query != "" {
		return "cache:" + path + "?" + query
	}
	return "cache:" + path
}

// GetCache returns the cached response body for the given path and query.
// Returns ("", false, nil) on a cache miss.
func (s *Store) GetCache(ctx context.Context, path, query string) (string, bool, error) {
	val, err := s.rdb.Get(ctx, CacheKey(path, query)).Result()
	if err == redis.Nil {
		return "", false, nil
	}
	if err != nil {
		return "", false, err
	}
	return val, true, nil
}

// SetCache stores a response body in Redis with the given TTL.
func (s *Store) SetCache(ctx context.Context, path, query, body string, ttl time.Duration) error {
	return s.rdb.Set(ctx, CacheKey(path, query), body, ttl).Err()
}

// --- Quota tracking (shared internals) ---

// buildQuotaKey constructs a Redis key scoped to a time window.
// prefix distinguishes real quota keys ("quota") from front door keys ("quotafd").
func buildQuotaKey(prefix, api string, window time.Duration) string {
	now := time.Now().UTC()
	switch {
	case window >= 24*time.Hour:
		return fmt.Sprintf("%s:%s:%s", prefix, api, now.Format("2006-01-02"))
	case window >= time.Minute:
		return fmt.Sprintf("%s:%s:%s", prefix, api, now.Format("2006-01-02T15:04"))
	default:
		return fmt.Sprintf("%s:%s:%s", prefix, api, now.Format("2006-01-02T15:04:05"))
	}
}

func (s *Store) checkQuotaByKey(ctx context.Context, key string) (int64, error) {
	val, err := s.rdb.Get(ctx, key).Int64()
	if err == redis.Nil {
		return 0, nil
	}
	return val, err
}

func (s *Store) incrQuotaByKey(ctx context.Context, key string, window time.Duration) (int64, error) {
	count, err := s.rdb.Incr(ctx, key).Result()
	if err != nil {
		return 0, err
	}
	// Set expiry only on first increment. A small buffer prevents the key from
	// expiring mid-window due to clock skew.
	if count == 1 {
		s.rdb.Expire(ctx, key, window+window/10)
	}
	return count, nil
}

// --- Real API quota (tracks against the provider's hard limit) ---

// QuotaKey returns the Redis key for an API's real quota counter.
func QuotaKey(api string, window time.Duration) string {
	return buildQuotaKey("quota", api, window)
}

// CheckQuota returns the current real quota usage for an API.
func (s *Store) CheckQuota(ctx context.Context, api string, window time.Duration) (int64, error) {
	return s.checkQuotaByKey(ctx, QuotaKey(api, window))
}

// IncrQuota increments the real quota counter and returns the new count.
func (s *Store) IncrQuota(ctx context.Context, api string, window time.Duration) (int64, error) {
	return s.incrQuotaByKey(ctx, QuotaKey(api, window), window)
}

// --- Front door quota (app-side limit, below the real API limit) ---

// FrontDoorQuotaKey returns the Redis key for an API's front door quota counter.
func FrontDoorQuotaKey(api string, window time.Duration) string {
	return buildQuotaKey("quotafd", api, window)
}

// CheckFrontDoorQuota returns the current front door quota usage for an API.
func (s *Store) CheckFrontDoorQuota(ctx context.Context, api string, window time.Duration) (int64, error) {
	return s.checkQuotaByKey(ctx, FrontDoorQuotaKey(api, window))
}

// IncrFrontDoorQuota increments the front door quota counter and returns the new count.
func (s *Store) IncrFrontDoorQuota(ctx context.Context, api string, window time.Duration) (int64, error) {
	return s.incrQuotaByKey(ctx, FrontDoorQuotaKey(api, window), window)
}

// --- Status ---

// AllQuotaStatus returns usage for every tracked API including both front door
// and real quota counters.
func (s *Store) AllQuotaStatus(ctx context.Context) map[string]map[string]any {
	result := make(map[string]map[string]any, len(Quotas))
	for api, q := range Quotas {
		realUsed, _ := s.CheckQuota(ctx, api, q.Window)
		fdUsed, _ := s.CheckFrontDoorQuota(ctx, api, q.Window)
		result[api] = map[string]any{
			"used":           realUsed,
			"limit":          q.Limit,
			"frontDoorUsed":  fdUsed,
			"frontDoorLimit": q.FrontDoorLimit,
			"window":         q.Window.String(),
		}
	}
	return result
}
