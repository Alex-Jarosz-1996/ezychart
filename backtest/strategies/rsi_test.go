package strategies_test

import (
	"testing"

	"backtest/strategies"
)

func TestRSITradeOrder(t *testing.T) {
	// 60 prices: first 30 declining (oversold region), then 30 rising (overbought region).
	closes := make([]float64, 60)
	for i := 0; i < 30; i++ {
		closes[i] = 100 - float64(i)*2 // 100 → 42, strong decline drives RSI low
	}
	for i := 30; i < 60; i++ {
		closes[i] = closes[29] + float64(i-29)*2 // recovery drives RSI high
	}

	trades := strategies.RSI(closes, 14, 70, 30)
	for _, tr := range trades {
		if tr.BuyIdx >= tr.SellIdx {
			t.Errorf("buy index %d must be before sell index %d", tr.BuyIdx, tr.SellIdx)
		}
	}
}

func TestRSIInvalidParams(t *testing.T) {
	closes := []float64{1, 2, 3, 4, 5}

	cases := []int{0, 5, 10}
	for _, period := range cases {
		trades := strategies.RSI(closes, period, 70, 30)
		if len(trades) != 0 {
			t.Errorf("RSI(period=%d): expected empty trades for invalid params, got %d", period, len(trades))
		}
	}
}

func TestRSIFlatPrices(t *testing.T) {
	// RSI of flat prices is undefined (no gains or losses) — should return no trades.
	closes := make([]float64, 30)
	for i := range closes {
		closes[i] = 50
	}
	trades := strategies.RSI(closes, 14, 70, 30)
	if len(trades) != 0 {
		t.Errorf("expected no trades for flat prices, got %d", len(trades))
	}
}
