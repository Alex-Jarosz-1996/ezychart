export function calcSMA(closes, period) {
  return closes.map((_, i) => {
    if (i < period - 1) return null
    let sum = 0
    for (let j = i - period + 1; j <= i; j++) sum += closes[j]
    return sum / period
  })
}

function calcEMA(closes, period) {
  const result = new Array(closes.length).fill(null)
  if (closes.length < period) return result
  let sum = 0
  for (let i = 0; i < period; i++) sum += closes[i]
  result[period - 1] = sum / period
  const k = 2 / (period + 1)
  for (let i = period; i < closes.length; i++) {
    result[i] = closes[i] * k + result[i - 1] * (1 - k)
  }
  return result
}

export function calcRSI(closes, period = 14) {
  const result = new Array(closes.length).fill(null)
  if (closes.length <= period) return result
  let avgGain = 0, avgLoss = 0
  for (let i = 1; i <= period; i++) {
    const d = closes[i] - closes[i - 1]
    if (d > 0) avgGain += d; else avgLoss -= d
  }
  avgGain /= period
  avgLoss /= period
  const toRSI = (g, l) => l === 0 ? 100 : 100 - 100 / (1 + g / l)
  result[period] = toRSI(avgGain, avgLoss)
  for (let i = period + 1; i < closes.length; i++) {
    const d = closes[i] - closes[i - 1]
    const gain = d > 0 ? d : 0
    const loss = d < 0 ? -d : 0
    avgGain = (avgGain * (period - 1) + gain) / period
    avgLoss = (avgLoss * (period - 1) + loss) / period
    result[i] = toRSI(avgGain, avgLoss)
  }
  return result
}

function calcVWMA(closes, volumes, period) {
  return closes.map((_, i) => {
    if (i < period - 1) return null
    let sumPV = 0, sumV = 0
    for (let j = i - period + 1; j <= i; j++) {
      sumPV += closes[j] * volumes[j]
      sumV  += volumes[j]
    }
    return sumV === 0 ? null : sumPV / sumV
  })
}

export function calcVMACD(closes, volumes, fast = 12, slow = 26, signal = 9) {
  const fastVWMA = calcVWMA(closes, volumes, fast)
  const slowVWMA = calcVWMA(closes, volumes, slow)
  const macdLine = closes.map((_, i) =>
    fastVWMA[i] != null && slowVWMA[i] != null ? fastVWMA[i] - slowVWMA[i] : null
  )
  const signalLine = new Array(closes.length).fill(null)
  const firstValid = macdLine.findIndex(v => v != null)
  if (firstValid === -1 || firstValid + signal > closes.length) {
    return closes.map(() => ({ macd: null, signal: null, histogram: null }))
  }
  let seedSum = 0
  for (let i = firstValid; i < firstValid + signal; i++) seedSum += macdLine[i]
  signalLine[firstValid + signal - 1] = seedSum / signal
  const k = 2 / (signal + 1)
  for (let i = firstValid + signal; i < closes.length; i++) {
    signalLine[i] = macdLine[i] * k + signalLine[i - 1] * (1 - k)
  }
  return closes.map((_, i) => ({
    macd: macdLine[i],
    signal: signalLine[i],
    histogram: macdLine[i] != null && signalLine[i] != null ? macdLine[i] - signalLine[i] : null,
  }))
}

export function calcMACD(closes, fast = 12, slow = 26, signal = 9) {
  const fastEMA = calcEMA(closes, fast)
  const slowEMA = calcEMA(closes, slow)
  const macdLine = closes.map((_, i) =>
    fastEMA[i] != null && slowEMA[i] != null ? fastEMA[i] - slowEMA[i] : null
  )
  const signalLine = new Array(closes.length).fill(null)
  const firstValid = macdLine.findIndex(v => v != null)
  if (firstValid === -1 || firstValid + signal > closes.length) {
    return closes.map(() => ({ macd: null, signal: null, histogram: null }))
  }
  let seedSum = 0
  for (let i = firstValid; i < firstValid + signal; i++) seedSum += macdLine[i]
  signalLine[firstValid + signal - 1] = seedSum / signal
  const k = 2 / (signal + 1)
  for (let i = firstValid + signal; i < closes.length; i++) {
    signalLine[i] = macdLine[i] * k + signalLine[i - 1] * (1 - k)
  }
  return closes.map((_, i) => ({
    macd: macdLine[i],
    signal: signalLine[i],
    histogram: macdLine[i] != null && signalLine[i] != null ? macdLine[i] - signalLine[i] : null,
  }))
}
