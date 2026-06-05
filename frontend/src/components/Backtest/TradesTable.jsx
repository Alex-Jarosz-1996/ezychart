import styles from './TradesTable.module.css'

function exportCSV(label, trades, compoundPct, buyAndHoldPct) {
  const rows = [
    ['Strategy', 'Buy Date', 'Buy Price', 'Sell Date', 'Sell Price', 'Profit %'],
    ...trades.map(t => [label, t.buy_date, t.buy_price.toFixed(2), t.sell_date, t.sell_price.toFixed(2), t.profit_pct.toFixed(2)]),
    [],
    ['Total Return', `${compoundPct.toFixed(2)}%`],
    ...(buyAndHoldPct != null ? [['Buy & Hold', `${buyAndHoldPct.toFixed(2)}%`]] : []),
  ]
  const csv = rows.map(r => r.join(',')).join('\n')
  const a = document.createElement('a')
  a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }))
  a.download = `${label.replace(/\s+/g, '_')}_backtest.csv`
  a.click()
  URL.revokeObjectURL(a.href)
}

const STRATEGY_LABELS = { sma: 'SMA Crossover', rsi: 'RSI', macd: 'MACD', vmacd: 'VMACD', combined: 'Combined' }

function fmtDate(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString(undefined, {
    month: 'short', day: 'numeric', year: 'numeric',
  })
}

function fmtPct(n) {
  const sign = n >= 0 ? '+' : ''
  return `${sign}${n.toFixed(2)}%`
}

function fmtDollar(n) {
  return n.toLocaleString('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function compoundedValue(trades, initial) {
  return trades.reduce((acc, t) => acc * (1 + t.profit_pct / 100), initial)
}

export default function TradesTable({ results, initialInvestment = 10_000, buyAndHoldPct }) {
  const strategies = Object.keys(results)
  if (strategies.length === 0) return null

  return (
    <div className={styles.wrap}>
      {strategies.map((strat) => {
        const { trades } = results[strat]
        const label = STRATEGY_LABELS[strat] ?? strat.toUpperCase()
        const finalValue = compoundedValue(trades, initialInvestment)
        const gain = finalValue - initialInvestment
        const compoundPct = trades.length > 0 ? (finalValue / initialInvestment - 1) * 100 : 0
        return (
          <div key={strat} className={styles.section}>
            <div className={styles.sectionHeader}>
              <span className={styles.stratLabel}>{label}</span>
              <span className={`${styles.total} ${compoundPct >= 0 ? styles.pos : styles.neg}`}>
                Total: {fmtPct(compoundPct)}
              </span>
              {trades.length > 0 && (
                <span className={`${styles.growth} ${gain >= 0 ? styles.pos : styles.neg}`}>
                  {fmtDollar(initialInvestment)} → {fmtDollar(finalValue)} ({gain >= 0 ? '+' : ''}{fmtDollar(gain)})
                </span>
              )}
              {buyAndHoldPct != null && (
                <span className={styles.bah}>
                  B&amp;H: <span className={buyAndHoldPct >= 0 ? styles.pos : styles.neg}>{fmtPct(buyAndHoldPct)}</span>
                </span>
              )}
              <span className={styles.count}>{trades.length} trade{trades.length !== 1 ? 's' : ''}</span>
              {trades.length > 0 && (
                <button className={styles.exportBtn} onClick={() => exportCSV(label, trades, compoundPct, buyAndHoldPct)}>
                  Export CSV
                </button>
              )}
            </div>
            {trades.length === 0 ? (
              <p className={styles.noTrades}>No completed trades in this period.</p>
            ) : (
              <div className={styles.tableWrap}>
                <table className={styles.table}>
                  <thead>
                    <tr>
                      <th>Buy Date</th>
                      <th>Buy Price</th>
                      <th>Sell Date</th>
                      <th>Sell Price</th>
                      <th>Profit</th>
                    </tr>
                  </thead>
                  <tbody>
                    {trades.map((tr, i) => (
                      <tr key={i}>
                        <td>{fmtDate(tr.buy_date)}</td>
                        <td>${tr.buy_price.toFixed(2)}</td>
                        <td>{fmtDate(tr.sell_date)}</td>
                        <td>${tr.sell_price.toFixed(2)}</td>
                        <td className={tr.profit_pct >= 0 ? styles.pos : styles.neg}>
                          {fmtPct(tr.profit_pct)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
