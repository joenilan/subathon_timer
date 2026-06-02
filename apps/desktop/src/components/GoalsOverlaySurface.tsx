import { formatGoalOverlayAmount, type GoalOverlayLadder } from '../lib/goals/overlay'

interface GoalsOverlaySurfaceProps {
  ladders: GoalOverlayLadder[]
  isStudioPreview?: boolean
}

function getSourceLabel(ladder: GoalOverlayLadder) {
  if (ladder.sourceMode === 'custom') return 'Custom'
  switch (ladder.sourceType) {
    case 'subscriptions':
      return 'Subs'
    case 'bits':
      return 'Bits'
    case 'tips':
      return 'Tips'
    case 'mixed-support':
      return 'Support'
    default:
      return 'Goals'
  }
}

function getMilestoneUnit(sourceType: GoalOverlayLadder['sourceType'] | undefined, fallback: string) {
  if (sourceType === 'bits') return 'bits'
  if (sourceType === 'subscriptions') return 'subs'
  if (sourceType === 'tips') return '$'
  if (sourceType === 'channel-points') return 'pts'
  return fallback
}

export function GoalsOverlaySurface({ ladders, isStudioPreview = false }: GoalsOverlaySurfaceProps) {
  const visibleLadders = ladders.length > 0
    ? ladders
    : isStudioPreview
      ? [
          {
            id: 'preview-goals',
            title: 'Bits reward ladder',
            sourceType: 'bits' as const,
            sourceMode: 'single-source' as const,
            currentAmount: 220,
            unitLabel: 'bits',
            progressPercent: 44,
            nextRewardTitle: 'Spin the wheel',
            milestones: [
              { id: 'preview-1', thresholdAmount: 100, rewardTitle: 'Play a sound alert', status: 'completed' as const },
              { id: 'preview-2', thresholdAmount: 500, rewardTitle: 'Spin the wheel', status: 'locked' as const },
              { id: 'preview-3', thresholdAmount: 1000, rewardTitle: 'Chat picks next game', status: 'locked' as const },
            ],
          },
        ]
      : []

  if (visibleLadders.length === 0) {
    return null
  }

  return (
    <section className="goals-overlay-card">
      <div className="goals-overlay-card__header">
        <span className="goals-overlay-card__eyebrow">Subathon goals</span>
        <strong>Reward ladder</strong>
      </div>

      <div className="goals-overlay-list">
        {visibleLadders.map((ladder) => (
          <article key={ladder.id} className="goals-overlay-ladder">
            <div className="goals-overlay-ladder__top">
              <div>
                <span>{getSourceLabel(ladder)}</span>
                <strong>{ladder.title}</strong>
              </div>
              <em>{formatGoalOverlayAmount(ladder.currentAmount, ladder.unitLabel)}</em>
            </div>

            <div className="goals-overlay-progress" aria-hidden="true">
              <span style={{ width: `${ladder.progressPercent}%` }} />
            </div>

            <div className="goals-overlay-milestones">
              {ladder.milestones.map((milestone) => {
                const isCustomMilestone = ladder.sourceMode === 'custom' && milestone.milestoneSourceType
                const unit = isCustomMilestone
                  ? getMilestoneUnit(milestone.milestoneSourceType, ladder.unitLabel)
                  : ladder.unitLabel
                const current = milestone.milestoneCurrentAmount ?? 0
                const threshold = milestone.thresholdAmount
                return (
                  <div key={milestone.id} className={`goals-overlay-milestone goals-overlay-milestone--${milestone.status}`}>
                    <span>{milestone.status === 'completed' ? '✓' : milestone.status === 'skipped' ? '–' : ''}</span>
                    <div>
                      <strong>{milestone.rewardTitle}</strong>
                      {isCustomMilestone && milestone.status === 'locked' ? (
                        <small>{formatGoalOverlayAmount(current, unit)} / {formatGoalOverlayAmount(threshold, unit)}</small>
                      ) : (
                        <small>{formatGoalOverlayAmount(threshold, unit)}</small>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>

            <div className="goals-overlay-next">
              {ladder.nextRewardTitle ? `Next unlock: ${ladder.nextRewardTitle}` : 'All visible rewards unlocked'}
            </div>
          </article>
        ))}
      </div>
    </section>
  )
}
