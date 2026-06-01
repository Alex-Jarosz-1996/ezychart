# EzyChart

A stock financial dashboard SPA. FastAPI backend + React frontend, with a Go API gateway (quota tracking + Redis caching) sitting between the browser and the backend.

**Request flow:**
```
Browser → Nginx :80 → Go Gateway :8080 → FastAPI :8000 → Finnhub / FMP / StockData / Massive
                             ↕
                           Redis
```

---

## Docker (recommended)

### Prerequisites

Ensure `backend/.env` exists with your API keys and auth credentials:

```
FINNHUB_API_KEY=your_api_key_here
REQUESTS_CA_BUNDLE=/etc/ssl/certs/ca-certificates.crt
APP_PASSWORD=choose_a_strong_password
JWT_SECRET=a_long_random_string
```

`APP_PASSWORD` is the password users enter on the login page. `JWT_SECRET` is used to sign session tokens — set it to a long random string and keep it secret.

### Build and run

```bash
docker compose up --build
```

This starts five services: `nginx`, `gateway`, `backend`, `redis`, and `frontend`. No extra configuration needed — Redis and the gateway are wired together automatically.

| URL | What |
|-----|------|
| `http://localhost` | App |
| `http://localhost/api/quota/status` | Live API quota usage (JSON) |

No backend ports are exposed to the host — all traffic enters through nginx on port 80.

### Stop

```bash
docker compose down
```

### Rebuild after code changes

```bash
docker compose up --build
```

---

## Local development (without Docker)

Running without Docker requires three terminals: one each for the backend, gateway, and frontend. Redis must also be running locally.

### Redis

```bash
# macOS
brew install redis && brew services start redis

# Linux
sudo apt install redis-server && sudo systemctl start redis
```

Redis listens on `localhost:6379` by default — no configuration needed.

### Backend

#### Setup

```bash
cd backend
python3 -m venv venv
venv/bin/pip install -r requirements-dev.txt
```

Add your Finnhub API key and auth credentials to `.env`:

```
FINNHUB_API_KEY=your_api_key_here
REQUESTS_CA_BUNDLE=/etc/ssl/certs/ca-certificates.crt
APP_PASSWORD=choose_a_strong_password
JWT_SECRET=a_long_random_string
```

#### Run

```bash
cd backend
venv/bin/uvicorn main:app --reload --port 8000
```

Interactive docs: `http://localhost:8000/docs`

#### Tests

```bash
cd backend
venv/bin/pytest tests/ -v
```

35 tests across four files — no real Finnhub API calls are made:

| File | What it tests |
|------|--------------|
| `tests/test_auth.py` | Login endpoint, wrong password, missing/expired token |
| `tests/test_quote.py` | `GET /api/quote/{symbol}` — happy path, 404, 502, 403 without token |
| `tests/test_financials.py` | `GET /api/financials/{symbol}` — shape, groups, 404, 502, 403 without token |
| `tests/test_finnhub_service.py` | Service functions and TTL cache behaviour |

#### Lint and type check

```bash
cd backend
venv/bin/ruff check .
venv/bin/mypy .
```

#### Kill a stale process on port 8000

```bash
fuser -k 8000/tcp
```

---

### Go gateway

#### Setup

Go 1.21+ required. Dependencies are fetched automatically on first build.

#### Run

```bash
cd gateway
FASTAPI_URL=http://localhost:8000 REDIS_URL=localhost:6379 go run .
```

Gateway listens on `:8080`. The backend must be running first.

Quota status: `http://localhost:8080/api/quota/status`

#### Kill a stale process on port 8080

```bash
fuser -k 8080/tcp
```

---

### Frontend

#### Setup

```bash
cd frontend
npm install
```

#### Run

```bash
cd frontend
npm run dev
```

App: `http://localhost:5173`

> The backend (port 8000) and gateway (port 8080) must both be running for API calls to work.
>
> Copy `frontend/.env.example` to `frontend/.env` to point the dev server at the gateway:
> ```bash
> cp frontend/.env.example frontend/.env
> ```

#### Tests

```bash
cd frontend
npm test
```

58 tests across seven files — no backend connection required:

| File | What it tests |
|------|--------------|
| `src/test/LoginPage.test.jsx` | Password field render, wrong password error, successful login, token persisted |
| `src/test/SearchBar.test.jsx` | Submit uppercases and trims input, blank input guard, custom placeholder |
| `src/test/QuoteCard.test.jsx` | Symbol display, `$` prefix and two decimals, null fields show `—` |
| `src/test/MetricsGroup.test.jsx` | Dollar/percent/percent_decimal formatting, series `asOf` date, null filtering |
| `src/test/ReportedFinancials.test.jsx` | Section titles, B/M number suffixes, empty sections skipped |
| `src/test/CompareSearchBar.test.jsx` | Uppercase and clear on add, disabled at max, blank input guard |
| `src/test/CompareTable.test.jsx` | Formatting, loading/error states, remove button, ascending/descending sort |

To run in watch mode during development:

```bash
cd frontend
npm run test:watch
```

---

### Go gateway

The gateway has its own Go module and must be tested from inside its directory. No real Redis required — tests use an in-memory miniredis server.

#### Tests

```bash
cd gateway
go test ./tests/...
```

With verbose output:

```bash
cd gateway
go test ./tests/... -v
```

To run a single test:

```bash
cd gateway
go test ./tests/... -run TestHandleAPI_CacheHit -v
```

17 tests across three files:

| File | What it tests |
|------|--------------|
| `tests/config_test.go` | `RuleFor()` maps every route prefix to the correct API and cache TTL |
| `tests/cache_test.go` | Redis cache get/set/expiry, quota increment/check/expiry, `AllQuotaStatus` |
| `tests/handler_test.go` | Proxy passthrough, cache hit/miss, 429 on quota exhausted, cache bypasses quota, auth passthrough |

---

## API Reference

All examples use `http://localhost/api` (Docker, through nginx → gateway → backend). For local dev without Docker use `http://localhost:8080/api` (gateway → backend directly).

### `POST /api/auth/login`

Authenticates with the shared password and returns a JWT valid for 24 hours.

```bash
curl -X POST http://localhost/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"password": "your_password"}'
```

```json
{ "access_token": "<jwt>", "token_type": "bearer" }
```

All other API endpoints require `Authorization: Bearer <token>`.

---

### `GET /api/quote/{symbol}`

Returns the current day's price data for a given ticker.

```bash
curl http://localhost/api/quote/AAPL
```

```json
{
  "symbol": "AAPL",
  "current": 189.50,
  "high": 191.00,
  "low": 187.30,
  "open": 188.00
}
```

---

### `GET /api/financials/{symbol}`

Returns grouped financial metrics and reported financials (balance sheet, income statement, cash flow statement) for a given ticker.

```bash
curl http://localhost/api/financials/AAPL
```

```json
{
  "symbol": "AAPL",
  "metrics": {
    "valuation": {
      "52WeekHigh": 199.62,
      "52WeekLow": 164.08,
      "marketCap": 2950000,
      "peTTM": { "value": 28.4, "asOf": "2024-09-28" },
      "eps":   { "value": 6.57, "asOf": "2024-09-28" }
    },
    "returns": {
      "roeTTM":  { "value": 1.47, "asOf": "2024-09-28" },
      "roaTTM":  { "value": 0.28, "asOf": "2024-09-28" }
    },
    "margins": {
      "grossMarginTTM":     45.96,
      "netProfitMarginTTM": 26.44,
      "operatingMarginTTM": 31.51
    },
    "ratios":   { ... },
    "debt":     { ... },
    "equity":   { ... },
    "ev":       { ... },
    "cashFlow": { ... }
  },
  "reported": {
    "balanceSheet":      [ { "label": "Total Assets", "value": 364980000000 }, ... ],
    "incomeStatement":   [ { "label": "Gross Profit",  "value": 180683000000 }, ... ],
    "cashFlowStatement": [ { "label": "Net Income",    "value": 93736000000 },  ... ]
  }
}
```

**Series fields** (e.g. `peTTM`, `roeTTM`) return an object with the most recent quarterly value and the date it was recorded:
```json
{ "value": 28.4, "asOf": "2024-09-28" }
```

**Metric fields** (e.g. `grossMarginTTM`, `marketCap`) return a plain number.

---

### Error responses

| Status | Meaning |
|--------|---------|
| 401 | Wrong password or expired token |
| 403 | No token provided |
| 404 | Symbol not found or no data available |
| 502 | Upstream Finnhub API error |
