import { useLocation } from 'react-router-dom'
import { useShallow } from 'zustand/react/shallow'
import { TimerWidget } from '../components/TimerWidget'
import { buildGoalOverlayLadders, formatGoalOverlayAmount, type GoalOverlayLadder } from '../lib/goals/overlay'
import { defaultOverlayTransforms } from '../lib/platform/overlayTransform'
import { buildOverlayRules } from '../lib/platform/overlayRuntime'
import { useViewportBoundOverlayTransform } from '../lib/platform/useViewportBoundOverlayTransform'
import { useAppStore } from '../state/useAppStore'
import { useGoalsStore } from '../state/useGoalsStore'
import { selectCompactOverlayState } from '../state/selectors'

function getSourceLabel(ladder: GoalOverlayLadder) {
  switch (ladder.sourceType) {
    case 'subscriptions': return 'Subs'
    case 'bits': return 'Bits'
    case 'tips': return 'Tips'
    case 'channel-points': return 'Points'
    case 'charity': return 'Charity'
    default: return 'Goals'
  }
}

function CompactGoalsSection({ ladders }: { ladders: GoalOverlayLadder[] }) {
  if (ladders.length === 0) return null

  return (
    <div className="compact-overlay-goals">
      <div className="compact-goals-header">
        <span className="compact-goals-eyebrow">Subathon goals</span>
        <strong className="compact-goals-heading">Reward ladder</strong>
      </div>
      <div className="compact-goals-list">
        {ladders.map((ladder) => (
          <article key={ladder.id} className="compact-ladder">
            <div className="compact-ladder__top">
              <div>
                <span className="compact-ladder__kicker">{getSourceLabel(ladder)}</span>
                <strong className="compact-ladder__title">{ladder.title}</strong>
              </div>
              <span className="compact-ladder__amount">
                {formatGoalOverlayAmount(ladder.currentAmount, ladder.unitLabel)}
              </span>
            </div>
            <div className="compact-ladder__bar" aria-hidden="true">
              <span style={{ width: `${ladder.progressPercent}%` }} />
            </div>
            <div className="compact-ladder__milestones">
              {ladder.milestones.map((milestone) => (
                <div key={milestone.id} className={`compact-milestone compact-milestone--${milestone.status}`}>
                  <span className="compact-milestone__mark">
                    {milestone.status === 'completed' ? '✓' : milestone.status === 'skipped' ? '–' : ''}
                  </span>
                  <div className="compact-milestone__copy">
                    <strong className="compact-milestone__title">{milestone.rewardTitle}</strong>
                    <small className="compact-milestone__threshold">
                      {formatGoalOverlayAmount(milestone.thresholdAmount, ladder.unitLabel)}
                    </small>
                  </div>
                </div>
              ))}
            </div>
            <div className="compact-ladder__next">
              {ladder.nextRewardTitle ? `Next unlock: ${ladder.nextRewardTitle}` : 'All visible rewards unlocked'}
            </div>
          </article>
        ))}
      </div>
    </div>
  )
}

export function CompactOverlayPage() {
  const location = useLocation()
  const {
    timerRemainingSeconds,
    uptimeSeconds,
    timerStatus,
    trendPoints,
    ruleConfig,
    timerWidgetTheme,
    compactOverlayTransform,
  } = useAppStore(useShallow(selectCompactOverlayState))
  const ladders = useGoalsStore((state) => state.ladders)
  const goalLadders = buildGoalOverlayLadders(ladders)
  const hasTrend = trendPoints.length > 1
  const isStudioPreview = new URLSearchParams(location.search).get('studio') === '1'
  const activeTransform = isStudioPreview ? defaultOverlayTransforms.compact : compactOverlayTransform
  const { canvasRef, canvasStyle } = useViewportBoundOverlayTransform(activeTransform, 'center')

  const previewGoalLadders: GoalOverlayLadder[] = isStudioPreview && goalLadders.length === 0
    ? [
        {
          id: 'preview-compact',
          title: 'Bits reward ladder',
          sourceType: 'bits',
          sourceMode: 'single-source',
          currentAmount: 420,
          unitLabel: 'bits',
          progressPercent: 42,
          nextRewardTitle: 'Spin the wheel',
          milestones: [
            { id: 'p1', thresholdAmount: 100, rewardTitle: 'Eat a bean', status: 'completed' },
            { id: 'p2', thresholdAmount: 500, rewardTitle: 'Spin the wheel', status: 'locked' },
            { id: 'p3', thresholdAmount: 1000, rewardTitle: 'Chat picks next game', status: 'locked' },
          ],
        },
      ]
    : goalLadders

  return (
    <div className="overlay overlay--compact">
      <div ref={canvasRef} className="overlay__canvas overlay__canvas--compact" style={canvasStyle}>
        <div className="compact-overlay">
          <TimerWidget
            theme={timerWidgetTheme}
            surface="overlay"
            timerSeconds={timerRemainingSeconds}
            uptimeSeconds={uptimeSeconds}
            timerStatus={timerStatus}
            trendPoints={trendPoints}
            rules={buildOverlayRules(ruleConfig)}
            showTrend={hasTrend}
          />
          <CompactGoalsSection ladders={previewGoalLadders} />
        </div>
      </div>
    </div>
  )
}
