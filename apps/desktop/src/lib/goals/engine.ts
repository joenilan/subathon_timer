import type { NormalizedTimerEvent } from '../timer/types'
import type {
  GoalChannelPointsConfig,
  GoalEventApplyResult,
  GoalEventIgnoredReason,
  GoalMixedSupportConfig,
  GoalSourceType,
  GoalSubscriptionConfig,
  GoalTipProviderFilter,
  SubathonGoalLadder,
  SubathonGoalLadderConfig,
  SubathonGoalMilestone,
} from './types'

const DEFAULT_PROCESSED_EVENT_LIMIT = 500

export function getDefaultGoalLadderConfig(): SubathonGoalLadderConfig {
  return {
    allowTestEvents: false,
    subscriptions: {
      includeSubscriptions: true,
      includeResubscriptions: true,
      includeGiftSubscriptions: true,
      includeGiftBombs: true,
      countGiftBombQuantity: true,
      tierWeights: {
        prime: 1,
        '1000': 1,
        '2000': 1,
        '3000': 1,
      },
    },
    bits: {
      minimumBits: 1,
    },
    tips: {
      providerFilter: 'any',
      minimumAmount: 0.01,
      currency: null,
    },
    mixed: {
      includeSubscriptions: true,
      includeBits: true,
      includeTips: true,
      subscriptionUnitValue: 1,
      bitsAmountUnit: 100,
      bitsUnitValue: 1,
      tipAmountUnit: 5,
      tipUnitValue: 1,
      tipProviderFilter: 'any',
    },
    channelPoints: {
      rewardTitleFilter: null,
      countCostAsAmount: false,
    },
  }
}

export function createGoalEventDedupeKey(event: NormalizedTimerEvent) {
  return `${event.source}:${event.id}`
}

export function sortGoalMilestones(milestones: SubathonGoalMilestone[]) {
  return [...milestones].sort((left, right) => left.thresholdAmount - right.thresholdAmount)
}

export function applyGoalEvent(
  ladder: SubathonGoalLadder,
  event: NormalizedTimerEvent,
  options: { completedAt?: string; processedEventLimit?: number } = {},
): GoalEventApplyResult {
  if (ladder.status !== 'active') {
    return ignored(ladder, 'ladder_not_active')
  }

  const dedupeKey = createGoalEventDedupeKey(event)
  if (ladder.processedEventIds.includes(dedupeKey)) {
    return ignored(ladder, 'duplicate_event')
  }

  if (!ladder.config.allowTestEvents && isGoalTestEvent(event)) {
    return ignored(ladder, 'test_event_blocked')
  }

  if (ladder.sourceMode === 'custom') {
    return applyGoalEventToCustomLadder(ladder, event, dedupeKey, options)
  }

  const contribution = getGoalEventContribution(ladder, event)
  if (!contribution.accepted) {
    return ignored(ladder, contribution.reason)
  }

  const nextAmount = ladder.currentAmount + contribution.amount
  const completedAt = options.completedAt ?? event.occurredAt
  const completedMilestones: SubathonGoalMilestone[] = []
  const nextMilestones = ladder.milestones.map((milestone) => {
    if (milestone.status !== 'locked' || milestone.thresholdAmount > nextAmount) {
      return milestone
    }

    const completedMilestone = {
      ...milestone,
      status: 'completed' as const,
      completedAt,
    }
    completedMilestones.push(completedMilestone)
    return completedMilestone
  })

  const processedEventLimit = Math.max(1, options.processedEventLimit ?? DEFAULT_PROCESSED_EVENT_LIMIT)
  const processedEventIds = [...ladder.processedEventIds, dedupeKey].slice(-processedEventLimit)

  return {
    ladder: {
      ...ladder,
      currentAmount: nextAmount,
      milestones: nextMilestones,
      processedEventIds,
    },
    accepted: true,
    contributionAmount: contribution.amount,
    completedMilestones: sortGoalMilestones(completedMilestones),
    ignoredReason: null,
  }
}

function ignored(ladder: SubathonGoalLadder, reason: GoalEventIgnoredReason): GoalEventApplyResult {
  return {
    ladder,
    accepted: false,
    contributionAmount: 0,
    completedMilestones: [],
    ignoredReason: reason,
  }
}

function applyGoalEventToCustomLadder(
  ladder: SubathonGoalLadder,
  event: NormalizedTimerEvent,
  dedupeKey: string,
  options: { completedAt?: string; processedEventLimit?: number },
): GoalEventApplyResult {
  const completedAt = options.completedAt ?? event.occurredAt
  const completedMilestones: SubathonGoalMilestone[] = []
  let totalContribution = 0
  let anyAccepted = false

  const nextMilestones = ladder.milestones.map((milestone) => {
    if (milestone.status !== 'locked' || !milestone.milestoneSourceType) {
      return milestone
    }

    const contribution = getMilestoneSourceContribution(milestone.milestoneSourceType, ladder.config, event)
    if (!contribution.accepted) {
      return milestone
    }

    anyAccepted = true
    totalContribution += contribution.amount
    const nextCurrentAmount = (milestone.milestoneCurrentAmount ?? 0) + contribution.amount

    if (nextCurrentAmount >= milestone.thresholdAmount) {
      const completedMilestone = { ...milestone, milestoneCurrentAmount: nextCurrentAmount, status: 'completed' as const, completedAt }
      completedMilestones.push(completedMilestone)
      return completedMilestone
    }

    return { ...milestone, milestoneCurrentAmount: nextCurrentAmount }
  })

  if (!anyAccepted) {
    return ignored(ladder, 'source_not_enabled')
  }

  const processedEventLimit = Math.max(1, options.processedEventLimit ?? DEFAULT_PROCESSED_EVENT_LIMIT)
  const processedEventIds = [...ladder.processedEventIds, dedupeKey].slice(-processedEventLimit)

  return {
    ladder: { ...ladder, milestones: nextMilestones, processedEventIds },
    accepted: true,
    contributionAmount: totalContribution,
    completedMilestones: sortGoalMilestones(completedMilestones),
    ignoredReason: null,
  }
}

function getMilestoneSourceContribution(
  milestoneSourceType: GoalSourceType,
  config: SubathonGoalLadderConfig,
  event: NormalizedTimerEvent,
): { accepted: true; amount: number } | { accepted: false; reason: GoalEventIgnoredReason } {
  switch (milestoneSourceType) {
    case 'subscriptions':
      return getSubscriptionContribution(config.subscriptions, event)
    case 'bits':
      return getBitsContribution(config.bits.minimumBits, event)
    case 'tips':
      return getTipContribution(config.tips.providerFilter, config.tips.minimumAmount, event)
    case 'mixed-support':
      return getMixedContribution(config.mixed, config.subscriptions, event)
    case 'channel-points':
      return getChannelPointsContribution(config.channelPoints, event)
    case 'charity':
      return { accepted: false, reason: 'event_not_supported' }
  }
}

function getGoalEventContribution(
  ladder: SubathonGoalLadder,
  event: NormalizedTimerEvent,
): { accepted: true; amount: number } | { accepted: false; reason: GoalEventIgnoredReason } {
  if (ladder.sourceMode === 'mixed-source' || ladder.sourceType === 'mixed-support') {
    return getMixedContribution(ladder.config.mixed, ladder.config.subscriptions, event)
  }

  switch (ladder.sourceType) {
    case 'subscriptions':
      return getSubscriptionContribution(ladder.config.subscriptions, event)
    case 'bits':
      return getBitsContribution(ladder.config.bits.minimumBits, event)
    case 'tips':
      return getTipContribution(ladder.config.tips.providerFilter, ladder.config.tips.minimumAmount, event)
    case 'channel-points':
      return getChannelPointsContribution(ladder.config.channelPoints, event)
    case 'charity':
      return { accepted: false, reason: 'event_not_supported' }
    default:
      return unreachableGoalSourceType(ladder.sourceType)
  }
}

function getSubscriptionContribution(
  config: GoalSubscriptionConfig,
  event: NormalizedTimerEvent,
): { accepted: true; amount: number } | { accepted: false; reason: GoalEventIgnoredReason } {
  if (event.source !== 'twitch-eventsub') {
    return { accepted: false, reason: 'source_not_enabled' }
  }

  const tierWeight = getTierWeight(config, event.tier)

  switch (event.eventType) {
    case 'subscription':
      return config.includeSubscriptions
        ? { accepted: true, amount: tierWeight }
        : { accepted: false, reason: 'source_not_enabled' }
    case 'resubscription':
      return config.includeResubscriptions
        ? { accepted: true, amount: tierWeight }
        : { accepted: false, reason: 'source_not_enabled' }
    case 'gift_subscription':
      return config.includeGiftSubscriptions
        ? { accepted: true, amount: tierWeight }
        : { accepted: false, reason: 'source_not_enabled' }
    case 'gift_bomb': {
      if (!config.includeGiftBombs) {
        return { accepted: false, reason: 'source_not_enabled' }
      }
      const giftCount = config.countGiftBombQuantity ? Math.max(1, event.count ?? 1) : 1
      return { accepted: true, amount: giftCount * tierWeight }
    }
    default:
      return { accepted: false, reason: 'event_not_supported' }
  }
}

function getBitsContribution(
  minimumBits: number,
  event: NormalizedTimerEvent,
): { accepted: true; amount: number } | { accepted: false; reason: GoalEventIgnoredReason } {
  if (event.source !== 'twitch-eventsub' || event.eventType !== 'cheer') {
    return { accepted: false, reason: event.eventType === 'cheer' ? 'source_not_enabled' : 'event_not_supported' }
  }

  const bits = event.amount ?? 0
  if (bits <= 0) {
    return { accepted: false, reason: 'invalid_amount' }
  }
  if (bits < minimumBits) {
    return { accepted: false, reason: 'below_minimum' }
  }
  return { accepted: true, amount: bits }
}

function getTipContribution(
  providerFilter: GoalTipProviderFilter,
  minimumAmount: number,
  event: NormalizedTimerEvent,
): { accepted: true; amount: number } | { accepted: false; reason: GoalEventIgnoredReason } {
  if (event.eventType !== 'tip') {
    return { accepted: false, reason: 'event_not_supported' }
  }
  if (!isTipProviderAllowed(providerFilter, event.source)) {
    return { accepted: false, reason: 'source_not_enabled' }
  }

  const tipAmount = event.amount ?? 0
  if (tipAmount <= 0) {
    return { accepted: false, reason: 'invalid_amount' }
  }
  if (tipAmount < minimumAmount) {
    return { accepted: false, reason: 'below_minimum' }
  }
  return { accepted: true, amount: tipAmount }
}

function getMixedContribution(
  mixedConfig: GoalMixedSupportConfig,
  subscriptionConfig: GoalSubscriptionConfig,
  event: NormalizedTimerEvent,
): { accepted: true; amount: number } | { accepted: false; reason: GoalEventIgnoredReason } {
  if (mixedConfig.includeSubscriptions) {
    const subscriptionContribution = getSubscriptionContribution(subscriptionConfig, event)
    if (subscriptionContribution.accepted) {
      return {
        accepted: true,
        amount: subscriptionContribution.amount * mixedConfig.subscriptionUnitValue,
      }
    }
  }

  if (mixedConfig.includeBits && event.eventType === 'cheer') {
    const bitsContribution = getBitsContribution(1, event)
    if (bitsContribution.accepted) {
      return {
        accepted: true,
        amount: (bitsContribution.amount / Math.max(1, mixedConfig.bitsAmountUnit)) * mixedConfig.bitsUnitValue,
      }
    }
  }

  if (mixedConfig.includeTips && event.eventType === 'tip') {
    const tipContribution = getTipContribution(mixedConfig.tipProviderFilter, 0.01, event)
    if (tipContribution.accepted) {
      return {
        accepted: true,
        amount: (tipContribution.amount / Math.max(0.01, mixedConfig.tipAmountUnit)) * mixedConfig.tipUnitValue,
      }
    }
  }

  return { accepted: false, reason: 'event_not_supported' }
}

function getTierWeight(config: GoalSubscriptionConfig, tier: string | null) {
  const key = tier ?? '1000'
  const weight = config.tierWeights[key] ?? config.tierWeights['1000'] ?? 1
  return Math.max(0, weight)
}

function isTipProviderAllowed(providerFilter: GoalTipProviderFilter, source: NormalizedTimerEvent['source']) {
  if (providerFilter === 'any') {
    return source === 'streamelements' || source === 'streamlabs'
  }
  return source === providerFilter
}

function getChannelPointsContribution(
  config: GoalChannelPointsConfig,
  event: NormalizedTimerEvent,
): { accepted: true; amount: number } | { accepted: false; reason: GoalEventIgnoredReason } {
  if (event.eventType !== 'channel_point_redemption') {
    return { accepted: false, reason: 'event_not_supported' }
  }
  if (config.rewardTitleFilter) {
    const filter = config.rewardTitleFilter.trim().toLowerCase()
    const reward = event.rawPayload.reward
    const title =
      typeof reward === 'object' && reward !== null && !Array.isArray(reward)
        ? String((reward as Record<string, unknown>).title ?? '').trim().toLowerCase()
        : ''
    if (filter && title !== filter) {
      return { accepted: false, reason: 'source_not_enabled' }
    }
  }
  const amount = config.countCostAsAmount ? Math.max(1, event.amount ?? 1) : 1
  return { accepted: true, amount }
}

function isGoalTestEvent(event: NormalizedTimerEvent) {
  const rawPayload = event.rawPayload
  return Boolean(rawPayload.isTest || rawPayload.test || rawPayload.is_test || rawPayload.type === 'test')
}

function unreachableGoalSourceType(sourceType: never): never {
  throw new Error(`Unsupported goal source type: ${sourceType}`)
}
