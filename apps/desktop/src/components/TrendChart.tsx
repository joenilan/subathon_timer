import { buildAreaPath, buildLinePath, getLastChartPoint } from '../lib/timer/chart'

export function TrendChart({
  points,
  showArea = false,
  showGraphIcon = false,
}: {
  points: number[]
  showArea?: boolean
  showGraphIcon?: boolean
}) {
  const path = buildLinePath(points, 520, 120, 10)
  const areaPath = showArea ? buildAreaPath(points, 520, 120, 10) : ''
  const lastPoint = showGraphIcon ? getLastChartPoint(points, 520, 120, 10) : null

  if (points.length < 2 || !path) {
    return (
      <div className="chart-empty chart-empty--chart">
        <strong className="chart-empty__title">Timer history appears here during the run</strong>
        <span className="chart-empty__detail">
          New Twitch events, tips, wheel results, and manual adjustments will start drawing the live trend as soon as they land.
        </span>
      </div>
    )
  }

  return (
    <div className="trend-chart-shell">
      <svg className="trend-chart" viewBox="0 0 520 120" preserveAspectRatio="none" aria-label="Timer trend">
        {showArea ? (
          <defs>
            <linearGradient id="trend-chart-area-fill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="rgba(26, 201, 255, 0.42)" />
              <stop offset="100%" stopColor="rgba(26, 201, 255, 0.04)" />
            </linearGradient>
          </defs>
        ) : null}
        <path className="trend-chart__grid" d="M 10 20 L 510 20 M 10 60 L 510 60 M 10 100 L 510 100" />
        {showArea ? <path className="trend-chart__area" d={areaPath} fill="url(#trend-chart-area-fill)" /> : null}
        <path className="trend-chart__line" d={path} />
      </svg>
      {lastPoint ? (
        <img
          className="trend-chart__icon"
          src="/assets/graph_icon.gif"
          alt=""
          aria-hidden="true"
          style={{ top: `${(lastPoint.y / 120) * 100}%` }}
        />
      ) : null}
    </div>
  )
}
