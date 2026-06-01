package strategies

// Trade is a completed buy/sell pair represented as indices into the prices slice.
type Trade struct {
	BuyIdx  int
	SellIdx int
}

// SMA runs a simple moving average crossover strategy on closing prices.
// A position is opened when the short MA crosses above the long MA, and
// closed when it crosses back below. Only one position is held at a time.
func SMA(closes []float64, shortPeriod, longPeriod int) []Trade {
	if shortPeriod <= 0 || longPeriod <= 0 || shortPeriod >= longPeriod || longPeriod > len(closes) {
		return []Trade{}
	}

	sma := func(i, period int) float64 {
		sum := 0.0
		for j := i - period + 1; j <= i; j++ {
			sum += closes[j]
		}
		return sum / float64(period)
	}

	var trades []Trade
	inPosition := false
	buyIdx := 0

	// Start at longPeriod so both MAs have a full window for prev and curr.
	for i := longPeriod; i < len(closes); i++ {
		prevShort := sma(i-1, shortPeriod)
		prevLong := sma(i-1, longPeriod)
		currShort := sma(i, shortPeriod)
		currLong := sma(i, longPeriod)

		if !inPosition && prevShort <= prevLong && currShort > currLong {
			buyIdx = i
			inPosition = true
		} else if inPosition && prevShort >= prevLong && currShort < currLong {
			trades = append(trades, Trade{BuyIdx: buyIdx, SellIdx: i})
			inPosition = false
		}
	}

	return trades
}
