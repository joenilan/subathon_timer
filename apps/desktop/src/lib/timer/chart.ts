function buildChartCoordinates(points: number[], width: number, height: number, padding = 0) {
  if (points.length === 0) {
    return []
  }

  const min = Math.min(...points)
  const max = Math.max(...points)
  const usableWidth = width - padding * 2
  const usableHeight = height - padding * 2

  return points.map((point, index) => {
    const normalized = max === min ? 0.5 : (point - min) / (max - min)
    return {
      x: padding + (usableWidth * index) / Math.max(points.length - 1, 1),
      y: padding + (1 - normalized) * usableHeight,
      normalized,
    }
  })
}

export function normalizeChartPoints(points: number[]) {
  return buildChartCoordinates(points, 1, 1).map((point) => point.normalized)
}

export function getLastChartPoint(points: number[], width: number, height: number, padding = 0) {
  const coordinates = buildChartCoordinates(points, width, height, padding)
  return coordinates.length > 0 ? coordinates[coordinates.length - 1] : null
}

export function buildLinePath(points: number[], width: number, height: number, padding = 0) {
  return buildChartCoordinates(points, width, height, padding)
    .map((point, index) => {
      return `${index === 0 ? 'M' : 'L'} ${point.x.toFixed(2)} ${point.y.toFixed(2)}`
    })
    .join(' ')
}

export function buildAreaPath(points: number[], width: number, height: number, padding = 0) {
  const coordinates = buildChartCoordinates(points, width, height, padding)

  if (coordinates.length === 0) {
    return ''
  }

  const baselineY = height - padding
  const firstPoint = coordinates[0]
  const lastPoint = coordinates[coordinates.length - 1]
  const linePath = coordinates.map((point) => `L ${point.x.toFixed(2)} ${point.y.toFixed(2)}`).join(' ')

  return `M ${firstPoint.x.toFixed(2)} ${baselineY.toFixed(2)} ${linePath} L ${lastPoint.x.toFixed(2)} ${baselineY.toFixed(2)} Z`
}
