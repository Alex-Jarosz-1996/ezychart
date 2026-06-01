package strategies

// EMA computes the exponential moving average of data using the standard
// multiplier k = 2/(period+1). The first valid value is seeded with the
// simple average of the first `period` elements; earlier indices are 0.
func EMA(data []float64, period int) []float64 {
	out := make([]float64, len(data))
	if period <= 0 || len(data) < period {
		return out
	}

	// Seed with SMA of first window
	sum := 0.0
	for i := 0; i < period; i++ {
		sum += data[i]
	}
	out[period-1] = sum / float64(period)

	k := 2.0 / float64(period+1)
	for i := period; i < len(data); i++ {
		out[i] = data[i]*k + out[i-1]*(1-k)
	}
	return out
}

// MACD runs a standard MACD crossover strategy on closing prices.
// A position is opened when the MACD line (fast EMA − slow EMA) crosses
// above the signal line (EMA of MACD), and closed on the reverse cross.
func MACD(closes []float64, fast, slow, signal int) []Trade {
	if fast <= 0 || slow <= 0 || signal <= 0 || fast >= slow {
		return []Trade{}
	}
	if len(closes) < slow+signal {
		return []Trade{}
	}

	fastEMA := EMA(closes, fast)
	slowEMA := EMA(closes, slow)

	macdLine := make([]float64, len(closes))
	for i := slow - 1; i < len(closes); i++ {
		macdLine[i] = fastEMA[i] - slowEMA[i]
	}

	// Compute signal line as EMA of the MACD line starting from index slow-1
	signalLine := emaFrom(macdLine, slow-1, signal)

	start := slow - 1 + signal // first index where both lines are valid
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

// emaFrom computes an EMA of src starting at index startIdx, using a window
// of `period` values to seed it. Returns a slice the same length as src with
// zeros before the seed is ready.
func emaFrom(src []float64, startIdx, period int) []float64 {
	out := make([]float64, len(src))
	end := startIdx + period
	if end > len(src) {
		return out
	}

	sum := 0.0
	for i := startIdx; i < end; i++ {
		sum += src[i]
	}
	out[end-1] = sum / float64(period)

	k := 2.0 / float64(period+1)
	for i := end; i < len(src); i++ {
		out[i] = src[i]*k + out[i-1]*(1-k)
	}
	return out
}
