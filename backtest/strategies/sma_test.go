package strategies_test

import (
	"testing"

	"backtest/strategies"
)

func TestSMACrossover(t *testing.T) {
	// Prices decline then rise then decline again — produces one round-trip trade.
	// Short=3, Long=5.
	closes := []float64{10, 9, 8, 7, 6, 7, 8, 9, 10, 11, 12, 11, 10, 9, 8}
	trades := strategies.SMA(closes, 3, 5)

	if len(trades) == 0 {
		t.Fatal("expected at least one trade, got none")
	}
	for _, tr := range trades {
		if tr.BuyIdx >= tr.SellIdx {
			t.Errorf("buy index %d must be before sell index %d", tr.BuyIdx, tr.SellIdx)
		}
	}
}

func TestSMAMonotonicIncrease(t *testing.T) {
	// Short MA always above long MA after crossover — no sell ever happens.
	closes := make([]float64, 20)
	for i := range closes {
		closes[i] = float64(i + 1)
	}
	trades := strategies.SMA(closes, 3, 5)
	for _, tr := range trades {
		if tr.BuyIdx >= tr.SellIdx {
			t.Errorf("buy index %d must be before sell index %d", tr.BuyIdx, tr.SellIdx)
		}
	}
}

func TestSMAInvalidParams(t *testing.T) {
	closes := []float64{1, 2, 3, 4, 5}

	cases := []struct{ short, long int }{
		{5, 3},  // short >= long
		{0, 5},  // zero period
		{3, 10}, // long > len(closes)
	}
	for _, c := range cases {
		trades := strategies.SMA(closes, c.short, c.long)
		if len(trades) != 0 {
			t.Errorf("SMA(%d,%d): expected empty trades for invalid params, got %d", c.short, c.long, len(trades))
		}
	}
}

func TestSMANoCrossover(t *testing.T) {
	// Flat prices: no crossover ever happens.
	closes := []float64{10, 10, 10, 10, 10, 10, 10, 10, 10, 10}
	trades := strategies.SMA(closes, 3, 5)
	if len(trades) != 0 {
		t.Errorf("expected no trades for flat prices, got %d", len(trades))
	}
}
