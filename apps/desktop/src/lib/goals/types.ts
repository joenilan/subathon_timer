import type { NormalizedTimerEventSource } from '../timer/types'

export type GoalSourceMode = 'single-source' | 'mixed-source' | 'custom'

export type GoalSourceType = 'subscriptions' | 'bits' | 'tips' | 'mixed-support' | 'channel-points' | 'charity'

export type GoalLadderStatus = 'active' | 'paused' | 'archived'

export type GoalMilestoneStatus = 'locked' | 'completed' | 'skipped'

export type GoalTipProviderFilter = 'any' | Extract<NormalizedTimerEventSource, 'streamelements' | 'streamlabs'>

export interface GoalSubscriptionConfig {
  includeSubscriptions: boolean
  includeResubscriptions: boolean
  includeGiftSubscriptions: boolean
  includeGiftBombs: boolean
  countGiftBombQuantity: boolean
  tierWeights: Record<string, number>
}

export interface GoalBitsConfig {
  minimumBits: number
}

export interface GoalTipsConfig {
  providerFilter: GoalTipProviderFilter
  minimumAmount: number
  currency: string | null
}

export interface GoalMixedSupportConfig {
  includeSubscriptions: boolean
  includeBits: boolean
  includeTips: boolean
  subscriptionUnitValue: number
  bitsAmountUnit: number
  bitsUnitValue: number
  tipAmountUnit: number
  tipUnitValue: number
  tipProviderFilter: GoalTipProviderFilter
}

export interface GoalChannelPointsConfig {
  rewardTitleFilter: string | null
  countCostAsAmount: boolean
}

export interface SubathonGoalLadderConfig {
  allowTestEvents: boolean
  subscriptions: GoalSubscriptionConfig
  bits: GoalBitsConfig
  tips: GoalTipsConfig
  mixed: GoalMixedSupportConfig
  channelPoints: GoalChannelPointsConfig
}

export interface SubathonGoalMilestone {
  id: string
  thresholdAmount: number
  rewardTitle: string
  rewardDescription?: string
  status: GoalMilestoneStatus
  completedAt?: string
  milestoneSourceType?: GoalSourceType
  milestoneCurrentAmount?: number
}

export interface SubathonGoalLadder {
  id: string
  title: string
  description?: string
  status: GoalLadderStatus
  sourceMode: GoalSourceMode
  sourceType: GoalSourceType
  currentAmount: number
  unitLabel: string
  milestones: SubathonGoalMilestone[]
  createdAt: string
  config: SubathonGoalLadderConfig
  processedEventIds: string[]
}

export type GoalHistoryEntryType =
  | 'event_progress'
  | 'manual_adjustment'
  | 'milestone_completed'
  | 'milestone_skipped'
  | 'milestone_reopened'
  | 'ladder_reset'

export interface GoalHistoryEntry {
  id: string
  ladderId: string
  milestoneId?: string
  type: GoalHistoryEntryType
  title: string
  summary: string
  deltaAmount: number
  occurredAt: number
  source: 'event' | 'manual'
  eventId?: string
}

export interface GoalsSnapshot {
  ladders: SubathonGoalLadder[]
  history: GoalHistoryEntry[]
  announceGoalCompletionsInChat?: boolean
}

export interface CreateGoalLadderInput {
  title: string
  description?: string
  sourceMode: GoalSourceMode
  sourceType: GoalSourceType
  unitLabel: string
  milestones: Array<{
    thresholdAmount: number
    rewardTitle: string
    rewardDescription?: string
    milestoneSourceType?: GoalSourceType
  }>
  config?: Partial<SubathonGoalLadderConfig>
}

export type GoalEventIgnoredReason =
  | 'ladder_not_active'
  | 'duplicate_event'
  | 'test_event_blocked'
  | 'source_not_enabled'
  | 'event_not_supported'
  | 'below_minimum'
  | 'invalid_amount'

export interface GoalEventApplyResult {
  ladder: SubathonGoalLadder
  accepted: boolean
  contributionAmount: number
  completedMilestones: SubathonGoalMilestone[]
  ignoredReason: GoalEventIgnoredReason | null
}

export interface GoalCompletedMilestoneAnnouncement {
  ladderId: string
  ladderTitle: string
  milestoneId: string
  rewardTitle: string
  thresholdAmount: number
  unitLabel: string
}

export interface ProcessGoalEventResult {
  completedMilestones: GoalCompletedMilestoneAnnouncement[]
}
