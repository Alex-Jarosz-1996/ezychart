import { useState, useEffect, useCallback, useMemo } from 'react'
import {
  ResponsiveContainer,
  ComposedChart,
  Line,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  ReferenceLine,
} from 'recharts'
import { getCandlestickChart, getEODChart, getIntradayChart } from '../../api.js'
import { niceScale } from '../../utils/chartUtils.js'
import { calcSMA, calcRSI, calcMACD, calcVMACD } from '../../utils/indicators.js'
import CandlestickChart from './CandlestickChart.jsx'
import styles from './StockChart.module.css'

const RANGES = ['1w', '1m', '3m', '6m', '1y', '2y', 'max']
const INTERVALS = ['minute', 'hour']

const INDICATORS = [
  { key: 'sma20', label: 'SMA 20', color: '#f59e0b' },
  { key: 'sma50', label: 'SMA 50', color: '#a78bfa' },
  { key: 'rsi',   label: 'RSI',    color: '#34d399' },
  { key: 'macd',  label: 'MACD',   color: '#60a5fa' },
  { key: 'vmacd', label: 'VMACD',  color: '#34d399' },
]

function fmtTooltipLabel(dateStr, mode) {
  const d = new Date(dateStr)
  if (mode === 'eod')
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
  return d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
}

function fmtEodTick(dateStr, range) {
  const [y, m, d] = dateStr.split('-').map(Number)
  const dt = new Date(y, m - 1, d)
  const month = dt.toLocaleDateString(undefined, { month: 'short' })
  const year = String(y).slice(2)
  if (range === '1m') return String(d)
  if (range === '3m' || range === '6m') return m === 1 ? `${month} '${year}` : month
  return `${month} '${year}`
}

function getEodTicks(data, range) {
  if (!data?.length) return []
  const dates = data.map((d) => d.date)
  if (range === '1w') return dates
  if (range === '1m') return dates.filter((_, i) => i % 5 === 0)
  const firstOfPeriod = (monthTest) => {
    const seen = new Set()
    return dates.filter((dateStr) => {
      const [y, m] = dateStr.split('-').map(Number)
      const monthIdx = m - 1
      if (!monthTest(monthIdx)) return false
      const key = `${y}-${monthIdx}`
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
  }
  if (range === '3m' || range === '6m') return firstOfPeriod(() => true)
  if (range === '1y')                   return firstOfPeriod((m) => m % 2 === 0)
  if (range === '2y')                   return firstOfPeriod((m) => m % 4 === 0)
  return firstOfPeriod((m) => m === 0 || m === 6)
}

function getIntradayTicks(data, interval) {
  if (!data?.length) return []
  const seen = new Set()
  return data.map((d) => d.date).filter((dateStr) => {
    const dt = new Date(dateStr)
    const key = interval === 'minute'
      ? `${dt.getFullYear()}-${dt.getMonth()}-${dt.getDate()}`
      : `${dt.getFullYear()}-${dt.getMonth()}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

function fmtIntradayTick(dateStr, interval) {
  const dt = new Date(dateStr)
  if (interval === 'minute')
    return dt.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })
  const month = dt.toLocaleDateString(undefined, { month: 'short' })
  return `${month} '${String(dt.getFullYear()).slice(2)}`
}

function fmtAge(ts) {
  if (!ts) return null
  const secs = Math.floor((Date.now() - ts) / 1000)
  if (secs < 60) return 'just now'
  if (secs < 3600) return `${Math.floor(secs / 60)}m ago`
  return `${Math.floor(secs / 3600)}h ago`
}

const AXIS_MARGIN = { top: 4, right: 16, left: 0, bottom: 0 }
const YAXIS_WIDTH = 60

export default function StockChart({ symbol, token }) {
  const [mode, setMode] = useState('eod')
  const [chartStyle, setChartStyle] = useState('line')
  const [range, setRange] = useState('1y')
  const [timeInterval, setTimeInterval] = useState('minute')
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [lastUpdated, setLastUpdated] = useState(null)
  const [, setTick] = useState(0)
  const [activeIndicators, setActiveIndicators] = useState(new Set())

  const toggleIndicator = (key) =>
    setActiveIndicators(prev => {
      const next = new Set(prev)
      next.has(key) ? next.delete(key) : next.add(key)
      return next
    })

  const load = useCallback(async () => {
    if (!symbol) return
    setLoading(true)
    setError(null)
    try {
      const result =
        mode === 'eod' && chartStyle === 'candlestick'
          ? await getCandlestickChart(symbol, token, range)
          : mode === 'eod'
          ? await getEODChart(symbol, token, range)
          : await getIntradayChart(symbol, token, timeInterval)
      setData([...result.data].sort((a, b) => a.date.localeCompare(b.date)))
      setLastUpdated(Date.now())
    } catch (e) {
      setError(e.message)
      setData(null)
    } finally {
      setLoading(false)
    }
  }, [symbol, token, mode, chartStyle, range, timeInterval])

  useEffect(() => {
    setData(null)
    setLastUpdated(null)
    load()
  }, [load])

  useEffect(() => {
    const id = setInterval(() => setTick((n) => n + 1), 30_000)
    return () => clearInterval(id)
  }, [])

  const priceField = mode === 'eod' ? 'price' : 'close'

  // Merge computed indicator values into data points
  const chartData = useMemo(() => {
    if (!data?.length) return []
    const closes  = data.map(d => d[priceField])
    const volumes = data.map(d => d.volume ?? 0)
    const sma20 = calcSMA(closes, 20)
    const sma50 = calcSMA(closes, 50)
    const rsi   = calcRSI(closes, 14)
    const macd  = calcMACD(closes)
    const vmacd = calcVMACD(closes, volumes)
    return data.map((d, i) => ({
      ...d,
      sma20: sma20[i],
      sma50: sma50[i],
      rsi:   rsi[i],
      macdLine:       macd[i].macd,
      macdSignal:     macd[i].signal,
      macdHistogram:  macd[i].histogram,
      vmacdLine:      vmacd[i].macd,
      vmacdSignal:    vmacd[i].signal,
      vmacdHistogram: vmacd[i].histogram,
    }))
  }, [data, priceField])

  const tickSet = data
    ? new Set(mode === 'eod' ? getEodTicks(data, range) : getIntradayTicks(data, timeInterval))
    : null

  let priceDomain = ['auto', 'auto']
  let priceTicks
  if (data?.length) {
    const vals = data.map((d) => d[priceField]).filter(Number.isFinite)
    if (vals.length) {
      const { min, max, ticks } = niceScale(Math.min(...vals), Math.max(...vals))
      priceDomain = [min, max]
      priceTicks = ticks
    }
  }

  let volumeDomain = [0, 1]
  if (data?.length) {
    const maxVol = Math.max(...data.map((d) => d.volume).filter(Number.isFinite))
    volumeDomain = [0, maxVol * 4]
  }

  const handleModeSwitch = (next) => {
    if (next !== mode) {
      setMode(next)
      setChartStyle('line')
    }
  }

  const renderTick = ({ x, y, payload }) => {
    if (tickSet && !tickSet.has(payload.value)) return <g />
    const label = mode === 'eod'
      ? fmtEodTick(payload.value, range)
      : fmtIntradayTick(payload.value, timeInterval)
    const rotate = mode === 'intraday'
    return (
      <g transform={`translate(${x},${y})`}>
        <text
          x={0} y={0}
          dy={rotate ? 8 : 12}
          textAnchor={rotate ? 'end' : 'middle'}
          transform={rotate ? 'rotate(-35)' : undefined}
          fontSize={11}
          fill="var(--text-secondary)"
        >
          {label}
        </text>
      </g>
    )
  }

  const showRSI   = activeIndicators.has('rsi')
  const showMACD  = activeIndicators.has('macd')
  const showVMACD = activeIndicators.has('vmacd')

  const tooltipStyle = {
    contentStyle: {
      background: 'var(--bg-card)',
      border: '1px solid var(--border)',
      borderRadius: 8,
      fontSize: 12,
    },
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
            <>
              <div className={styles.toggleGroup}>
                {['line', 'candlestick'].map((s) => (
                  <button
                    key={s}
                    className={`${styles.toggleBtn} ${chartStyle === s ? styles.toggleBtnActive : ''}`}
                    onClick={() => setChartStyle(s)}
                  >
                    {s === 'line' ? 'Line' : 'Candle'}
                  </button>
                ))}
              </div>
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
              <div className={styles.toggleGroup}>
                {INDICATORS.map(({ key, label }) => (
                  <button
                    key={key}
                    className={`${styles.toggleBtn} ${activeIndicators.has(key) ? styles.toggleBtnActive : ''}`}
                    onClick={() => toggleIndicator(key)}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </>
          )}

          {mode === 'intraday' && (
            <div className={styles.toggleGroup}>
              {INTERVALS.map((iv) => (
                <button
                  key={iv}
                  className={`${styles.toggleBtn} ${timeInterval === iv ? styles.toggleBtnActive : ''}`}
                  onClick={() => setTimeInterval(iv)}
                >
                  {iv === 'minute' ? 'Minute' : 'Hour'}
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
      {!loading && error && <div className={`${styles.center} ${styles.error}`}>{error}</div>}

      {!loading && !error && (
        chartData.length > 0 ? (
          <div className={styles.chartStack}>
            {/* ── Main price chart ── */}
            <div className={styles.chartArea}>
              {mode === 'eod' && chartStyle === 'candlestick' ? (
                <CandlestickChart data={chartData} />
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={chartData} margin={AXIS_MARGIN}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                    <XAxis
                      dataKey="date"
                      interval={0}
                      tickLine={false}
                      tick={showRSI || showMACD || showVMACD ? false : renderTick}
                      height={showRSI || showMACD || showVMACD ? 0 : 30}
                    />
                    <YAxis
                      yAxisId="price"
                      domain={priceDomain}
                      ticks={priceTicks}
                      tick={{ fontSize: 11, fill: 'var(--text-secondary)' }}
                      tickLine={false}
                      tickFormatter={(v) => `$${v.toFixed(0)}`}
                      width={YAXIS_WIDTH}
                    />
                    <YAxis yAxisId="volume" orientation="right" hide domain={volumeDomain} />
                    <Tooltip
                      {...tooltipStyle}
                      formatter={(value, name) =>
                        name === 'volume'
                          ? [value.toLocaleString(), 'Volume']
                          : [`$${Number(value).toFixed(2)}`, name === priceField ? 'Price' : name]
                      }
                      labelFormatter={(d) => fmtTooltipLabel(d, mode)}
                    />
                    <Bar yAxisId="volume" dataKey="volume" fill="var(--text-secondary)" opacity={0.3} isAnimationActive={false} />
                    <Line yAxisId="price" type="monotone" dataKey={priceField} stroke="var(--accent)" strokeWidth={2} dot={false} isAnimationActive={false} />
                    {activeIndicators.has('sma20') && (
                      <Line yAxisId="price" type="monotone" dataKey="sma20" stroke="#f59e0b" strokeWidth={1.5} dot={false} isAnimationActive={false} connectNulls={false} name="SMA 20" />
                    )}
                    {activeIndicators.has('sma50') && (
                      <Line yAxisId="price" type="monotone" dataKey="sma50" stroke="#a78bfa" strokeWidth={1.5} dot={false} isAnimationActive={false} connectNulls={false} name="SMA 50" />
                    )}
                  </ComposedChart>
                </ResponsiveContainer>
              )}
            </div>

            {/* ── RSI sub-panel ── */}
            {showRSI && (
              <div className={styles.subPanel}>
                <span className={styles.panelLabel}>RSI (14)</span>
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={chartData} margin={AXIS_MARGIN}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                    <XAxis
                      dataKey="date"
                      interval={0}
                      tickLine={false}
                      tick={showMACD || showVMACD ? false : renderTick}
                      height={showMACD || showVMACD ? 0 : 30}
                    />
                    <YAxis domain={[0, 100]} ticks={[30, 50, 70]} width={YAXIS_WIDTH} tickLine={false} tick={{ fontSize: 11, fill: 'var(--text-secondary)' }} />
                    <ReferenceLine y={70} stroke="#f87171" strokeDasharray="4 3" strokeWidth={1} />
                    <ReferenceLine y={30} stroke="#4ade80" strokeDasharray="4 3" strokeWidth={1} />
                    <Tooltip
                      {...tooltipStyle}
                      formatter={(v) => [v != null ? v.toFixed(1) : '—', 'RSI']}
                      labelFormatter={(d) => fmtTooltipLabel(d, mode)}
                    />
                    <Line type="monotone" dataKey="rsi" stroke="#34d399" strokeWidth={1.5} dot={false} isAnimationActive={false} connectNulls={false} />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            )}

            {/* ── MACD sub-panel ── */}
            {showMACD && (
              <div className={styles.subPanel}>
                <span className={styles.panelLabel}>MACD (12, 26, 9)</span>
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={chartData} margin={AXIS_MARGIN}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                    <XAxis dataKey="date" interval={0} tickLine={false} tick={showVMACD ? false : renderTick} height={showVMACD ? 0 : 30} />
                    <YAxis width={YAXIS_WIDTH} tickLine={false} tick={{ fontSize: 11, fill: 'var(--text-secondary)' }} tickFormatter={(v) => v.toFixed(1)} />
                    <ReferenceLine y={0} stroke="var(--border)" strokeWidth={1} />
                    <Tooltip
                      {...tooltipStyle}
                      formatter={(v, name) => [v != null ? v.toFixed(3) : '—', name]}
                      labelFormatter={(d) => fmtTooltipLabel(d, mode)}
                    />
                    <Bar dataKey="macdHistogram" fill="#60a5fa" opacity={0.5} isAnimationActive={false} name="Histogram" />
                    <Line type="monotone" dataKey="macdLine"   stroke="#60a5fa" strokeWidth={1.5} dot={false} isAnimationActive={false} connectNulls={false} name="MACD" />
                    <Line type="monotone" dataKey="macdSignal" stroke="#f97316" strokeWidth={1.5} dot={false} isAnimationActive={false} connectNulls={false} name="Signal" />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            )}

            {/* ── VMACD sub-panel ── */}
            {showVMACD && (
              <div className={styles.subPanel}>
                <span className={styles.panelLabel}>VMACD (12, 26, 9)</span>
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={chartData} margin={AXIS_MARGIN}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                    <XAxis dataKey="date" interval={0} tickLine={false} tick={renderTick} height={30} />
                    <YAxis width={YAXIS_WIDTH} tickLine={false} tick={{ fontSize: 11, fill: 'var(--text-secondary)' }} tickFormatter={(v) => v.toFixed(1)} />
                    <ReferenceLine y={0} stroke="var(--border)" strokeWidth={1} />
                    <Tooltip
                      {...tooltipStyle}
                      formatter={(v, name) => [v != null ? v.toFixed(3) : '—', name]}
                      labelFormatter={(d) => fmtTooltipLabel(d, mode)}
                    />
                    <Bar dataKey="vmacdHistogram" fill="#34d399" opacity={0.5} isAnimationActive={false} name="Histogram" />
                    <Line type="monotone" dataKey="vmacdLine"   stroke="#34d399" strokeWidth={1.5} dot={false} isAnimationActive={false} connectNulls={false} name="VMACD" />
                    <Line type="monotone" dataKey="vmacdSignal" stroke="#f97316" strokeWidth={1.5} dot={false} isAnimationActive={false} connectNulls={false} name="Signal" />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>
        ) : (
          <div className={styles.center}>No chart data available.</div>
        )
      )}
    </div>
  )
}
