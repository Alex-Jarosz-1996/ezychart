package strategies_test

import (
	"testing"

	"backtest/strategies"
)

func TestVMACDUniformVolume(t *testing.T) {
	// With uniform volume, VWMA degenerates to SMA. The strategy should still
	// produce valid (buy-before-sell) trade pairs.
	closes := make([]float64, 80)
	for i := 0; i < 40; i++ {
		closes[i] = 100 - float64(i)*1.5
	}
	for i := 40; i < 80; i++ {
		closes[i] = closes[39] + float64(i-39)*2.5
	}
	volumes := make([]float64, 80)
	for i := range volumes {
		volumes[i] = 1_000_000
	}

	trades := strategies.VMACD(closes, volumes, 12, 26, 9)
	for _, tr := range trades {
		if tr.BuyIdx >= tr.SellIdx {
			t.Errorf("buy index %d must be before sell index %d", tr.BuyIdx, tr.SellIdx)
		}
	}
}

func TestVMACDInvalidParams(t *testing.T) {
	closes := make([]float64, 50)
	volumes := make([]float64, 50)

	cases := []struct{ fast, slow, signal int }{
		{0, 26, 9},  // zero fast
		{26, 12, 9}, // fast >= slow
		{12, 26, 0}, // zero signal
	}
	for _, c := range cases {
		trades := strategies.VMACD(closes, volumes, c.fast, c.slow, c.signal)
		if len(trades) != 0 {
			t.Errorf("VMACD(%d,%d,%d): expected empty, got %d trades", c.fast, c.slow, c.signal, len(trades))
		}
	}
}

func TestVMACDMismatchedSlices(t *testing.T) {
	closes := make([]float64, 50)
	volumes := make([]float64, 40) // different length
	trades := strategies.VMACD(closes, volumes, 12, 26, 9)
	if len(trades) != 0 {
		t.Errorf("expected empty trades for mismatched slice lengths, got %d", len(trades))
	}
}

func TestVMACDZeroVolume(t *testing.T) {
	// All-zero volume should not panic (carry-forward logic).
	closes := make([]float64, 80)
	for i := range closes {
		closes[i] = 100 + float64(i%10)
	}
	volumes := make([]float64, 80) // all zero
	_ = strategies.VMACD(closes, volumes, 12, 26, 9)
}
