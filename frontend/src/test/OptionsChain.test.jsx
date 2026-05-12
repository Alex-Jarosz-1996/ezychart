import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { vi } from 'vitest'
import OptionsChain from '../components/OptionsChain/OptionsChain.jsx'
import * as api from '../api.js'

const MOCK_DATA = {
  symbol: 'AAPL',
  calls: [{ ticker: 'O:AAPL260511C00235000', expiration_date: '2026-05-11' }],
  puts: [{ ticker: 'O:AAPL260511P00235000', expiration_date: '2026-05-11' }],
}

const MOCK_EMPTY = { symbol: 'ZZZZZ', calls: [], puts: [] }

beforeEach(() => {
  vi.restoreAllMocks()
})

test('shows loading while fetching', () => {
  vi.spyOn(api, 'fetchOptionsChain').mockReturnValue(new Promise(() => {}))

  render(<OptionsChain symbol="AAPL" token="tok" onUnauthorized={vi.fn()} />)

  expect(screen.getByText(/loading/i)).toBeInTheDocument()
})

test('renders calls and puts tables after load', async () => {
  vi.spyOn(api, 'fetchOptionsChain').mockResolvedValue(MOCK_DATA)

  render(<OptionsChain symbol="AAPL" token="tok" onUnauthorized={vi.fn()} />)

  await waitFor(() => expect(screen.queryByText(/loading/i)).not.toBeInTheDocument())

  expect(screen.getByText('Calls')).toBeInTheDocument()
  expect(screen.getByText('Puts')).toBeInTheDocument()
  expect(screen.getByText('AAPL May 11 2026 $235 Call')).toBeInTheDocument()
  expect(screen.getByText('AAPL May 11 2026 $235 Put')).toBeInTheDocument()
  expect(screen.getAllByText('2026-05-11')).toHaveLength(2)
})

test('shows error message on API failure', async () => {
  vi.spyOn(api, 'fetchOptionsChain').mockRejectedValue(new Error('Polygon error'))

  render(<OptionsChain symbol="AAPL" token="tok" onUnauthorized={vi.fn()} />)

  await waitFor(() => expect(screen.getByText('Polygon error')).toBeInTheDocument())
})

test('calls onUnauthorized on 401 error', async () => {
  const onUnauthorized = vi.fn()
  vi.spyOn(api, 'fetchOptionsChain').mockRejectedValue(new Error('Unauthorized'))

  render(<OptionsChain symbol="AAPL" token="tok" onUnauthorized={onUnauthorized} />)

  await waitFor(() => expect(onUnauthorized).toHaveBeenCalledOnce())
})

test('shows empty state when no contracts returned', async () => {
  vi.spyOn(api, 'fetchOptionsChain').mockResolvedValue(MOCK_EMPTY)

  render(<OptionsChain symbol="ZZZZZ" token="tok" onUnauthorized={vi.fn()} />)

  await waitFor(() => expect(screen.queryByText(/loading/i)).not.toBeInTheDocument())

  expect(screen.getByText('No calls found.')).toBeInTheDocument()
  expect(screen.getByText('No puts found.')).toBeInTheDocument()
})

test('does not fetch when symbol is null', () => {
  const spy = vi.spyOn(api, 'fetchOptionsChain')

  render(<OptionsChain symbol={null} token="tok" onUnauthorized={vi.fn()} />)

  expect(spy).not.toHaveBeenCalled()
})

test('passes strike price to API when filter is applied', async () => {
  const spy = vi.spyOn(api, 'fetchOptionsChain').mockResolvedValue(MOCK_DATA)

  render(<OptionsChain symbol="AAPL" token="tok" onUnauthorized={vi.fn()} />)

  await waitFor(() => expect(spy).toHaveBeenCalledWith('AAPL', 'tok', null))

  fireEvent.change(screen.getByPlaceholderText(/strike price/i), { target: { value: '270' } })
  fireEvent.submit(screen.getByPlaceholderText(/strike price/i).closest('form'))

  await waitFor(() => expect(spy).toHaveBeenCalledWith('AAPL', 'tok', 270))
})
