package strategies

// VMACD runs a volume-weighted MACD strategy. Fast and slow lines are computed
// as VWMA (volume-weighted moving average) instead of EMA, giving more weight
// to high-volume bars. The signal line is the EMA of the VMACD line.
// Buy when VMACD crosses above signal; sell when it crosses below.
func VMACD(closes, volumes []float64, fast, slow, signal int) []Trade {
	if fast <= 0 || slow <= 0 || signal <= 0 || fast >= slow {
		return []Trade{}
	}
	if len(closes) != len(volumes) || len(closes) < slow+signal {
		return []Trade{}
	}

	fastVWMA := vwma(closes, volumes, fast)
	slowVWMA := vwma(closes, volumes, slow)

	macdLine := make([]float64, len(closes))
	for i := slow - 1; i < len(closes); i++ {
		macdLine[i] = fastVWMA[i] - slowVWMA[i]
	}

	signalLine := emaFrom(macdLine, slow-1, signal)

	start := slow - 1 + signal
	var trades []Trade
	inPosition := false
	buyIdx := 0

	for i := start; i < len(closes); i++ {
		prev := signalLine[i-1]
		curr := signalLine[i]
		ml := macdLine[i]
		mlPrev := macdLine[i-1]

		if !inPosition && mlPrev <= prev && ml > curr {
			buyIdx = i
			inPosition = true
		} else if inPosition && mlPrev >= prev && ml < curr {
			trades = append(trades, Trade{BuyIdx: buyIdx, SellIdx: i})
			inPosition = false
		}
	}

	return trades
}

// vwma returns the volume-weighted moving average over `period` bars at each
// index. For bars with zero total volume in the window, the previous value is
// carried forward to avoid division by zero.
func vwma(closes, volumes []float64, period int) []float64 {
	out := make([]float64, len(closes))
	if period <= 0 || len(closes) < period {
		return out
	}

	for i := period - 1; i < len(closes); i++ {
		sumPV, sumV := 0.0, 0.0
		for j := i - period + 1; j <= i; j++ {
			sumPV += closes[j] * volumes[j]
			sumV += volumes[j]
		}
		if sumV == 0 {
			if i > 0 {
				out[i] = out[i-1]
			}
		} else {
			out[i] = sumPV / sumV
		}
	}
	return out
}
