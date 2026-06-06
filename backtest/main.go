package main

import (
	"encoding/json"
	"fmt"
	"log"
	"net"
	"net/http"
	"os"
	"strings"
	"sync"
	"time"

	"backtest/strategies"

	"github.com/golang-jwt/jwt/v5"
)

const (
	backtestRateLimit  = 10
	backtestRateWindow = time.Minute
)

type ipWindow struct {
	count     int
	windowEnd time.Time
}

var (
	rateMu  sync.Mutex
	rateMap = make(map[string]*ipWindow)
)

var jwtSecret []byte

func allowRequest(ip string) bool {
	rateMu.Lock()
	defer rateMu.Unlock()
	now := time.Now()
	w, ok := rateMap[ip]
	if !ok || now.After(w.windowEnd) {
		rateMap[ip] = &ipWindow{count: 1, windowEnd: now.Add(backtestRateWindow)}
		return true
	}
	if w.count >= backtestRateLimit {
		return false
	}
	w.count++
	return true
}

func rateLimitMiddleware(next http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if !allowRequest(clientIP(r)) {
			w.Header().Set("Retry-After", "60")
			jsonError(w, "rate limit exceeded (10/minute)", http.StatusTooManyRequests)
			return
		}
		next(w, r)
	}
}

func clientIP(r *http.Request) string {
	if ip := r.Header.Get("X-Real-IP"); ip != "" {
		return ip
	}
	if fwd := r.Header.Get("X-Forwarded-For"); fwd != "" {
		if idx := strings.IndexByte(fwd, ','); idx >= 0 {
			return strings.TrimSpace(fwd[:idx])
		}
		return strings.TrimSpace(fwd)
	}
	host, _, err := net.SplitHostPort(r.RemoteAddr)
	if err != nil {
		return r.RemoteAddr
	}
	return host
}

func cleanupRateLimiter() {
	for range time.Tick(5 * time.Minute) {
		rateMu.Lock()
		now := time.Now()
		for ip, w := range rateMap {
			if now.After(w.windowEnd) {
				delete(rateMap, ip)
			}
		}
		rateMu.Unlock()
	}
}

func main() {
	secret := os.Getenv("JWT_SECRET")
	if secret == "" {
		log.Fatal("JWT_SECRET env var is required")
	}
	jwtSecret = []byte(secret)

	go cleanupRateLimiter()

	mux := http.NewServeMux()
	mux.HandleFunc("/api/backtest/run", rateLimitMiddleware(authMiddleware(handleRun)))

	port := getenv("PORT", "8090")
	log.Printf("backtest service listening on :%s", port)
	if err := http.ListenAndServe(":"+port, mux); err != nil {
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

func validateParams(strategies []string, p StrategyParams) error {
	for _, strat := range strategies {
		switch strat {
		case "sma":
			sp := SMAParams{ShortPeriod: 20, LongPeriod: 50}
			if p.SMA != nil {
				sp = *p.SMA
			}
			if sp.ShortPeriod < 1 || sp.ShortPeriod > 200 {
				return fmt.Errorf("sma short_period must be between 1 and 200")
			}
			if sp.LongPeriod < 1 || sp.LongPeriod > 500 {
				return fmt.Errorf("sma long_period must be between 1 and 500")
			}
			if sp.ShortPeriod >= sp.LongPeriod {
				return fmt.Errorf("sma short_period must be less than long_period")
			}
		case "rsi":
			rp := RSIParams{Period: 14, Overbought: 70, Oversold: 30}
			if p.RSI != nil {
				rp = *p.RSI
			}
			if rp.Period < 2 || rp.Period > 100 {
				return fmt.Errorf("rsi period must be between 2 and 100")
			}
			if rp.Overbought < 50 || rp.Overbought > 100 {
				return fmt.Errorf("rsi overbought must be between 50 and 100")
			}
			if rp.Oversold < 0 || rp.Oversold > 50 {
				return fmt.Errorf("rsi oversold must be between 0 and 50")
			}
			if rp.Oversold >= rp.Overbought {
				return fmt.Errorf("rsi oversold must be less than overbought")
			}
		case "macd", "vmacd":
			fast, slow, signal := 12, 26, 9
			if strat == "macd" && p.MACD != nil {
				fast, slow, signal = p.MACD.FastPeriod, p.MACD.SlowPeriod, p.MACD.SignalPeriod
			} else if strat == "vmacd" && p.VMACD != nil {
				fast, slow, signal = p.VMACD.FastPeriod, p.VMACD.SlowPeriod, p.VMACD.SignalPeriod
			}
			if fast < 1 || fast > 100 {
				return fmt.Errorf("%s fast_period must be between 1 and 100", strat)
			}
			if slow < 2 || slow > 200 {
				return fmt.Errorf("%s slow_period must be between 2 and 200", strat)
			}
			if signal < 1 || signal > 100 {
				return fmt.Errorf("%s signal_period must be between 1 and 100", strat)
			}
			if fast >= slow {
				return fmt.Errorf("%s fast_period must be less than slow_period", strat)
			}
		}
	}
	return nil
}

func handleRun(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		jsonError(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}

	r.Body = http.MaxBytesReader(w, r.Body, 512*1024)
	var req BacktestRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		jsonError(w, "invalid request body", http.StatusBadRequest)
		return
	}
	if len(req.Prices) == 0 {
		jsonError(w, "prices must not be empty", http.StatusBadRequest)
		return
	}
	if len(req.Prices) > 2000 {
		jsonError(w, "too many price points (max 2000)", http.StatusBadRequest)
		return
	}
	if len(req.Strategies) == 0 {
		jsonError(w, "at least one strategy is required", http.StatusBadRequest)
		return
	}
	if len(req.Strategies) > 4 {
		jsonError(w, "too many strategies (max 4)", http.StatusBadRequest)
		return
	}
	if err := validateParams(req.Strategies, req.Params); err != nil {
		jsonError(w, err.Error(), http.StatusBadRequest)
		return
	}

	closes := make([]float64, len(req.Prices))
	volumes := make([]float64, len(req.Prices))
	dates := make([]string, len(req.Prices))
	for i, p := range req.Prices {
		closes[i] = p.Close
		volumes[i] = p.Volume
		dates[i] = p.Date
	}

	buyAndHoldPct := 0.0
	if len(closes) > 1 && closes[0] != 0 {
		buyAndHoldPct = (closes[len(closes)-1]/closes[0] - 1) * 100
	}
	resp := BacktestResponse{Results: make(map[string]StrategyResult), BuyAndHoldPct: buyAndHoldPct}

	if len(req.Strategies) == 1 {
		strat := req.Strategies[0]
		trades, err := runStrategy(strat, closes, volumes, req.Params)
		if err != nil {
			jsonError(w, err.Error(), http.StatusBadRequest)
			return
		}
		resp.Results[strat] = buildResult(trades, closes, dates)
	} else {
		// Multiple strategies: only trade when ALL are simultaneously in a position.
		allTrades := make([][]strategies.Trade, 0, len(req.Strategies))
		for _, strat := range req.Strategies {
			trades, err := runStrategy(strat, closes, volumes, req.Params)
			if err != nil {
				jsonError(w, err.Error(), http.StatusBadRequest)
				return
			}
			allTrades = append(allTrades, trades)
		}
		resp.Results["combined"] = buildResult(intersectPositions(allTrades, len(closes)), closes, dates)
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(resp)
}

// runStrategy executes a single named strategy and returns its raw trades.
func runStrategy(strat string, closes, volumes []float64, params StrategyParams) ([]strategies.Trade, error) {
	switch strat {
	case "sma":
		p := SMAParams{ShortPeriod: 20, LongPeriod: 50}
		if params.SMA != nil {
			p = *params.SMA
		}
		return strategies.SMA(closes, p.ShortPeriod, p.LongPeriod), nil
	case "rsi":
		p := RSIParams{Period: 14, Overbought: 70, Oversold: 30}
		if params.RSI != nil {
			p = *params.RSI
		}
		return strategies.RSI(closes, p.Period, p.Overbought, p.Oversold), nil
	case "macd":
		p := MACDParams{FastPeriod: 12, SlowPeriod: 26, SignalPeriod: 9}
		if params.MACD != nil {
			p = *params.MACD
		}
		return strategies.MACD(closes, p.FastPeriod, p.SlowPeriod, p.SignalPeriod), nil
	case "vmacd":
		p := VMACDParams{FastPeriod: 12, SlowPeriod: 26, SignalPeriod: 9}
		if params.VMACD != nil {
			p = *params.VMACD
		}
		return strategies.VMACD(closes, volumes, p.FastPeriod, p.SlowPeriod, p.SignalPeriod), nil
	default:
		return nil, fmt.Errorf("unknown strategy")
	}
}

// intersectPositions builds a combined trade list where a position is held only
// when ALL individual strategies are simultaneously in a position (AND logic).
func intersectPositions(allTrades [][]strategies.Trade, n int) []strategies.Trade {
	if len(allTrades) == 0 {
		return nil
	}

	// Build a per-candle boolean mask for each strategy.
	masks := make([][]bool, len(allTrades))
	for i, trades := range allTrades {
		mask := make([]bool, n)
		for _, t := range trades {
			for j := t.BuyIdx; j <= t.SellIdx; j++ {
				mask[j] = true
			}
		}
		masks[i] = mask
	}

	// A combined position is active on candle i only when every mask is true.
	var result []strategies.Trade
	inPosition := false
	buyIdx := 0

	for i := range n {
		allIn := true
		for _, mask := range masks {
			if !mask[i] {
				allIn = false
				break
			}
		}
		if allIn && !inPosition {
			buyIdx = i
			inPosition = true
		} else if !allIn && inPosition {
			result = append(result, strategies.Trade{BuyIdx: buyIdx, SellIdx: i - 1})
			inPosition = false
		}
	}
	if inPosition {
		result = append(result, strategies.Trade{BuyIdx: buyIdx, SellIdx: n - 1})
	}

	return result
}

func buildResult(rawTrades []strategies.Trade, closes []float64, dates []string) StrategyResult {
	trades := make([]Trade, 0, len(rawTrades))
	signals := make([]Signal, 0, len(rawTrades)*2)
	compoundMultiplier := 1.0

	for _, t := range rawTrades {
		profitPct := (closes[t.SellIdx] - closes[t.BuyIdx]) / closes[t.BuyIdx] * 100
		trades = append(trades, Trade{
			BuyDate:   dates[t.BuyIdx],
			BuyPrice:  closes[t.BuyIdx],
			SellDate:  dates[t.SellIdx],
			SellPrice: closes[t.SellIdx],
			ProfitPct: profitPct,
		})
		signals = append(signals,
			Signal{Date: dates[t.BuyIdx], Type: "buy", Price: closes[t.BuyIdx]},
			Signal{Date: dates[t.SellIdx], Type: "sell", Price: closes[t.SellIdx]},
		)
		compoundMultiplier *= 1 + profitPct/100
	}

	return StrategyResult{
		Trades:         trades,
		TotalProfitPct: (compoundMultiplier - 1) * 100,
		Signals:        signals,
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
