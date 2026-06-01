package main

// PricePoint is a single EOD bar sent from the frontend.
type PricePoint struct {
	Date   string  `json:"date"`
	Close  float64 `json:"close"`
	Volume float64 `json:"volume"`
}

type SMAParams struct {
	ShortPeriod int `json:"short_period"`
	LongPeriod  int `json:"long_period"`
}

type RSIParams struct {
	Period     int     `json:"period"`
	Overbought float64 `json:"overbought"`
	Oversold   float64 `json:"oversold"`
}

type MACDParams struct {
	FastPeriod   int `json:"fast_period"`
	SlowPeriod   int `json:"slow_period"`
	SignalPeriod int `json:"signal_period"`
}

type VMACDParams struct {
	FastPeriod   int `json:"fast_period"`
	SlowPeriod   int `json:"slow_period"`
	SignalPeriod int `json:"signal_period"`
}

type StrategyParams struct {
	SMA   *SMAParams   `json:"sma,omitempty"`
	RSI   *RSIParams   `json:"rsi,omitempty"`
	MACD  *MACDParams  `json:"macd,omitempty"`
	VMACD *VMACDParams `json:"vmacd,omitempty"`
}

type BacktestRequest struct {
	Prices     []PricePoint   `json:"prices"`
	Strategies []string       `json:"strategies"`
	Params     StrategyParams `json:"params"`
}

// Trade is a completed buy/sell pair with profit information.
type Trade struct {
	BuyDate   string  `json:"buy_date"`
	BuyPrice  float64 `json:"buy_price"`
	SellDate  string  `json:"sell_date"`
	SellPrice float64 `json:"sell_price"`
	ProfitPct float64 `json:"profit_pct"`
}

// Signal is a single buy or sell event for chart overlay rendering.
type Signal struct {
	Date  string  `json:"date"`
	Type  string  `json:"type"` // "buy" or "sell"
	Price float64 `json:"price"`
}

type StrategyResult struct {
	Trades         []Trade  `json:"trades"`
	TotalProfitPct float64  `json:"total_profit_pct"`
	Signals        []Signal `json:"signals"`
}

type BacktestResponse struct {
	Results map[string]StrategyResult `json:"results"`
}
