import styles from './TradesTable.module.css'

const STRATEGY_LABELS = { sma: 'SMA Crossover', rsi: 'RSI', macd: 'MACD', vmacd: 'VMACD' }

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

export default function TradesTable({ results }) {
  const strategies = Object.keys(results)
  if (strategies.length === 0) return null

  return (
    <div className={styles.wrap}>
      {strategies.map((strat) => {
        const { trades, total_profit_pct } = results[strat]
        const label = STRATEGY_LABELS[strat] ?? strat.toUpperCase()
        return (
          <div key={strat} className={styles.section}>
            <div className={styles.sectionHeader}>
              <span className={styles.stratLabel}>{label}</span>
              <span className={`${styles.total} ${total_profit_pct >= 0 ? styles.pos : styles.neg}`}>
                Total: {fmtPct(total_profit_pct)}
              </span>
              <span className={styles.count}>{trades.length} trade{trades.length !== 1 ? 's' : ''}</span>
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
