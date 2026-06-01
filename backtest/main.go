package main

import (
	"encoding/json"
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

	for _, strat := range req.Strategies {
		switch strat {
		case "sma":
			params := SMAParams{ShortPeriod: 20, LongPeriod: 50}
			if req.Params.SMA != nil {
				params = *req.Params.SMA
			}
			trades := strategies.SMA(closes, params.ShortPeriod, params.LongPeriod)
			resp.Results["sma"] = buildResult(trades, closes, dates)
		case "rsi":
			params := RSIParams{Period: 14, Overbought: 70, Oversold: 30}
			if req.Params.RSI != nil {
				params = *req.Params.RSI
			}
			trades := strategies.RSI(closes, params.Period, params.Overbought, params.Oversold)
			resp.Results["rsi"] = buildResult(trades, closes, dates)
		case "macd":
			params := MACDParams{FastPeriod: 12, SlowPeriod: 26, SignalPeriod: 9}
			if req.Params.MACD != nil {
				params = *req.Params.MACD
			}
			trades := strategies.MACD(closes, params.FastPeriod, params.SlowPeriod, params.SignalPeriod)
			resp.Results["macd"] = buildResult(trades, closes, dates)
		case "vmacd":
			params := VMACDParams{FastPeriod: 12, SlowPeriod: 26, SignalPeriod: 9}
			if req.Params.VMACD != nil {
				params = *req.Params.VMACD
			}
			trades := strategies.VMACD(closes, volumes, params.FastPeriod, params.SlowPeriod, params.SignalPeriod)
			resp.Results["vmacd"] = buildResult(trades, closes, dates)
		default:
			jsonError(w, "unknown strategy: "+strat, http.StatusBadRequest)
			return
		}
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(resp)
}

func buildResult(rawTrades []strategies.Trade, closes []float64, dates []string) StrategyResult {
	trades := make([]Trade, 0, len(rawTrades))
	signals := make([]Signal, 0, len(rawTrades)*2)
	totalProfit := 0.0

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
		totalProfit += profitPct
	}

	return StrategyResult{
		Trades:         trades,
		TotalProfitPct: totalProfit,
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
