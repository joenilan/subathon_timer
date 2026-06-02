import type { SubathonGoalLadder, SubathonGoalMilestone } from './types'

export interface GoalOverlayMilestone {
  id: string
  thresholdAmount: number
  rewardTitle: string
  status: SubathonGoalMilestone['status']
  milestoneSourceType?: SubathonGoalMilestone['milestoneSourceType']
  milestoneCurrentAmount?: number
}

export interface GoalOverlayLadder {
  id: string
  title: string
  sourceType: SubathonGoalLadder['sourceType']
  sourceMode: SubathonGoalLadder['sourceMode']
  currentAmount: number
  unitLabel: string
  progressPercent: number
  nextRewardTitle: string | null
  milestones: GoalOverlayMilestone[]
}

export function formatGoalOverlayAmount(value: number, unitLabel: string) {
  const rounded = Number.isInteger(value) ? value.toString() : value.toFixed(2)
  return `${rounded} ${unitLabel}`
}

export function buildGoalOverlayLadders(ladders: SubathonGoalLadder[]): GoalOverlayLadder[] {
  return ladders
    .filter((ladder) => ladder.status === 'active')
    .slice(0, 4)
    .map((ladder) => {
      const sortedMilestones = [...ladder.milestones].sort((left, right) => left.thresholdAmount - right.thresholdAmount)
      const maxThreshold = sortedMilestones.reduce((current, milestone) => Math.max(current, milestone.thresholdAmount), 0)
      const nextReward = sortedMilestones.find((milestone) => milestone.status === 'locked') ?? null

      const isCustom = ladder.sourceMode === 'custom'
      const completedCount = sortedMilestones.filter((m) => m.status === 'completed').length
      const progressPercent = isCustom
        ? sortedMilestones.length > 0 ? Math.round((completedCount / sortedMilestones.length) * 100) : 0
        : maxThreshold > 0 ? Math.min(100, Math.max(0, (ladder.currentAmount / maxThreshold) * 100)) : 0

      return {
        id: ladder.id,
        title: ladder.title,
        sourceType: ladder.sourceType,
        sourceMode: ladder.sourceMode,
        currentAmount: ladder.currentAmount,
        unitLabel: ladder.unitLabel,
        progressPercent,
        nextRewardTitle: nextReward?.rewardTitle ?? null,
        milestones: sortedMilestones.slice(0, 6).map((milestone) => ({
          id: milestone.id,
          thresholdAmount: milestone.thresholdAmount,
          rewardTitle: milestone.rewardTitle,
          status: milestone.status,
          milestoneSourceType: milestone.milestoneSourceType,
          milestoneCurrentAmount: milestone.milestoneCurrentAmount,
        })),
      } satisfies GoalOverlayLadder
    })
}
