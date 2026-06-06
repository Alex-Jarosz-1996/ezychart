package main

import (
	"bytes"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"backtest/strategies"

	"github.com/golang-jwt/jwt/v5"
)

func init() {
	jwtSecret = []byte("test-secret")
}

// --- helpers ---

func makeToken(t *testing.T) string {
	t.Helper()
	tok := jwt.NewWithClaims(jwt.SigningMethodHS256, jwt.MapClaims{
		"exp": time.Now().Add(time.Hour).Unix(),
	})
	s, err := tok.SignedString(jwtSecret)
	if err != nil {
		t.Fatalf("sign token: %v", err)
	}
	return s
}

func postRun(t *testing.T, body any, token string) *httptest.ResponseRecorder {
	t.Helper()
	b, _ := json.Marshal(body)
	req := httptest.NewRequest(http.MethodPost, "/api/backtest/run", bytes.NewReader(b))
	req.Header.Set("Content-Type", "application/json")
	if token != "" {
		req.Header.Set("Authorization", "Bearer "+token)
	}
	w := httptest.NewRecorder()
	authMiddleware(handleRun)(w, req)
	return w
}

func linearPrices(n int) []PricePoint {
	pp := make([]PricePoint, n)
	for i := range pp {
		pp[i] = PricePoint{
			Date:   fmt.Sprintf("2024-01-%03d", i+1),
			Close:  100.0 + float64(i),
			Volume: 1_000_000,
		}
	}
	return pp
}

// --- allowRequest ---

func TestAllowRequest_NewIP(t *testing.T) {
	rateMu.Lock()
	rateMap = make(map[string]*ipWindow)
	rateMu.Unlock()

	if !allowRequest("1.2.3.4") {
		t.Fatal("expected first request to be allowed")
	}
}

func TestAllowRequest_Exhausted(t *testing.T) {
	rateMu.Lock()
	rateMap = make(map[string]*ipWindow)
	rateMu.Unlock()

	ip := "2.3.4.5"
	for i := range backtestRateLimit {
		if !allowRequest(ip) {
			t.Fatalf("request %d should be allowed", i+1)
		}
	}
	if allowRequest(ip) {
		t.Fatal("expected request after limit to be denied")
	}
}

func TestAllowRequest_WindowReset(t *testing.T) {
	rateMu.Lock()
	rateMap = map[string]*ipWindow{
		"3.4.5.6": {count: backtestRateLimit, windowEnd: time.Now().Add(-time.Minute)},
	}
	rateMu.Unlock()

	if !allowRequest("3.4.5.6") {
		t.Fatal("expected request after window expiry to be allowed")
	}
}

// --- clientIP ---

func TestClientIP_XRealIP(t *testing.T) {
	req := httptest.NewRequest(http.MethodGet, "/", nil)
	req.Header.Set("X-Real-IP", "10.0.0.1")
	req.Header.Set("X-Forwarded-For", "10.0.0.2")
	if got := clientIP(req); got != "10.0.0.1" {
		t.Fatalf("want 10.0.0.1, got %s", got)
	}
}

func TestClientIP_XForwardedFor(t *testing.T) {
	req := httptest.NewRequest(http.MethodGet, "/", nil)
	req.Header.Set("X-Forwarded-For", "10.0.0.2, 10.0.0.3")
	if got := clientIP(req); got != "10.0.0.2" {
		t.Fatalf("want 10.0.0.2, got %s", got)
	}
}

func TestClientIP_RemoteAddr(t *testing.T) {
	req := httptest.NewRequest(http.MethodGet, "/", nil)
	req.RemoteAddr = "10.0.0.3:12345"
	if got := clientIP(req); got != "10.0.0.3" {
		t.Fatalf("want 10.0.0.3, got %s", got)
	}
}

// --- validateParams ---

func TestValidateParams_SMADefaults(t *testing.T) {
	if err := validateParams([]string{"sma"}, StrategyParams{}); err != nil {
		t.Fatalf("unexpected error with SMA defaults: %v", err)
	}
}

func TestValidateParams_SMAValid(t *testing.T) {
	p := StrategyParams{SMA: &SMAParams{ShortPeriod: 10, LongPeriod: 30}}
	if err := validateParams([]string{"sma"}, p); err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
}

func TestValidateParams_SMAShortGELong(t *testing.T) {
	p := StrategyParams{SMA: &SMAParams{ShortPeriod: 50, LongPeriod: 20}}
	if err := validateParams([]string{"sma"}, p); err == nil {
		t.Fatal("expected error: short >= long")
	}
}

func TestValidateParams_SMAEqualPeriods(t *testing.T) {
	p := StrategyParams{SMA: &SMAParams{ShortPeriod: 20, LongPeriod: 20}}
	if err := validateParams([]string{"sma"}, p); err == nil {
		t.Fatal("expected error: short == long")
	}
}

func TestValidateParams_SMAShortOutOfRange(t *testing.T) {
	p := StrategyParams{SMA: &SMAParams{ShortPeriod: 0, LongPeriod: 50}}
	if err := validateParams([]string{"sma"}, p); err == nil {
		t.Fatal("expected error: short_period < 1")
	}
}

func TestValidateParams_RSIDefaults(t *testing.T) {
	if err := validateParams([]string{"rsi"}, StrategyParams{}); err != nil {
		t.Fatalf("unexpected error with RSI defaults: %v", err)
	}
}

func TestValidateParams_RSIOversoldGEOverbought(t *testing.T) {
	p := StrategyParams{RSI: &RSIParams{Period: 14, Overbought: 30, Oversold: 70}}
	if err := validateParams([]string{"rsi"}, p); err == nil {
		t.Fatal("expected error: oversold >= overbought")
	}
}

func TestValidateParams_RSIPeriodTooLow(t *testing.T) {
	p := StrategyParams{RSI: &RSIParams{Period: 1, Overbought: 70, Oversold: 30}}
	if err := validateParams([]string{"rsi"}, p); err == nil {
		t.Fatal("expected error: period < 2")
	}
}

func TestValidateParams_MACDDefaults(t *testing.T) {
	if err := validateParams([]string{"macd"}, StrategyParams{}); err != nil {
		t.Fatalf("unexpected error with MACD defaults: %v", err)
	}
}

func TestValidateParams_MACDFastGESlow(t *testing.T) {
	p := StrategyParams{MACD: &MACDParams{FastPeriod: 26, SlowPeriod: 12, SignalPeriod: 9}}
	if err := validateParams([]string{"macd"}, p); err == nil {
		t.Fatal("expected error: fast >= slow")
	}
}

func TestValidateParams_VMACDDefaults(t *testing.T) {
	if err := validateParams([]string{"vmacd"}, StrategyParams{}); err != nil {
		t.Fatalf("unexpected error with VMACD defaults: %v", err)
	}
}

// --- intersectPositions ---

func TestIntersectPositions_NoOverlap(t *testing.T) {
	allTrades := [][]strategies.Trade{
		{{BuyIdx: 0, SellIdx: 4}},
		{{BuyIdx: 6, SellIdx: 9}},
	}
	result := intersectPositions(allTrades, 10)
	if len(result) != 0 {
		t.Fatalf("expected no trades, got %d", len(result))
	}
}

func TestIntersectPositions_FullOverlap(t *testing.T) {
	allTrades := [][]strategies.Trade{
		{{BuyIdx: 2, SellIdx: 7}},
		{{BuyIdx: 1, SellIdx: 8}},
	}
	result := intersectPositions(allTrades, 10)
	if len(result) != 1 {
		t.Fatalf("expected 1 trade, got %d", len(result))
	}
	if result[0].BuyIdx != 2 || result[0].SellIdx != 7 {
		t.Fatalf("expected [2,7], got [%d,%d]", result[0].BuyIdx, result[0].SellIdx)
	}
}

func TestIntersectPositions_PartialOverlap(t *testing.T) {
	allTrades := [][]strategies.Trade{
		{{BuyIdx: 0, SellIdx: 5}},
		{{BuyIdx: 3, SellIdx: 9}},
	}
	result := intersectPositions(allTrades, 10)
	if len(result) != 1 {
		t.Fatalf("expected 1 trade, got %d", len(result))
	}
	if result[0].BuyIdx != 3 || result[0].SellIdx != 5 {
		t.Fatalf("expected [3,5], got [%d,%d]", result[0].BuyIdx, result[0].SellIdx)
	}
}

func TestIntersectPositions_NilInput(t *testing.T) {
	result := intersectPositions(nil, 10)
	if result != nil {
		t.Fatalf("expected nil, got %v", result)
	}
}

// --- buildResult ---

func TestBuildResult_SingleTradeProfit(t *testing.T) {
	closes := []float64{100.0, 110.0, 105.0}
	dates := []string{"2024-01-01", "2024-01-02", "2024-01-03"}
	trades := []strategies.Trade{{BuyIdx: 0, SellIdx: 1}}

	result := buildResult(trades, closes, dates)

	if len(result.Trades) != 1 {
		t.Fatalf("expected 1 trade, got %d", len(result.Trades))
	}
	if got := result.Trades[0].ProfitPct; got < 9.9 || got > 10.1 {
		t.Fatalf("expected ~10%% profit, got %.4f", got)
	}
	if result.TotalProfitPct < 9.9 || result.TotalProfitPct > 10.1 {
		t.Fatalf("expected ~10%% total profit, got %.4f", result.TotalProfitPct)
	}
}

func TestBuildResult_BuySellSignals(t *testing.T) {
	closes := []float64{100.0, 110.0}
	dates := []string{"2024-01-01", "2024-01-02"}
	trades := []strategies.Trade{{BuyIdx: 0, SellIdx: 1}}

	result := buildResult(trades, closes, dates)

	if len(result.Signals) != 2 {
		t.Fatalf("expected 2 signals, got %d", len(result.Signals))
	}
	if result.Signals[0].Type != "buy" {
		t.Fatalf("expected first signal type 'buy', got %q", result.Signals[0].Type)
	}
	if result.Signals[1].Type != "sell" {
		t.Fatalf("expected second signal type 'sell', got %q", result.Signals[1].Type)
	}
	if result.Signals[0].Price != 100.0 {
		t.Fatalf("expected buy signal price 100, got %.2f", result.Signals[0].Price)
	}
}

func TestBuildResult_CompoundProfit(t *testing.T) {
	// Two consecutive +10% trades → 1.1 × 1.1 = 1.21 → 21% compound
	closes := []float64{100.0, 110.0, 121.0}
	dates := []string{"d1", "d2", "d3"}
	trades := []strategies.Trade{
		{BuyIdx: 0, SellIdx: 1},
		{BuyIdx: 1, SellIdx: 2},
	}

	result := buildResult(trades, closes, dates)

	if result.TotalProfitPct < 20.9 || result.TotalProfitPct > 21.1 {
		t.Fatalf("expected ~21%% compound profit, got %.4f", result.TotalProfitPct)
	}
}

func TestBuildResult_NoTrades(t *testing.T) {
	closes := []float64{100.0, 110.0}
	dates := []string{"d1", "d2"}

	result := buildResult(nil, closes, dates)

	if len(result.Trades) != 0 {
		t.Fatalf("expected 0 trades, got %d", len(result.Trades))
	}
	if result.TotalProfitPct != 0 {
		t.Fatalf("expected 0%% total profit with no trades, got %.4f", result.TotalProfitPct)
	}
}

// --- handleRun HTTP ---

func TestHandleRun_NoToken(t *testing.T) {
	w := postRun(t, map[string]any{}, "")
	if w.Code != http.StatusUnauthorized {
		t.Fatalf("expected 401, got %d", w.Code)
	}
}

func TestHandleRun_InvalidToken(t *testing.T) {
	w := postRun(t, map[string]any{}, "not-a-jwt")
	if w.Code != http.StatusUnauthorized {
		t.Fatalf("expected 401, got %d", w.Code)
	}
}

func TestHandleRun_MethodNotAllowed(t *testing.T) {
	tok := makeToken(t)
	req := httptest.NewRequest(http.MethodGet, "/api/backtest/run", nil)
	req.Header.Set("Authorization", "Bearer "+tok)
	w := httptest.NewRecorder()
	authMiddleware(handleRun)(w, req)
	if w.Code != http.StatusMethodNotAllowed {
		t.Fatalf("expected 405, got %d", w.Code)
	}
}

func TestHandleRun_EmptyPrices(t *testing.T) {
	tok := makeToken(t)
	body := map[string]any{"prices": []PricePoint{}, "strategies": []string{"sma"}}
	w := postRun(t, body, tok)
	if w.Code != http.StatusBadRequest {
		t.Fatalf("expected 400, got %d", w.Code)
	}
}

func TestHandleRun_TooManyPrices(t *testing.T) {
	tok := makeToken(t)
	body := map[string]any{"prices": linearPrices(2001), "strategies": []string{"sma"}}
	w := postRun(t, body, tok)
	if w.Code != http.StatusBadRequest {
		t.Fatalf("expected 400, got %d", w.Code)
	}
}

func TestHandleRun_NoStrategies(t *testing.T) {
	tok := makeToken(t)
	body := map[string]any{"prices": linearPrices(60), "strategies": []string{}}
	w := postRun(t, body, tok)
	if w.Code != http.StatusBadRequest {
		t.Fatalf("expected 400, got %d", w.Code)
	}
}

func TestHandleRun_TooManyStrategies(t *testing.T) {
	tok := makeToken(t)
	body := map[string]any{
		"prices":     linearPrices(100),
		"strategies": []string{"sma", "rsi", "macd", "vmacd", "sma"},
	}
	w := postRun(t, body, tok)
	if w.Code != http.StatusBadRequest {
		t.Fatalf("expected 400, got %d", w.Code)
	}
}

func TestHandleRun_InvalidSMAParams(t *testing.T) {
	tok := makeToken(t)
	body := BacktestRequest{
		Prices:     linearPrices(100),
		Strategies: []string{"sma"},
		Params:     StrategyParams{SMA: &SMAParams{ShortPeriod: 50, LongPeriod: 20}},
	}
	w := postRun(t, body, tok)
	if w.Code != http.StatusBadRequest {
		t.Fatalf("expected 400, got %d: %s", w.Code, w.Body.String())
	}
}

func TestHandleRun_UnknownStrategy(t *testing.T) {
	tok := makeToken(t)
	body := map[string]any{"prices": linearPrices(100), "strategies": []string{"bollinger"}}
	w := postRun(t, body, tok)
	if w.Code != http.StatusBadRequest {
		t.Fatalf("expected 400, got %d", w.Code)
	}
}

func TestHandleRun_ValidSMASingleStrategy(t *testing.T) {
	tok := makeToken(t)
	body := BacktestRequest{
		Prices:     linearPrices(100),
		Strategies: []string{"sma"},
	}
	w := postRun(t, body, tok)
	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", w.Code, w.Body.String())
	}

	var resp BacktestResponse
	if err := json.NewDecoder(w.Body).Decode(&resp); err != nil {
		t.Fatalf("decode response: %v", err)
	}
	if _, ok := resp.Results["sma"]; !ok {
		t.Fatal("expected 'sma' key in results")
	}
}

func TestHandleRun_MultipleStrategiesReturnsCombined(t *testing.T) {
	tok := makeToken(t)
	body := BacktestRequest{
		Prices:     linearPrices(100),
		Strategies: []string{"sma", "rsi"},
	}
	w := postRun(t, body, tok)
	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", w.Code, w.Body.String())
	}

	var resp BacktestResponse
	if err := json.NewDecoder(w.Body).Decode(&resp); err != nil {
		t.Fatalf("decode response: %v", err)
	}
	if _, ok := resp.Results["combined"]; !ok {
		t.Fatal("expected 'combined' key in results for multi-strategy run")
	}
}

func TestHandleRun_BuyAndHoldCalculation(t *testing.T) {
	tok := makeToken(t)
	// close[0]=100, close[59]=159 → buy-and-hold = 59%
	body := BacktestRequest{
		Prices:     linearPrices(60),
		Strategies: []string{"sma"},
	}
	w := postRun(t, body, tok)
	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", w.Code)
	}

	var resp BacktestResponse
	json.NewDecoder(w.Body).Decode(&resp)
	if resp.BuyAndHoldPct < 58.9 || resp.BuyAndHoldPct > 59.1 {
		t.Fatalf("expected ~59%% buy-and-hold, got %.4f", resp.BuyAndHoldPct)
	}
}

func TestHandleRun_ValidRSI(t *testing.T) {
	tok := makeToken(t)
	body := BacktestRequest{
		Prices:     linearPrices(60),
		Strategies: []string{"rsi"},
	}
	w := postRun(t, body, tok)
	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", w.Code, w.Body.String())
	}
}

func TestHandleRun_ValidMACD(t *testing.T) {
	tok := makeToken(t)
	body := BacktestRequest{
		Prices:     linearPrices(100),
		Strategies: []string{"macd"},
	}
	w := postRun(t, body, tok)
	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", w.Code, w.Body.String())
	}
}

func TestHandleRun_ValidVMACD(t *testing.T) {
	tok := makeToken(t)
	body := BacktestRequest{
		Prices:     linearPrices(100),
		Strategies: []string{"vmacd"},
	}
	w := postRun(t, body, tok)
	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", w.Code, w.Body.String())
	}
}
