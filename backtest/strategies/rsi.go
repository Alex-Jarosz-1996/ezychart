package strategies

// RSI runs an RSI overbought/oversold strategy on closing prices using
// Wilder's smoothed moving average. A position is opened when RSI rises
// through the oversold level and closed when it falls through overbought.
func RSI(closes []float64, period int, overbought, oversold float64) []Trade {
	if period <= 0 || period >= len(closes) {
		return []Trade{}
	}

	rsi := computeRSI(closes, period)

	var trades []Trade
	inPosition := false
	buyIdx := 0

	for i := period + 1; i < len(closes); i++ {
		if !inPosition && rsi[i-1] < oversold && rsi[i] >= oversold {
			buyIdx = i
			inPosition = true
		} else if inPosition && rsi[i-1] > overbought && rsi[i] <= overbought {
			trades = append(trades, Trade{BuyIdx: buyIdx, SellIdx: i})
			inPosition = false
		}
	}

	return trades
}

// computeRSI returns the RSI value at each index. Values before index `period`
// are 0 (not enough data). Uses Wilder's exponential smoothing after the
// initial simple average over the first period.
func computeRSI(closes []float64, period int) []float64 {
	rsi := make([]float64, len(closes))
	if len(closes) < period+1 {
		return rsi
	}

	var avgGain, avgLoss float64
	for i := 1; i <= period; i++ {
		change := closes[i] - closes[i-1]
		if change > 0 {
			avgGain += change
		} else {
			avgLoss += -change
		}
	}
	avgGain /= float64(period)
	avgLoss /= float64(period)

	rsi[period] = rsiFromAvg(avgGain, avgLoss)

	for i := period + 1; i < len(closes); i++ {
		change := closes[i] - closes[i-1]
		gain, loss := 0.0, 0.0
		if change > 0 {
			gain = change
		} else {
			loss = -change
		}
		avgGain = (avgGain*float64(period-1) + gain) / float64(period)
		avgLoss = (avgLoss*float64(period-1) + loss) / float64(period)
		rsi[i] = rsiFromAvg(avgGain, avgLoss)
	}

	return rsi
}

func rsiFromAvg(avgGain, avgLoss float64) float64 {
	if avgLoss == 0 {
		return 100
	}
	rs := avgGain / avgLoss
	return 100 - (100 / (1 + rs))
}
