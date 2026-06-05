export function niceScale(dataMin, dataMax, targetTicks = 10) {
  if (!Number.isFinite(dataMin) || !Number.isFinite(dataMax) || dataMin === dataMax) {
    const mid = dataMin || 0
    return { min: mid * 0.9, max: mid * 1.1, ticks: [] }
  }
  const range = dataMax - dataMin
  const rawStep = range / (targetTicks - 1)
  const magnitude = Math.pow(10, Math.floor(Math.log10(rawStep)))
  const normalized = rawStep / magnitude
  const niceStep = normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 5 ? 5 : 10
  const step = niceStep * magnitude
  const min = Math.floor(dataMin / step) * step
  const max = Math.ceil(dataMax / step) * step
  const ticks = []
  for (let v = min; v <= max + step * 0.001; v += step) {
    ticks.push(Math.round(v * 1e8) / 1e8)
  }
  return { min, max, ticks }
}
