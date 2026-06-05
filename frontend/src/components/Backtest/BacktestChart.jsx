import {
  ResponsiveContainer,
  ComposedChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  useXAxisScale,
  useYAxisScale,
} from 'recharts'
import { niceScale } from '../../utils/chartUtils.js'
import styles from './BacktestChart.module.css'

const PROFIT_COLOR = '#22c55e'
const LOSS_COLOR   = '#ef4444'

function Triangle({ cx, cy, fill, direction }) {
  const size = 8
  const points = direction === 'up'
    ? `${cx},${cy - size} ${cx - size},${cy + size} ${cx + size},${cy + size}`
    : `${cx},${cy + size} ${cx - size},${cy - size} ${cx + size},${cy - size}`
  return <polygon points={points} fill={fill} opacity={0.9} />
}

// Uses Recharts 3 hooks to get the live axis scales and draw triangles at exact positions.
function SignalMarkers({ signals }) {
  const xScale = useXAxisScale(0)
  const yScale = useYAxisScale(0)
  if (!xScale || !yScale) return null

  const bw = xScale.bandwidth ? xScale.bandwidth() / 2 : 0

  return (
    <g>
      {signals.map((s, i) => {
        const cx = xScale(s.date) + bw
        const cy = yScale(s.price)
        if (cx == null || cy == null || isNaN(cx) || isNaN(cy)) return null
        return <Triangle key={i} cx={cx} cy={cy} fill={s.fill} direction={s.direction} />
      })}
    </g>
  )
}

function fmtDate(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString(undefined, {
    month: 'short', day: 'numeric', year: 'numeric',
  })
}

export default function BacktestChart({ priceData, results }) {
  if (!priceData?.length) return null

  const chartData = priceData.map((p) => ({ date: p.date, price: p.close }))

  const allSignals = []

  Object.entries(results).forEach(([strat, result]) => {
    // Map each buy/sell date to its trade's profit so we can colour by outcome
    const profitMap = new Map()
    result.trades?.forEach((t) => {
      profitMap.set(`${t.buy_date}-buy`, t.profit_pct)
      profitMap.set(`${t.sell_date}-sell`, t.profit_pct)
    })

    result.signals.forEach((s) => {
      const profit = profitMap.get(`${s.date}-${s.type}`) ?? 0
      allSignals.push({
        date: s.date,
        price: s.price,
        fill: profit >= 0 ? PROFIT_COLOR : LOSS_COLOR,
        direction: s.type === 'buy' ? 'up' : 'down',
      })
    })
  })

  const legendItems = [
    { fill: PROFIT_COLOR, label: 'Profit' },
    { fill: LOSS_COLOR,   label: 'Loss'   },
  ]

  const prices = priceData.map((p) => p.close).filter(Number.isFinite)
  const { min, max, ticks: priceTicks } = niceScale(Math.min(...prices), Math.max(...prices))
  const domain = [min, max]

  return (
    <div className={styles.chartWrap}>
      <div className={styles.legend}>
        {legendItems.map((item, i) => (
          <span key={i} className={styles.legendItem}>
            <span className={styles.legendDot} style={{ background: item.fill }} />
            {item.label}
          </span>
        ))}
      </div>
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={chartData} margin={{ top: 4, right: 16, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
          <XAxis
            dataKey="date"
            interval="preserveStartEnd"
            tickLine={false}
            tick={{ fontSize: 11, fill: 'var(--text-secondary)' }}
            tickFormatter={(d) => {
              const [y, m] = d.split('-').map(Number)
              return new Date(y, m - 1, 1).toLocaleDateString(undefined, { month: 'short', year: '2-digit' })
            }}
          />
          <YAxis
            domain={domain}
            ticks={priceTicks}
            tick={{ fontSize: 11, fill: 'var(--text-secondary)' }}
            tickLine={false}
            tickFormatter={(v) => `$${v.toFixed(0)}`}
            width={60}
          />
          <Tooltip
            contentStyle={{
              background: 'var(--bg-card)',
              border: '1px solid var(--border)',
              borderRadius: 8,
              fontSize: 12,
            }}
            formatter={(value, name) => [`$${Number(value).toFixed(2)}`, name]}
            labelFormatter={fmtDate}
          />
          <Line
            type="monotone"
            dataKey="price"
            stroke="var(--accent)"
            strokeWidth={1.5}
            dot={false}
            isAnimationActive={false}
          />
          <SignalMarkers signals={allSignals} />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  )
}
