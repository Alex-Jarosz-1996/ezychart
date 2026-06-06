import { niceScale } from '../utils/chartUtils'

describe('niceScale', () => {
  it('returns min <= every tick <= max', () => {
    const { min, max, ticks } = niceScale(100, 200)
    expect(ticks.every(t => t >= min && t <= max + 1e-6)).toBe(true)
  })

  it('ticks are sorted in ascending order', () => {
    const { ticks } = niceScale(0, 100)
    for (let i = 1; i < ticks.length; i++) {
      expect(ticks[i]).toBeGreaterThan(ticks[i - 1])
    }
  })

  it('returns at least two ticks for a normal range', () => {
    const { ticks } = niceScale(0, 1000)
    expect(ticks.length).toBeGreaterThanOrEqual(2)
  })

  it('handles equal min and max (flat data)', () => {
    const { min, max, ticks } = niceScale(150, 150)
    expect(min).toBeCloseTo(150 * 0.9)
    expect(max).toBeCloseTo(150 * 1.1)
    expect(ticks).toHaveLength(0)
  })

  it('handles zero flat data', () => {
    const { min, max, ticks } = niceScale(0, 0)
    expect(min).toBe(0)
    expect(max).toBe(0)
    expect(ticks).toHaveLength(0)
  })

  it('handles non-finite inputs without throwing', () => {
    expect(() => niceScale(NaN, NaN)).not.toThrow()
    expect(() => niceScale(Infinity, 100)).not.toThrow()
  })

  it('returns empty ticks for non-finite inputs', () => {
    const { ticks } = niceScale(NaN, NaN)
    expect(ticks).toHaveLength(0)
  })

  it('respects a custom targetTicks hint', () => {
    const { ticks } = niceScale(0, 100, 5)
    // may not be exactly 5 due to rounding, but should be in a reasonable range
    expect(ticks.length).toBeGreaterThanOrEqual(2)
    expect(ticks.length).toBeLessThanOrEqual(8)
  })

  it('scale covers the full data range', () => {
    const { min, max } = niceScale(37, 89)
    expect(min).toBeLessThanOrEqual(37)
    expect(max).toBeGreaterThanOrEqual(89)
  })
})
