import { calcSMA, calcRSI, calcMACD, calcVMACD } from '../utils/indicators'

// --- calcSMA ---

describe('calcSMA', () => {
  it('returns nulls for indices before period is reached', () => {
    const result = calcSMA([1, 2, 3, 4, 5], 3)
    expect(result[0]).toBeNull()
    expect(result[1]).toBeNull()
    expect(result[2]).toBeCloseTo(2.0)
  })

  it('computes the correct rolling average', () => {
    const result = calcSMA([2, 4, 6, 8, 10], 2)
    expect(result[1]).toBeCloseTo(3.0)
    expect(result[2]).toBeCloseTo(5.0)
    expect(result[3]).toBeCloseTo(7.0)
    expect(result[4]).toBeCloseTo(9.0)
  })

  it('returns all nulls when period exceeds array length', () => {
    const result = calcSMA([1, 2], 5)
    expect(result.every(v => v === null)).toBe(true)
  })

  it('output length matches input length', () => {
    const closes = [1, 2, 3, 4, 5, 6, 7]
    expect(calcSMA(closes, 3)).toHaveLength(closes.length)
  })

  it('period of 1 returns the original values', () => {
    const closes = [10, 20, 30]
    const result = calcSMA(closes, 1)
    expect(result).toEqual([10, 20, 30])
  })
})

// --- calcRSI ---

describe('calcRSI', () => {
  it('returns nulls for the first <period> entries', () => {
    const closes = Array.from({ length: 20 }, (_, i) => 100 + i)
    const result = calcRSI(closes, 14)
    for (let i = 0; i < 14; i++) expect(result[i]).toBeNull()
    expect(result[14]).not.toBeNull()
  })

  it('approaches 100 when all price moves are gains', () => {
    const closes = Array.from({ length: 20 }, (_, i) => 100 + i)
    const result = calcRSI(closes, 14)
    expect(result[result.length - 1]).toBeGreaterThan(90)
  })

  it('approaches 0 when all price moves are losses', () => {
    const closes = Array.from({ length: 20 }, (_, i) => 100 - i)
    const result = calcRSI(closes, 14)
    expect(result[result.length - 1]).toBeLessThan(10)
  })

  it('returns all nulls when closes length <= period', () => {
    const result = calcRSI([1, 2, 3], 5)
    expect(result.every(v => v === null)).toBe(true)
  })

  it('output length matches input length', () => {
    const closes = Array.from({ length: 25 }, (_, i) => 100 + i)
    expect(calcRSI(closes, 14)).toHaveLength(closes.length)
  })

  it('returns values in [0, 100] range', () => {
    const closes = [100, 102, 101, 103, 99, 104, 98, 105, 97, 106, 96, 107, 95, 108, 94, 109, 93, 110, 92, 111]
    const result = calcRSI(closes, 14)
    for (const v of result) {
      if (v !== null) {
        expect(v).toBeGreaterThanOrEqual(0)
        expect(v).toBeLessThanOrEqual(100)
      }
    }
  })
})

// --- calcMACD ---

describe('calcMACD', () => {
  it('returns null macd for entries before slow EMA is seeded', () => {
    const closes = Array.from({ length: 40 }, (_, i) => 100 + i)
    const result = calcMACD(closes, 12, 26, 9)
    // slow EMA seeds at index 25 (period-1=25); signal seeds 9 bars later
    for (let i = 0; i < 25; i++) expect(result[i].macd).toBeNull()
    expect(result[25].macd).not.toBeNull()
  })

  it('histogram equals macd minus signal when both are non-null', () => {
    const closes = Array.from({ length: 50 }, (_, i) => 100 + Math.sin(i) * 5)
    const result = calcMACD(closes)
    for (const { macd, signal, histogram } of result) {
      if (macd != null && signal != null) {
        expect(histogram).toBeCloseTo(macd - signal, 8)
      }
    }
  })

  it('returns all nulls when data is insufficient for slow period', () => {
    const result = calcMACD([100, 101], 12, 26, 9)
    expect(result.every(r => r.macd === null && r.signal === null && r.histogram === null)).toBe(true)
  })

  it('output length matches input length', () => {
    const closes = Array.from({ length: 50 }, (_, i) => 100 + i)
    expect(calcMACD(closes)).toHaveLength(closes.length)
  })

  it('each entry has macd, signal, histogram keys', () => {
    const closes = Array.from({ length: 10 }, (_, i) => 100 + i)
    const result = calcMACD(closes)
    for (const entry of result) {
      expect(entry).toHaveProperty('macd')
      expect(entry).toHaveProperty('signal')
      expect(entry).toHaveProperty('histogram')
    }
  })
})

// --- calcVMACD ---

describe('calcVMACD', () => {
  it('histogram equals macd minus signal when both are non-null', () => {
    const closes = Array.from({ length: 50 }, (_, i) => 100 + Math.sin(i) * 5)
    const volumes = Array.from({ length: 50 }, () => 1_000_000)
    const result = calcVMACD(closes, volumes)
    for (const { macd, signal, histogram } of result) {
      if (macd != null && signal != null) {
        expect(histogram).toBeCloseTo(macd - signal, 8)
      }
    }
  })

  it('returns all nulls when all volumes are zero', () => {
    const closes = Array.from({ length: 50 }, (_, i) => 100 + i)
    const volumes = new Array(50).fill(0)
    const result = calcVMACD(closes, volumes)
    expect(result.every(r => r.macd === null && r.signal === null && r.histogram === null)).toBe(true)
  })

  it('output length matches input length', () => {
    const closes = Array.from({ length: 50 }, (_, i) => 100 + i)
    const volumes = Array.from({ length: 50 }, () => 1_000_000)
    expect(calcVMACD(closes, volumes)).toHaveLength(closes.length)
  })

  it('each entry has macd, signal, histogram keys', () => {
    const closes = Array.from({ length: 10 }, (_, i) => 100 + i)
    const volumes = Array.from({ length: 10 }, () => 500_000)
    const result = calcVMACD(closes, volumes)
    for (const entry of result) {
      expect(entry).toHaveProperty('macd')
      expect(entry).toHaveProperty('signal')
      expect(entry).toHaveProperty('histogram')
    }
  })
})
