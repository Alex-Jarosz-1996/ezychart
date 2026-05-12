import { useEffect, useState } from 'react'
import { fetchOptionsChain } from '../../api.js'
import styles from './OptionsChain.module.css'

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']

// Parses OCC ticker format: O:AAPL260513C00200000
// → "AAPL May 13 2026 200 Call"
function formatTicker(ticker) {
  const raw = ticker.startsWith('O:') ? ticker.slice(2) : ticker
  const m = raw.match(/^([A-Z.]+)(\d{2})(\d{2})(\d{2})([CP])(\d{8})$/)
  if (!m) return ticker
  const [, underlying, yy, mm, dd, type, strikeRaw] = m
  const month = MONTHS[parseInt(mm, 10) - 1]
  const day = parseInt(dd, 10)
  const year = `20${yy}`
  const strike = parseInt(strikeRaw, 10) / 1000
  const strikeStr = strike % 1 === 0 ? `$${String(strike)}` : `$${strike.toFixed(2)}`
  const contractType = type === 'C' ? 'Call' : 'Put'
  return `${underlying} ${month} ${day} ${year} ${strikeStr} ${contractType}`
}

export default function OptionsChain({ symbol, token, onUnauthorized }) {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [strikeInput, setStrikeInput] = useState('')
  const [strikePrice, setStrikePrice] = useState(null)

  // New symbol → wipe everything so a fresh search never shows stale rows
  useEffect(() => {
    setData(null)
    setError(null)
    setStrikeInput('')
    setStrikePrice(null)
  }, [symbol])

  // Fetch whenever symbol or strikePrice changes.
  // When only strikePrice changes, data stays visible during the load.
  useEffect(() => {
    if (!symbol) return
    setLoading(true)
    setError(null)
    fetchOptionsChain(symbol, token, strikePrice)
      .then(setData)
      .catch((e) => {
        if (e.message === 'Unauthorized' || e.message.includes('401')) {
          onUnauthorized()
          return
        }
        setError(e.message)
      })
      .finally(() => setLoading(false))
  }, [symbol, token, strikePrice, onUnauthorized])

  const handleStrikeSubmit = (e) => {
    e.preventDefault()
    const val = parseFloat(strikeInput)
    setStrikePrice(isNaN(val) || val <= 0 ? null : val)
  }

  const handleStrikeClear = () => {
    setStrikeInput('')
    setStrikePrice(null)
  }

  if (!data && loading) return <div className={styles.loading}>Loading...</div>
  if (!data && error) return <div className={styles.error}>{error}</div>
  if (!data) return null

  return (
    <div>
      <form className={styles.filterRow} onSubmit={handleStrikeSubmit}>
        <div className={styles.strikeInputWrapper}>
          <span className={styles.strikePrefix}>$</span>
          <input
            type="number"
            min="0"
            step="any"
            placeholder="Strike price (optional)"
            value={strikeInput}
            onChange={(e) => setStrikeInput(e.target.value)}
            className={styles.strikeInput}
          />
        </div>
        <button type="submit" className={styles.filterBtn}>Filter</button>
        {strikePrice !== null && (
          <button type="button" className={styles.clearBtn} onClick={handleStrikeClear}>Clear</button>
        )}
      </form>
      {loading && <div className={styles.loading}>Loading...</div>}
      {error && <div className={styles.error}>{error}</div>}
      <div className={styles.grid}>
        <ContractTable title="Calls" contracts={data.calls} variant="call" />
        <ContractTable title="Puts" contracts={data.puts} variant="put" />
      </div>
    </div>
  )
}

function ContractTable({ title, contracts, variant }) {
  const rowClass = variant === 'call' ? styles.callRow : styles.putRow
  return (
    <div className={styles.section}>
      <div className={styles.sectionTitle}>
        {title}
        <span className={styles.count}>{contracts.length}</span>
      </div>
      {contracts.length === 0 ? (
        <div className={styles.empty}>No {title.toLowerCase()} found.</div>
      ) : (
        <table className={styles.table}>
          <thead>
            <tr>
              <th>Contract</th>
              <th>Expiry</th>
            </tr>
          </thead>
          <tbody>
            {contracts.map((c) => (
              <tr key={c.ticker} className={rowClass}>
                <td>{formatTicker(c.ticker)}</td>
                <td>{c.expiration_date}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}
