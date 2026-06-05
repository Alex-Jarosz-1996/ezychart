package main

import (
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"os"
	"strings"

	"backtest/strategies"

	"github.com/golang-jwt/jwt/v5"
)

var jwtSecret []byte

func main() {
	secret := os.Getenv("JWT_SECRET")
	if secret == "" {
		log.Fatal("JWT_SECRET env var is required")
	}
	jwtSecret = []byte(secret)

	mux := http.NewServeMux()
	mux.HandleFunc("/api/backtest/run", authMiddleware(handleRun))

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

func handleRun(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		jsonError(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}

	var req BacktestRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		jsonError(w, "invalid request body", http.StatusBadRequest)
		return
	}
	if len(req.Prices) == 0 {
		jsonError(w, "prices must not be empty", http.StatusBadRequest)
		return
	}
	if len(req.Strategies) == 0 {
		jsonError(w, "at least one strategy is required", http.StatusBadRequest)
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

	resp := BacktestResponse{Results: make(map[string]StrategyResult)}

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
		return nil, fmt.Errorf("unknown strategy: %s", strat)
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
