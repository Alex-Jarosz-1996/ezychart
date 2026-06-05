import { useState, useEffect, useLayoutEffect, useRef } from 'react'
import { fetchAll } from './api.js'
import styles from './App.module.css'
import { TOKEN_KEY, STORAGE_KEY, THEME_KEY } from './constants.js'
import SearchBar from './components/SearchBar.jsx'
import QuoteCard from './components/SingleView/QuoteCard.jsx'
import MetricsGroup from './components/SingleView/MetricsGroup.jsx'
import ReportedFinancials from './components/SingleView/ReportedFinancials.jsx'
import CompareSearchBar from './components/CompareView/CompareSearchBar.jsx'
import CompareTable from './components/CompareView/CompareTable.jsx'
import StockChart from './components/Chart/StockChart.jsx'
import OptionsChain from './components/OptionsChain/OptionsChain.jsx'
import LoginPage from './pages/LoginPage.jsx'
import ResearchPanel from './components/Research/ResearchPanel.jsx'
import BacktestPanel from './components/Backtest/BacktestPanel.jsx'
import { SkeletonQuoteCard, SkeletonMetricsGroup } from './components/Skeleton.jsx'

const MAX_COMPARE = 10

const GROUP_LABELS = {
  valuation: 'Valuation',
  returns: 'Returns',
  margins: 'Margins',
  ratios: 'Liquidity Ratios',
  debt: 'Debt',
  equity: 'Equity',
  ev: 'Enterprise Value',
  cashFlow: 'Cash Flow',
}

export default function App() {
  const [isDark, setIsDark] = useState(() => {
    try { return localStorage.getItem(THEME_KEY) !== 'light' }
    catch { return true }
  })

  useLayoutEffect(() => {
    document.documentElement.setAttribute('data-theme', isDark ? 'dark' : 'light')
  }, [isDark])

  const toggleTheme = () => {
    const next = !isDark
    setIsDark(next)
    localStorage.setItem(THEME_KEY, next ? 'dark' : 'light')
  }

  const [token, setToken] = useState(() => localStorage.getItem(TOKEN_KEY))
  const [sessionExpired, setSessionExpired] = useState(false)

  const handleLogin = (t) => {
    setSessionExpired(false)
    setToken(t)
  }

  const handleLogout = () => {
    localStorage.removeItem(TOKEN_KEY)
    setToken(null)
  }

  const handle401 = () => {
    localStorage.removeItem(TOKEN_KEY)
    setSessionExpired(true)
    setToken(null)
  }

  const [tab, setTab] = useState('single')
  const tabRefs = useRef({})
  const [indicator, setIndicator] = useState({ width: 0, left: 0 })
  useEffect(() => {
    const el = tabRefs.current[tab]
    if (el) setIndicator({ width: el.offsetWidth, left: el.offsetLeft })
  }, [tab])

  const [singleLoading, setSingleLoading] = useState(false)
  const [singleError, setSingleError] = useState(null)
  const [currentSymbol, setCurrentSymbol] = useState(null)
  const [quote, setQuote] = useState(null)
  const [financials, setFinancials] = useState(null)

  const [chartSymbol, setChartSymbol] = useState(null)
  const [optionsSymbol, setOptionsSymbol] = useState(null)

  const [compareTickers, setCompareTickers] = useState(() => {
    try { return JSON.parse(localStorage.getItem(STORAGE_KEY)) || [] }
    catch { return [] }
  })
  const [compareData, setCompareData] = useState({})

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(compareTickers))
  }, [compareTickers])

  useEffect(() => {
    if (token) {
      compareTickers.forEach((sym) => {
        if (!compareData[sym]) loadCompareTicker(sym)
      })
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const handleSingleSearch = async (symbol) => {
    setSingleLoading(true)
    setSingleError(null)
    setCurrentSymbol(symbol.toUpperCase())
    setQuote(null)
    setFinancials(null)
    try {
      const [q, f] = await fetchAll(symbol, token)
      setQuote(q)
      setFinancials(f)
    } catch (e) {
      if (e.message === 'Unauthorized' || e.message.includes('401')) { handle401(); return }
      setSingleError(e.message)
    } finally {
      setSingleLoading(false)
    }
  }

  const loadCompareTicker = async (symbol) => {
    setCompareData((prev) => ({ ...prev, [symbol]: null }))
    try {
      const [q, f] = await fetchAll(symbol, token)
      setCompareData((prev) => ({ ...prev, [symbol]: { quote: q, financials: f } }))
    } catch (e) {
      if (e.message === 'Unauthorized' || e.message.includes('401')) { handle401(); return }
      setCompareData((prev) => ({ ...prev, [symbol]: { error: e.message } }))
    }
  }

  const handleCompareAdd = (symbol) => {
    if (compareTickers.includes(symbol) || compareTickers.length >= MAX_COMPARE) return
    setCompareTickers((prev) => [...prev, symbol])
    loadCompareTicker(symbol)
  }

  const handleCompareRemove = (symbol) => {
    setCompareTickers((prev) => prev.filter((s) => s !== symbol))
    setCompareData((prev) => { const next = { ...prev }; delete next[symbol]; return next })
  }

  if (!token) return <LoginPage onLogin={handleLogin} sessionExpired={sessionExpired} />

  return (
    <>
    <div className={styles.app}>
      <div className={styles.header}>
        <div className={styles.title}>EzyChart</div>
        <div className={styles.headerActions}>
          <button className={styles.themeBtn} onClick={toggleTheme}>
            {isDark ? 'Light mode' : 'Dark mode'}
          </button>
          <button className={styles.logoutBtn} onClick={handleLogout}>
            Log out
          </button>
        </div>
      </div>

      <div className={styles.tabs}>
        <div
          className={styles.tabIndicator}
          style={{ width: indicator.width, transform: `translateX(${indicator.left}px)` }}
        />
        {[['single', 'Ticker'], ['compare', 'Compare'], ['chart', 'Chart'], ['options', 'Options'], ['backtest', 'Backtest']].map(([key, label]) => (
          <button
            key={key}
            ref={el => { tabRefs.current[key] = el }}
            className={`${styles.tab} ${tab === key ? styles.tabActive : ''}`}
            onClick={() => setTab(key)}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === 'single' && (
        <div key="single" className={styles.tabContent}>
          <SearchBar onSearch={handleSingleSearch} />
          {singleLoading && (
            <>
              <SkeletonQuoteCard />
              <SkeletonMetricsGroup rows={5} />
              <SkeletonMetricsGroup rows={4} />
              <SkeletonMetricsGroup rows={6} />
            </>
          )}
          {singleError && <div className={styles.error}>{singleError}</div>}
          {quote && <QuoteCard quote={quote} />}
          {financials && (
            <>
              {Object.entries(financials.metrics).map(([group, data]) => (
                <MetricsGroup key={group} title={GROUP_LABELS[group] || group} data={data} />
              ))}
              <ReportedFinancials reported={financials.reported} />
            </>
          )}
          {!singleLoading && !quote && !singleError && (
            <div className={styles.empty}>Search for a ticker to get started.</div>
          )}
        </div>
      )}

      {tab === 'chart' && (
        <div key="chart" className={styles.tabContent}>
          <SearchBar onSearch={setChartSymbol} />
          {chartSymbol
            ? <StockChart symbol={chartSymbol} token={token} />
            : <div className={styles.empty}>Search for a ticker to view its chart.</div>
          }
        </div>
      )}

      {tab === 'options' && (
        <div key="options" className={styles.tabContent}>
          <SearchBar onSearch={setOptionsSymbol} />
          {optionsSymbol
            ? <OptionsChain symbol={optionsSymbol} token={token} onUnauthorized={handle401} />
            : <div className={styles.empty}>Search for a ticker to view its options chain.</div>
          }
        </div>
      )}

      {tab === 'compare' && (
        <div key="compare" className={styles.tabContent}>
          <CompareSearchBar onAdd={handleCompareAdd} count={compareTickers.length} max={MAX_COMPARE} />
          {compareTickers.length === 0 ? (
            <div className={styles.empty}>Add up to {MAX_COMPARE} tickers to compare them.</div>
          ) : (
            <CompareTable tickers={compareTickers} data={compareData} onRemove={handleCompareRemove} />
          )}
        </div>
      )}
      {tab === 'backtest' && (
        <div key="backtest" className={styles.tabContent}>
          <BacktestPanel token={token} />
        </div>
      )}
    </div>
    <ResearchPanel token={token} />
    </>
  )
}
