import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { vi } from 'vitest'
import StockChart from '../components/Chart/StockChart.jsx'
import * as api from '../api.js'

const MOCK_EOD = {
  symbol: 'AAPL',
  range: '1y',
  data: [
    { date: '2024-01-02', price: 187.0, volume: 50000000 },
    { date: '2024-01-03', price: 189.0, volume: 48000000 },
  ],
}

const MOCK_INTRADAY = {
  symbol: 'AAPL',
  interval: '5min',
  data: [
    { date: '2024-01-03T10:00:00', open: 187.0, high: 188.5, low: 186.5, close: 188.0, volume: 1200000 },
    { date: '2024-01-03T10:05:00', open: 188.0, high: 189.0, low: 187.5, close: 188.5, volume: 900000 },
  ],
}

beforeEach(() => {
  vi.restoreAllMocks()
})

describe('StockChart', () => {
  it('shows loading state while fetching', () => {
    vi.spyOn(api, 'getEODChart').mockReturnValue(new Promise(() => {}))

    render(<StockChart symbol="AAPL" token="tok" />)

    expect(screen.getByText(/loading/i)).toBeInTheDocument()
  })

  it('renders EOD chart data after load', async () => {
    vi.spyOn(api, 'getEODChart').mockResolvedValue(MOCK_EOD)

    render(<StockChart symbol="AAPL" token="tok" />)

    await waitFor(() => expect(screen.queryByText(/loading/i)).not.toBeInTheDocument())
    expect(screen.getByText(/price chart/i)).toBeInTheDocument()
  })

  it('shows error message on API failure', async () => {
    vi.spyOn(api, 'getEODChart').mockRejectedValue(new Error('FMP API unreachable'))

    render(<StockChart symbol="AAPL" token="tok" />)

    await waitFor(() => expect(screen.getByText(/FMP API unreachable/i)).toBeInTheDocument())
  })

  it('switches to intraday mode when Intraday button is clicked', async () => {
    vi.spyOn(api, 'getEODChart').mockResolvedValue(MOCK_EOD)
    const intradaySpy = vi.spyOn(api, 'getIntradayChart').mockResolvedValue(MOCK_INTRADAY)

    render(<StockChart symbol="AAPL" token="tok" />)
    await waitFor(() => expect(screen.queryByText(/loading/i)).not.toBeInTheDocument())

    fireEvent.click(screen.getByRole('button', { name: /intraday/i }))

    await waitFor(() => expect(intradaySpy).toHaveBeenCalledWith('AAPL', 'tok', '5min'))
  })

  it('calls refresh when refresh button is clicked', async () => {
    const eodSpy = vi.spyOn(api, 'getEODChart').mockResolvedValue(MOCK_EOD)

    render(<StockChart symbol="AAPL" token="tok" />)
    // Wait for initial load to finish
    await waitFor(() => expect(screen.queryByText(/loading/i)).not.toBeInTheDocument())
    const callsBefore = eodSpy.mock.calls.length

    fireEvent.click(screen.getByRole('button', { name: /refresh/i }))

    await waitFor(() => expect(eodSpy.mock.calls.length).toBeGreaterThan(callsBefore))
  })

  it('shows "no chart data" when data array is empty', async () => {
    vi.spyOn(api, 'getEODChart').mockResolvedValue({ symbol: 'AAPL', range: '1y', data: [] })

    render(<StockChart symbol="AAPL" token="tok" />)

    await waitFor(() => expect(screen.getByText(/no chart data/i)).toBeInTheDocument())
  })

  it('shows "updated" timestamp after successful load', async () => {
    vi.spyOn(api, 'getEODChart').mockResolvedValue(MOCK_EOD)

    render(<StockChart symbol="AAPL" token="tok" />)

    await waitFor(() => expect(screen.getByText(/updated/i)).toBeInTheDocument())
  })

  it('calls getEODChart with selected range when a range button is clicked', async () => {
    const eodSpy = vi.spyOn(api, 'getEODChart').mockResolvedValue(MOCK_EOD)

    render(<StockChart symbol="AAPL" token="tok" />)
    await waitFor(() => expect(screen.queryByText(/loading/i)).not.toBeInTheDocument())

    fireEvent.click(screen.getByRole('button', { name: '1w' }))

    await waitFor(() =>
      expect(eodSpy).toHaveBeenCalledWith('AAPL', 'tok', '1w')
    )
  })

  it('calls getIntradayChart with selected interval when an interval button is clicked', async () => {
    vi.spyOn(api, 'getEODChart').mockResolvedValue(MOCK_EOD)
    const intradaySpy = vi.spyOn(api, 'getIntradayChart').mockResolvedValue(MOCK_INTRADAY)

    render(<StockChart symbol="AAPL" token="tok" />)
    await waitFor(() => expect(screen.queryByText(/loading/i)).not.toBeInTheDocument())

    // Switch to intraday first
    fireEvent.click(screen.getByRole('button', { name: /intraday/i }))
    await waitFor(() => expect(intradaySpy).toHaveBeenCalledWith('AAPL', 'tok', '5min'))

    // Now select a different interval
    fireEvent.click(screen.getByRole('button', { name: '15min' }))

    await waitFor(() =>
      expect(intradaySpy).toHaveBeenCalledWith('AAPL', 'tok', '15min')
    )
  })

  it('does not fetch when symbol is not provided', () => {
    const eodSpy = vi.spyOn(api, 'getEODChart').mockResolvedValue(MOCK_EOD)

    render(<StockChart symbol="" token="tok" />)

    expect(eodSpy).not.toHaveBeenCalled()
  })
})
