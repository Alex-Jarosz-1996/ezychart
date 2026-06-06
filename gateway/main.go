package main

import (
	"context"
	"encoding/json"
	"log"
	"net/http"
	"net/url"
	"os"
	"strings"
	"time"

	"gateway/core"

	"github.com/golang-jwt/jwt/v5"
)

var jwtSecret []byte

func main() {
	secret := os.Getenv("JWT_SECRET")
	if secret == "" {
		log.Fatal("JWT_SECRET env var is required")
	}
	jwtSecret = []byte(secret)

	fastapiURL := getenv("FASTAPI_URL", "http://localhost:8000")
	backtestURL := getenv("BACKTEST_URL", "http://localhost:8090")
	redisAddr := getenv("REDIS_URL", "localhost:6379")

	db := core.NewStore(redisAddr)

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	if err := db.Ping(ctx); err != nil {
		log.Fatalf("cannot connect to Redis at %s: %v", redisAddr, err)
	}
	log.Printf("connected to Redis at %s", redisAddr)

	target, err := url.Parse(fastapiURL)
	if err != nil {
		log.Fatalf("invalid FASTAPI_URL %q: %v", fastapiURL, err)
	}

	backtestTarget, err := url.Parse(backtestURL)
	if err != nil {
		log.Fatalf("invalid BACKTEST_URL %q: %v", backtestURL, err)
	}

	gw := core.NewGateway(db, core.NewProxy(target, db), core.NewBacktestProxy(backtestTarget))

	mux := http.NewServeMux()
	mux.HandleFunc("/health", func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
	})
	mux.HandleFunc("/api/quota/status", authMiddleware(gw.HandleQuotaStatus))
	mux.HandleFunc("/api/", gw.HandleAPI)

	log.Printf("gateway listening on :8080 → FastAPI at %s, backtest at %s", fastapiURL, backtestURL)
	if err := http.ListenAndServe(":8080", mux); err != nil {
		log.Fatal(err)
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
