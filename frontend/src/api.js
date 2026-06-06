const BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:8000/api'

function _toMessage(status, err) {
  if (status === 404) return 'Incorrect stock ticker entered'
  const detail = err?.detail
  if (Array.isArray(detail)) return detail[0]?.msg ?? 'Request failed'
  if (typeof detail === 'string' && detail) return detail
  return 'Request failed'
}

const handle = async (res) => {
  if (!res.ok) {
    const err = await res.json().catch(() => null)
    throw new Error(_toMessage(res.status, err))
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

export async function* streamChatMessage(message, history, token) {
  const resp = await fetch(`${BASE}/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders(token) },
    body: JSON.stringify({ message, history }),
  })
  if (!resp.ok) {
    const err = await resp.json().catch(() => null)
    throw new Error(_toMessage(resp.status, err))
  }

  const reader = resp.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split('\n')
    buffer = lines.pop() ?? ''
    for (const line of lines) {
      if (!line.startsWith('data: ')) continue
      const data = line.slice(6).trim()
      if (data === '[DONE]') return
      let parsed
      try { parsed = JSON.parse(data) } catch { continue }
      if (parsed.error) throw new Error(parsed.error)
      if (parsed.token) yield parsed.token
    }
  }
}

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
