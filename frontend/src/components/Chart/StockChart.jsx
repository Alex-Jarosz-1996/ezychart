import { useState, useEffect, useCallback } from 'react'
import {
  ResponsiveContainer,
  ComposedChart,
  Line,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from 'recharts'
import { getEODChart, getIntradayChart } from '../../api.js'
import styles from './StockChart.module.css'

const RANGES = ['1w', '1m', '3m', '6m', '1y', '2y', 'max']
const INTERVALS = ['1min', '5min', '15min', '30min', '1hour']

function fmtDate(dateStr, mode) {
  const d = new Date(dateStr)
  if (mode === 'eod') return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
  return d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
}

function fmtAge(ts) {
  if (!ts) return null
  const secs = Math.floor((Date.now() - ts) / 1000)
  if (secs < 60) return 'just now'
  if (secs < 3600) return `${Math.floor(secs / 60)}m ago`
  return `${Math.floor(secs / 3600)}h ago`
}

export default function StockChart({ symbol, token }) {
  const [mode, setMode] = useState('eod')
  const [range, setRange] = useState('1y')
  const [timeInterval, setTimeInterval] = useState('5min')
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [lastUpdated, setLastUpdated] = useState(null)
  const [, setTick] = useState(0)

  const load = useCallback(async () => {
    if (!symbol) return
    setLoading(true)
    setError(null)
    try {
      const result =
        mode === 'eod'
          ? await getEODChart(symbol, token, range)
          : await getIntradayChart(symbol, token, timeInterval)
      const sorted = [...result.data].sort((a, b) => a.date.localeCompare(b.date))
      setData(sorted)
      setLastUpdated(Date.now())
    } catch (e) {
      setError(e.message)
      setData(null)
    } finally {
      setLoading(false)
    }
  }, [symbol, token, mode, range, timeInterval])

  useEffect(() => {
    setData(null)
    setLastUpdated(null)
    load()
  }, [load])

  // Tick the clock every 30s so "X ago" label stays fresh
  useEffect(() => {
    const id = setInterval(() => setTick((n) => n + 1), 30_000)
    return () => clearInterval(id)
  }, [])

  const priceField = mode === 'eod' ? 'price' : 'close'

  const priceDomain = (() => {
    if (!data || data.length === 0) return ['auto', 'auto']
    const vals = data.map((d) => d[priceField]).filter(Number.isFinite)
    if (vals.length === 0) return ['auto', 'auto']
    const min = Math.min(...vals)
    const max = Math.max(...vals)
    const pad = (max - min) * 0.05 || min * 0.01
    return [min - pad, max + pad]
  })()

  // Volume bars occupy the bottom ~25% of the chart by making the axis domain
  // 4x the max volume — bars only render in the lowest quarter of the space.
  const volumeDomain = (() => {
    if (!data || data.length === 0) return [0, 1]
    const maxVol = Math.max(...data.map((d) => d.volume).filter(Number.isFinite))
    return [0, maxVol * 4]
  })()

  const handleModeSwitch = (next) => {
    if (next !== mode) setMode(next)
  }

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <span className={styles.title}>Price Chart</span>
        <div className={styles.controls}>
          <div className={styles.toggleGroup}>
            {['eod', 'intraday'].map((m) => (
              <button
                key={m}
                className={`${styles.toggleBtn} ${mode === m ? styles.toggleBtnActive : ''}`}
                onClick={() => handleModeSwitch(m)}
              >
                {m === 'eod' ? 'EOD' : 'Intraday'}
              </button>
            ))}
          </div>

          {mode === 'eod' && (
            <div className={styles.toggleGroup}>
              {RANGES.map((r) => (
                <button
                  key={r}
                  className={`${styles.toggleBtn} ${range === r ? styles.toggleBtnActive : ''}`}
                  onClick={() => setRange(r)}
                >
                  {r}
                </button>
              ))}
            </div>
          )}

          {mode === 'intraday' && (
            <div className={styles.toggleGroup}>
              {INTERVALS.map((iv) => (
                <button
                  key={iv}
                  className={`${styles.toggleBtn} ${timeInterval === iv ? styles.toggleBtnActive : ''}`}
                  onClick={() => setTimeInterval(iv)}
                >
                  {iv}
                </button>
              ))}
            </div>
          )}

          <button
            className={styles.refreshBtn}
            onClick={load}
            disabled={loading}
            aria-label="Refresh chart"
          >
            ↻ Refresh
          </button>

          {lastUpdated && (
            <span className={styles.meta}>updated {fmtAge(lastUpdated)}</span>
          )}
        </div>
      </div>

      {loading && <div className={styles.center}>Loading…</div>}

      {!loading && error && (
        <div className={`${styles.center} ${styles.error}`}>{error}</div>
      )}

      {!loading && !error && data && data.length > 0 && (
        <div className={styles.chartArea}>
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={data} margin={{ top: 4, right: 16, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis
                dataKey="date"
                tickFormatter={(d) => fmtDate(d, mode)}
                tick={{ fontSize: 11, fill: 'var(--text-secondary)' }}
                tickLine={false}
                interval="preserveStartEnd"
              />
              <YAxis
                yAxisId="price"
                domain={priceDomain}
                tick={{ fontSize: 11, fill: 'var(--text-secondary)' }}
                tickLine={false}
                tickFormatter={(v) => `$${v.toFixed(0)}`}
                width={60}
              />
              <YAxis
                yAxisId="volume"
                orientation="right"
                hide
                domain={volumeDomain}
              />
              <Tooltip
                contentStyle={{
                  background: 'var(--bg-card)',
                  border: '1px solid var(--border)',
                  borderRadius: 8,
                  fontSize: 12,
                }}
                formatter={(value, name) =>
                  name === 'volume'
                    ? [value.toLocaleString(), 'Volume']
                    : [`$${Number(value).toFixed(2)}`, 'Price']
                }
                labelFormatter={(d) => fmtDate(d, mode)}
              />
              <Bar
                yAxisId="volume"
                dataKey="volume"
                fill="var(--text-secondary)"
                opacity={0.3}
                isAnimationActive={false}
              />
              <Line
                yAxisId="price"
                type="monotone"
                dataKey={priceField}
                stroke="var(--accent)"
                strokeWidth={2}
                dot={false}
                isAnimationActive={false}
              />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      )}
      {!loading && !error && (!data || data.length === 0) && (
        <div className={styles.center}>No chart data available.</div>
      )}
    </div>
  )
}
