# EzyChart

A self-hosted stock research dashboard. Search any ticker to get a live quote, financial metrics, price charts with technical indicators, an options chain, side-by-side comparisons, and strategy backtesting — all behind a single password-protected login.

**Request flow:**
```
Browser → Nginx :80 → Go Gateway :8080 → FastAPI :8000 → Finnhub / FMP / StockData / Massive
                            ↕
                          Redis
```

- **Go gateway** — sits between the browser and the backend; enforces per-API rate quotas, caches GET responses in Redis, and proxies backtest requests directly to the Go backtest service
- **FastAPI backend** — handles auth, aggregates data from external APIs, and serves the AI chat endpoint
- **Go backtest service** — stateless strategy runner; receives price data from the frontend, runs SMA / RSI / MACD / VMACD strategies, and returns trade-level results
- **React frontend** — served by Nginx; no backend ports are exposed to the host

---

## Features

### Ticker tab

Fetches a live quote and a full set of financial metrics for any symbol. Shows current price, day range, previous close, and groups of fundamental data: valuation, returns, margins, liquidity ratios, debt, equity, enterprise value, and cash flow. Reported financials (balance sheet, income statement, cash flow statement) are shown below.

```
Search: AAPL

Current   $189.50   ▲ +2.1%
High      $191.00
Low       $187.30
Open      $188.00
Prev Close $185.00

Valuation
  P/E (TTM)     28.4  (as of 2024-09-28)
  Market Cap    $2.95T
  EPS           $6.57 (as of 2024-09-28)
  52-week high  $199.62
  52-week low   $164.08

Margins
  Gross margin  45.96%
  Net margin    26.44%
  Op. margin    31.51%
```

### Chart tab

Interactive price chart for any ticker. Supports EOD (line or candlestick) and intraday (minute or hourly) modes with range selectors from 1 week to max. Technical indicators can be overlaid or shown in sub-panels:

| Indicator | Description |
|-----------|-------------|
| SMA 20 | 20-period simple moving average |
| SMA 50 | 50-period simple moving average |
| RSI | 14-period relative strength index with overbought (70) / oversold (30) bands |
| MACD | 12/26/9 MACD line, signal line, and histogram |
| VMACD | Volume-weighted MACD |

### Options tab

Displays the full options chain for a symbol, split into calls and puts. An optional strike price filter narrows results. Contract tickers are decoded to a human-readable format:

```
O:AAPL260513C00200000  →  AAPL May 13 2026 $200 Call
```

### Compare tab

Add up to 10 tickers and view their financial metrics side by side in a sortable table. Data is loaded in parallel; individual ticker errors don't block the rest. Tickers persist across page refreshes via `localStorage`.

### Backtest tab

Load 2 years of EOD candlestick data for any symbol, choose one or more strategies (SMA crossover, RSI mean-reversion, MACD, VMACD), configure their parameters and an initial investment amount, then run the backtest. Results show per-strategy P&L, a trades table, and a comparison against buy-and-hold for the same period.

```
Symbol: TSLA   Initial: $10,000

Strategy  Return    Trades  vs Buy-and-Hold
SMA       +34.2%    12      +8.1 pp
RSI       +19.7%    31      -6.4 pp
Buy & Hold +26.1%   —       —
```

### AI Research (chat panel)

A floating chat panel powered by Claude via OpenRouter. Maintains a per-session conversation history (up to 20 messages). Useful for interpreting metrics, understanding financials, or asking general research questions. Streamed token-by-token over SSE.

---

## Prerequisites

### API keys

All keys go in `backend/.env`:

```dotenv
# Auth
APP_PASSWORD=choose_a_strong_password
JWT_SECRET=a_long_random_string_keep_it_secret

# Market data
FINNHUB_API_KEY=your_key       # quotes, financials, options
FMP_API_KEY=your_key           # EOD/candlestick charts, MCP tools
STOCKDATA_API_KEY=your_key     # EOD chart fallback
MASSIVE_API_KEY=your_key       # intraday data

# AI chat
OPENROUTER_API_KEY=your_key
OPENROUTER_MODEL=anthropic/claude-3-5-haiku  # or any OpenRouter model ID

# Redis (set by docker-compose; override for local dev)
REDIS_URL=redis://localhost:6379
REDIS_PASSWORD=choose_a_password

# TLS (Linux/Docker only, needed by the requests library)
REQUESTS_CA_BUNDLE=/etc/ssl/certs/ca-certificates.crt
```

`APP_PASSWORD` is the password users enter on the login screen. `JWT_SECRET` signs session tokens — use a long random string and keep it private.

### Tools

| Tool | Version | Required for |
|------|---------|-------------|
| Docker + Compose | any recent | Docker mode |
| Go | 1.21+ | local gateway / backtest dev |
| Python | 3.10+ | local backend dev |
| Node.js | 18+ | local frontend dev |

---

## Running

### Docker (recommended)

```bash
docker compose up --build
```

Starts five services: `frontend` (Nginx), `gateway`, `backend`, `backtest`, and `redis`. No extra config needed.

| URL | What |
|-----|------|
| `http://localhost` | App |
| `http://localhost/api/quota/status` | Live API quota usage (JSON) |

```bash
# Stop
docker compose down

# Rebuild after code changes
docker compose up --build
```

---

### Local development (without Docker)

Run Redis first, then start each service in its own terminal.

#### Redis

```bash
# macOS
brew install redis && brew services start redis

# Linux
sudo apt install redis-server && sudo systemctl start redis
```

Redis listens on `localhost:6379` by default.

#### Backend

```bash
cd backend
python3 -m venv venv
venv/bin/pip install -r requirements-dev.txt
venv/bin/uvicorn main:app --reload --port 8000
```

Interactive API docs: `http://localhost:8000/docs`

```bash
# Kill a stale process
fuser -k 8000/tcp
```

#### Go gateway

```bash
cd gateway
FASTAPI_URL=http://localhost:8000 REDIS_URL=localhost:6379 go run .
```

Listens on `:8080`. The backend must be running first.

```bash
# Kill a stale process
fuser -k 8080/tcp
```

#### Go backtest service

```bash
cd backtest
JWT_SECRET=<same_value_as_backend_env> go run .
```

Listens on `:8090`.

#### Frontend

```bash
cd frontend
npm install
```

Create `frontend/.env` and point it at the gateway:

```dotenv
VITE_API_URL=http://localhost:8080/api
```

```bash
npm run dev
```

App: `http://localhost:5173`

> The backend (`:8000`), gateway (`:8080`), and backtest service (`:8090`) must all be running for full functionality.

---

## Testing

### Backend (Python / pytest)

96 tests — no real API calls are made; all external services are mocked.

```bash
cd backend
venv/bin/pytest tests/ -v
```

| File | Tests | What it covers |
|------|-------|---------------|
| `test_auth.py` | 6 | Login, wrong password, missing/expired token |
| `test_quote.py` | 7 | `GET /api/quote/{symbol}` — happy path, 404, 502, auth |
| `test_financials.py` | 9 | `GET /api/financials/{symbol}` — shape, groups, 404, 502, auth |
| `test_chart_route.py` | 16 | EOD, candlestick, intraday endpoints — shape, range, auth |
| `test_chart_service.py` | 24 | Service-level normalisation and cache behaviour |
| `test_finnhub_service.py` | 13 | Service functions and TTL cache |
| `test_options.py` | 8 | Options chain — shape, empty response, auth |
| `test_ai_route.py` | 6 | SSE chat stream — tokens, error mid-stream, auth |
| `test_mcp_route.py` | 7 | MCP tool call endpoint — auth, happy path, tool errors |

### Frontend (Vitest)

104 tests — no backend connection required.

```bash
cd frontend
npm test          # single run
npm run test:watch  # watch mode
```

| File | Tests | What it covers |
|------|-------|---------------|
| `indicators.test.js` | 20 | `calcSMA`, `calcRSI`, `calcMACD`, `calcVMACD` — null propagation, rolling averages, histogram invariant |
| `MetricsGroup.test.jsx` | 15 | Dollar / percent / percent_decimal formatting, series `asOf` date, null filtering |
| `CompareTable.test.jsx` | 14 | Formatting, loading/error states, remove button, sort |
| `ReportedFinancials.test.jsx` | 13 | Section titles, B/M suffixes, empty sections skipped |
| `StockChart.test.jsx` | 10 | Mode and range toggles, loading/error/empty states |
| `chartUtils.test.js` | 9 | `niceScale` — tick ordering, range coverage, flat/zero/non-finite inputs |
| `OptionsChain.test.jsx` | 7 | Calls/puts display, strike filter, loading/error states |
| `SearchBar.test.jsx` | 4 | Uppercases and trims input, blank guard, custom placeholder |
| `QuoteCard.test.jsx` | 4 | Symbol display, `$` prefix + two decimals, null fields show `—` |
| `LoginPage.test.jsx` | 4 | Password field, wrong password error, successful login, token persisted |
| `CompareSearchBar.test.jsx` | 4 | Uppercase on add, disabled at max, blank guard |

### Go gateway (Go test)

33 tests — uses an in-memory [miniredis](https://github.com/alicebob/miniredis) server; no real Redis required.

```bash
cd gateway
go test ./tests/... -v

# Run a single test
go test ./tests/... -run TestHandleAPI_CacheHit -v
```

| File | Tests | What it covers |
|------|-------|---------------|
| `tests/config_test.go` | — | `RuleFor()` maps every route prefix to the correct API and cache TTL |
| `tests/cache_test.go` | — | Redis cache get/set/expiry, quota increment/check, `AllQuotaStatus` |
| `tests/handler_test.go` | — | Proxy passthrough, cache hit/miss, 429 on quota exhausted, auth passthrough |

### Go backtest service (Go test)

40 tests — pure unit tests, no network or Redis required.

```bash
cd backtest
go test . -v
```

Covers rate limiting (`allowRequest`), IP extraction, parameter validation, position intersection, P&L calculation, and the HTTP handler end-to-end.

---

## API reference

All examples use `http://localhost/api` (Docker). For local dev without Docker use `http://localhost:8080/api`.

### `POST /api/auth/login`

Returns a JWT valid for 24 hours. All other endpoints require `Authorization: Bearer <token>`.

```bash
curl -X POST http://localhost/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"password": "your_password"}'
```

```json
{ "access_token": "<jwt>", "token_type": "bearer" }
```

### `GET /api/quote/{symbol}`

```bash
curl -H 'Authorization: Bearer <token>' http://localhost/api/quote/AAPL
```

```json
{
  "symbol": "AAPL",
  "current": 189.50,
  "high": 191.00,
  "low": 187.30,
  "open": 188.00,
  "prev_close": 185.00
}
```

### `GET /api/financials/{symbol}`

```bash
curl -H 'Authorization: Bearer <token>' http://localhost/api/financials/AAPL
```

```json
{
  "symbol": "AAPL",
  "metrics": {
    "valuation": {
      "52WeekHigh": 199.62,
      "peTTM": { "value": 28.4, "asOf": "2024-09-28" },
      "eps":   { "value": 6.57, "asOf": "2024-09-28" }
    },
    "margins": {
      "grossMarginTTM": 45.96,
      "netProfitMarginTTM": 26.44
    }
  },
  "reported": {
    "balanceSheet":      [{ "label": "Total Assets", "value": 364980000000 }],
    "incomeStatement":   [{ "label": "Gross Profit",  "value": 180683000000 }],
    "cashFlowStatement": [{ "label": "Net Income",    "value": 93736000000 }]
  }
}
```

Series fields (e.g. `peTTM`) return `{ "value": ..., "asOf": "YYYY-MM-DD" }`. Plain metric fields return a number.

### `GET /api/chart/eod/{symbol}?rng={range}`

`rng`: `1w` `1m` `3m` `6m` `1y` `2y` `max`

### `GET /api/chart/eod-candle/{symbol}?rng={range}`

Returns OHLCV candle data for the same ranges.

### `GET /api/chart/intraday/{symbol}?interval={interval}`

`interval`: `minute` `hour`

### `GET /api/options/{symbol}?strike_price={price}`

Returns calls and puts. `strike_price` is optional.

### `POST /api/backtest/run`

Accepts a price array, strategy list, and per-strategy parameters. Returns trade-level results and a buy-and-hold benchmark.

### `POST /api/chat`

Streams an AI response as SSE tokens. Accepts `{ message, history }`.

### Error responses

| Status | Meaning |
|--------|---------|
| 401 | Missing, invalid, or expired token |
| 404 | Symbol not found / no data available |
| 429 | API quota exhausted |
| 502 | Upstream API error |
