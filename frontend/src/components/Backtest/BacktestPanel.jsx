import { useState } from 'react'
import { getCandlestickChart, runBacktest } from '../../api.js'
import BacktestChart from './BacktestChart.jsx'
import TradesTable from './TradesTable.jsx'
import styles from './BacktestPanel.module.css'

const DEFAULT_SMA = { short_period: 20, long_period: 50 }
const DEFAULT_RSI = { period: 14, overbought: 70, oversold: 30 }
const DEFAULT_MACD = { fast_period: 12, slow_period: 26, signal_period: 9 }
const DEFAULT_VMACD = { fast_period: 12, slow_period: 26, signal_period: 9 }

export default function BacktestPanel({ token }) {
  const [symbol, setSymbol] = useState('')
  const [input, setInput] = useState('')
  const [selectedStrategies, setSelectedStrategies] = useState(['sma'])
  const [smaParams, setSmaParams] = useState(DEFAULT_SMA)
  const [rsiParams, setRsiParams] = useState(DEFAULT_RSI)
  const [macdParams, setMacdParams] = useState(DEFAULT_MACD)
  const [vmacdParams, setVmacdParams] = useState(DEFAULT_VMACD)
  const [initialInvestment, setInitialInvestment] = useState(10000)
  const [priceData, setPriceData] = useState(null)
  const [results, setResults] = useState(null)
  const [buyAndHoldPct, setBuyAndHoldPct] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  const toggleStrategy = (strat) => {
    setSelectedStrategies((prev) =>
      prev.includes(strat)
        ? prev.length > 1 ? prev.filter((s) => s !== strat) : prev
        : [...prev, strat]
    )
  }

  const handleSearch = (e) => {
    e.preventDefault()
    const sym = input.trim().toUpperCase()
    if (sym) {
      setSymbol(sym)
      setPriceData(null)
      setResults(null)
      setError(null)
    }
  }

  const handleRun = async () => {
    if (!symbol) return
    setLoading(true)
    setError(null)
    setResults(null)
    try {
      // Fetch 2y of EOD candle data to give strategies enough history
      const chart = await getCandlestickChart(symbol, token, '2y')
      const prices = [...chart.data]
        .sort((a, b) => a.date.localeCompare(b.date))
        .map((p) => ({ date: p.date, close: p.close, volume: p.volume ?? 0 }))

      setPriceData(prices)

      const params = {}
      if (selectedStrategies.includes('sma')) params.sma = smaParams
      if (selectedStrategies.includes('rsi')) params.rsi = rsiParams
      if (selectedStrategies.includes('macd')) params.macd = macdParams
      if (selectedStrategies.includes('vmacd')) params.vmacd = vmacdParams

      const resp = await runBacktest(prices, selectedStrategies, params, token)
      setResults(resp.results)
      setBuyAndHoldPct(resp.buy_and_hold_pct ?? null)
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className={styles.panel}>
      {/* Symbol search */}
      <form className={styles.searchRow} onSubmit={handleSearch}>
        <input
          className={styles.input}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ticker symbol (e.g. AAPL)"
          autoCapitalize="characters"
          spellCheck={false}
        />
        <button className={styles.btn} type="submit">Load</button>
      </form>

      {symbol && (
        <div className={styles.config}>
          <span className={styles.ticker}>{symbol}</span>

          {/* Strategy selector */}
          <div className={styles.fieldGroup}>
            <span className={styles.label}>Strategies</span>
            <div className={styles.checkRow}>
              {['sma', 'rsi', 'macd', 'vmacd'].map((strat) => (
                <label key={strat} className={styles.checkLabel}>
                  <input
                    type="checkbox"
                    checked={selectedStrategies.includes(strat)}
                    onChange={() => toggleStrategy(strat)}
                  />
                  {strat.toUpperCase()}
                </label>
              ))}
            </div>
          </div>

          {/* SMA params */}
          {selectedStrategies.includes('sma') && (
            <div className={styles.fieldGroup}>
              <span className={styles.label}>SMA Periods</span>
              <div className={styles.paramRow}>
                <label className={styles.paramLabel}>
                  Short
                  <input
                    className={styles.numInput}
                    type="number"
                    min={1}
                    value={smaParams.short_period}
                    onChange={(e) => setSmaParams((p) => ({ ...p, short_period: Number(e.target.value) }))}
                  />
                </label>
                <label className={styles.paramLabel}>
                  Long
                  <input
                    className={styles.numInput}
                    type="number"
                    min={2}
                    value={smaParams.long_period}
                    onChange={(e) => setSmaParams((p) => ({ ...p, long_period: Number(e.target.value) }))}
                  />
                </label>
              </div>
            </div>
          )}

          {/* RSI params */}
          {selectedStrategies.includes('rsi') && (
            <div className={styles.fieldGroup}>
              <span className={styles.label}>RSI Settings</span>
              <div className={styles.paramRow}>
                <label className={styles.paramLabel}>
                  Period
                  <input
                    className={styles.numInput}
                    type="number"
                    min={2}
                    value={rsiParams.period}
                    onChange={(e) => setRsiParams((p) => ({ ...p, period: Number(e.target.value) }))}
                  />
                </label>
                <label className={styles.paramLabel}>
                  Overbought
                  <input
                    className={styles.numInput}
                    type="number"
                    min={50}
                    max={100}
                    value={rsiParams.overbought}
                    onChange={(e) => setRsiParams((p) => ({ ...p, overbought: Number(e.target.value) }))}
                  />
                </label>
                <label className={styles.paramLabel}>
                  Oversold
                  <input
                    className={styles.numInput}
                    type="number"
                    min={0}
                    max={50}
                    value={rsiParams.oversold}
                    onChange={(e) => setRsiParams((p) => ({ ...p, oversold: Number(e.target.value) }))}
                  />
                </label>
              </div>
            </div>
          )}

          {/* MACD params */}
          {selectedStrategies.includes('macd') && (
            <div className={styles.fieldGroup}>
              <span className={styles.label}>MACD Periods</span>
              <div className={styles.paramRow}>
                <label className={styles.paramLabel}>
                  Fast
                  <input className={styles.numInput} type="number" min={1}
                    value={macdParams.fast_period}
                    onChange={(e) => setMacdParams((p) => ({ ...p, fast_period: Number(e.target.value) }))} />
                </label>
                <label className={styles.paramLabel}>
                  Slow
                  <input className={styles.numInput} type="number" min={2}
                    value={macdParams.slow_period}
                    onChange={(e) => setMacdParams((p) => ({ ...p, slow_period: Number(e.target.value) }))} />
                </label>
                <label className={styles.paramLabel}>
                  Signal
                  <input className={styles.numInput} type="number" min={1}
                    value={macdParams.signal_period}
                    onChange={(e) => setMacdParams((p) => ({ ...p, signal_period: Number(e.target.value) }))} />
                </label>
              </div>
            </div>
          )}

          {/* VMACD params */}
          {selectedStrategies.includes('vmacd') && (
            <div className={styles.fieldGroup}>
              <span className={styles.label}>VMACD Periods</span>
              <div className={styles.paramRow}>
                <label className={styles.paramLabel}>
                  Fast
                  <input className={styles.numInput} type="number" min={1}
                    value={vmacdParams.fast_period}
                    onChange={(e) => setVmacdParams((p) => ({ ...p, fast_period: Number(e.target.value) }))} />
                </label>
                <label className={styles.paramLabel}>
                  Slow
                  <input className={styles.numInput} type="number" min={2}
                    value={vmacdParams.slow_period}
                    onChange={(e) => setVmacdParams((p) => ({ ...p, slow_period: Number(e.target.value) }))} />
                </label>
                <label className={styles.paramLabel}>
                  Signal
                  <input className={styles.numInput} type="number" min={1}
                    value={vmacdParams.signal_period}
                    onChange={(e) => setVmacdParams((p) => ({ ...p, signal_period: Number(e.target.value) }))} />
                </label>
              </div>
            </div>
          )}

          <div className={styles.fieldGroup}>
            <span className={styles.label}>Initial Investment</span>
            <div className={styles.paramRow}>
              <label className={styles.paramLabel}>
                Amount ($)
                <input
                  className={styles.numInput}
                  type="number"
                  min={1}
                  value={initialInvestment}
                  onChange={(e) => setInitialInvestment(Number(e.target.value))}
                />
              </label>
            </div>
          </div>

          <button className={styles.runBtn} onClick={handleRun} disabled={loading}>
            {loading ? 'Running…' : 'Run Backtest'}
          </button>
        </div>
      )}

      {error && <div className={styles.error}>{error}</div>}

      {results && priceData && (
        <>
          <BacktestChart priceData={priceData} results={results} />
          <TradesTable results={results} initialInvestment={initialInvestment} buyAndHoldPct={buyAndHoldPct} />
        </>
      )}
    </div>
  )
}
