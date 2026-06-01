const BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:8000/api'

const handle = async (res) => {
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }))
    throw new Error(err.detail || 'Request failed')
  }
  return res.json()
}

const authHeaders = (token) =>
  token ? { Authorization: `Bearer ${token}` } : {}

export const login = (password) =>
  fetch(`${BASE}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password }),
  }).then(handle)

export const fetchQuote = (symbol, token) =>
  fetch(`${BASE}/quote/${symbol.toUpperCase()}`, { headers: authHeaders(token) }).then(handle)

export const fetchFinancials = (symbol, token) =>
  fetch(`${BASE}/financials/${symbol.toUpperCase()}`, { headers: authHeaders(token) }).then(handle)

export const fetchAll = (symbol, token) =>
  Promise.all([fetchQuote(symbol, token), fetchFinancials(symbol, token)])

export const getEODChart = (symbol, token, range = '1y') =>
  fetch(`${BASE}/chart/eod/${symbol.toUpperCase()}?rng=${range}`, {
    headers: authHeaders(token),
  }).then(handle)

export const getCandlestickChart = (symbol, token, range = '1y') =>
  fetch(`${BASE}/chart/eod-candle/${symbol.toUpperCase()}?rng=${range}`, {
    headers: authHeaders(token),
  }).then(handle)

export const getIntradayChart = (symbol, token, interval = 'minute') =>
  fetch(`${BASE}/chart/intraday/${symbol.toUpperCase()}?interval=${interval}`, {
    headers: authHeaders(token),
  }).then(handle)

export const sendChatMessage = (message, token) =>
  fetch(`${BASE}/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders(token) },
    body: JSON.stringify({ message }),
  }).then(handle)

export const runBacktest = (prices, strategies, params, token) =>
  fetch(`${BASE}/backtest/run`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders(token) },
    body: JSON.stringify({ prices, strategies, params }),
  }).then(handle)

export const fetchOptionsChain = (symbol, token, strikePrice = null) => {
  const url = strikePrice
    ? `${BASE}/options/${symbol.toUpperCase()}?strike_price=${strikePrice}`
    : `${BASE}/options/${symbol.toUpperCase()}`
  return fetch(url, { headers: authHeaders(token) }).then(handle)
}
