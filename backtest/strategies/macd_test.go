package strategies_test

import (
	"math"
	"testing"

	"backtest/strategies"
)

func TestMACDBasicCrossover(t *testing.T) {
	// 80 prices: decline then strong recovery to force a MACD crossover cycle.
	closes := make([]float64, 80)
	for i := 0; i < 40; i++ {
		closes[i] = 100 - float64(i)*1.5
	}
	for i := 40; i < 80; i++ {
		closes[i] = closes[39] + float64(i-39)*2.5
	}

	trades := strategies.MACD(closes, 12, 26, 9)
	for _, tr := range trades {
		if tr.BuyIdx >= tr.SellIdx {
			t.Errorf("buy index %d must be before sell index %d", tr.BuyIdx, tr.SellIdx)
		}
	}
}

func TestMACDInvalidParams(t *testing.T) {
	closes := make([]float64, 50)
	cases := [][3]int{
		{0, 26, 9},  // zero fast
		{26, 12, 9}, // fast >= slow
		{12, 26, 0}, // zero signal
		{12, 26, 9}, // too few bars (need 35, only 20)
	}
	inputs := [][]float64{closes, closes, closes, closes[:20]}
	for i, c := range cases {
		trades := strategies.MACD(inputs[i], c[0], c[1], c[2])
		if len(trades) != 0 {
			t.Errorf("case %v: expected empty trades for invalid params, got %d", c, len(trades))
		}
	}
}

func TestMACDFlatPrices(t *testing.T) {
	closes := make([]float64, 80)
	for i := range closes {
		closes[i] = 100
	}
	trades := strategies.MACD(closes, 12, 26, 9)
	if len(trades) != 0 {
		t.Errorf("expected no trades for flat prices, got %d", len(trades))
	}
}

func TestEMAConverges(t *testing.T) {
	// EMA of a constant series should equal the constant.
	data := make([]float64, 30)
	for i := range data {
		data[i] = 50.0
	}
	ema := strategies.EMA(data, 10)
	for i := 9; i < len(ema); i++ {
		if math.Abs(ema[i]-50.0) > 1e-9 {
			t.Errorf("EMA[%d] = %f, want 50", i, ema[i])
		}
	}
}
