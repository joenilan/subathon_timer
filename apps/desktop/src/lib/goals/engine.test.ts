import { describe, expect, it } from 'vitest'
import type { NormalizedTimerEvent } from '../timer/types'
import { applyGoalEvent, getDefaultGoalLadderConfig } from './engine'
import type { SubathonGoalLadder, SubathonGoalMilestone } from './types'

const occurredAt = '2026-05-16T12:00:00.000Z'

function createEvent(overrides: Partial<NormalizedTimerEvent>): NormalizedTimerEvent {
  return {
    id: 'event-1',
    source: 'twitch-eventsub',
    eventType: 'cheer',
    occurredAt,
    userId: 'user-1',
    userLogin: 'viewer',
    displayName: 'Viewer',
    anonymous: false,
    amount: null,
    currency: null,
    tier: null,
    count: null,
    command: null,
    rawPayload: {},
    ...overrides,
  }
}

function createMilestone(id: string, thresholdAmount: number, rewardTitle: string): SubathonGoalMilestone {
  return {
    id,
    thresholdAmount,
    rewardTitle,
    status: 'locked',
  }
}

function createLadder(overrides: Partial<SubathonGoalLadder> = {}): SubathonGoalLadder {
  return {
    id: 'ladder-1',
    title: 'Bits punishments',
    status: 'active',
    sourceMode: 'single-source',
    sourceType: 'bits',
    currentAmount: 0,
    unitLabel: 'bits',
    milestones: [
      createMilestone('bean', 100, 'Eat a bean'),
      createMilestone('egg', 500, 'Eat an egg'),
      createMilestone('wheel', 1000, 'Add a punishment wheel segment'),
    ],
    createdAt: occurredAt,
    config: getDefaultGoalLadderConfig(),
    processedEventIds: [],
    ...overrides,
  }
}

describe('applyGoalEvent', () => {
  it('increments a bits ladder and completes every crossed milestone in order', () => {
    const result = applyGoalEvent(
      createLadder(),
      createEvent({
        id: 'cheer-1',
        eventType: 'cheer',
        amount: 600,
      }),
    )

    expect(result.accepted).toBe(true)
    expect(result.contributionAmount).toBe(600)
    expect(result.ladder.currentAmount).toBe(600)
    expect(result.completedMilestones.map((milestone) => milestone.rewardTitle)).toEqual(['Eat a bean', 'Eat an egg'])
    expect(result.ladder.milestones.map((milestone) => milestone.status)).toEqual(['completed', 'completed', 'locked'])
  })

  it('counts gift bombs by gift quantity for subscription ladders', () => {
    const result = applyGoalEvent(
      createLadder({
        title: 'Subathon unlocks',
        sourceType: 'subscriptions',
        unitLabel: 'subs',
        milestones: [createMilestone('karaoke', 5, 'Karaoke song')],
      }),
      createEvent({
        id: 'gift-bomb-1',
        eventType: 'gift_bomb',
        tier: '1000',
        count: 5,
      }),
    )

    expect(result.accepted).toBe(true)
    expect(result.contributionAmount).toBe(5)
    expect(result.completedMilestones).toHaveLength(1)
    expect(result.completedMilestones[0]?.rewardTitle).toBe('Karaoke song')
  })

  it('rejects unrelated events for source-specific ladders', () => {
    const result = applyGoalEvent(
      createLadder({
        sourceType: 'bits',
      }),
      createEvent({
        id: 'sub-1',
        eventType: 'subscription',
        amount: null,
        tier: '1000',
      }),
    )

    expect(result.accepted).toBe(false)
    expect(result.ignoredReason).toBe('event_not_supported')
    expect(result.ladder.currentAmount).toBe(0)
  })

  it('dedupes accepted events independently from timer history', () => {
    const event = createEvent({
      id: 'cheer-duplicate',
      eventType: 'cheer',
      amount: 150,
    })

    const first = applyGoalEvent(createLadder(), event)
    const second = applyGoalEvent(first.ladder, event)

    expect(first.accepted).toBe(true)
    expect(second.accepted).toBe(false)
    expect(second.ignoredReason).toBe('duplicate_event')
    expect(second.ladder.currentAmount).toBe(150)
  })

  it('only counts tips from tip providers and preserves provider filters', () => {
    const ladder = createLadder({
      title: 'Tip ladder',
      sourceType: 'tips',
      unitLabel: 'USD',
      milestones: [createMilestone('hot-sauce', 25, 'Hot sauce shot')],
      config: {
        ...getDefaultGoalLadderConfig(),
        tips: {
          providerFilter: 'streamlabs',
          minimumAmount: 1,
          currency: 'USD',
        },
      },
    })

    const streamElementsResult = applyGoalEvent(
      ladder,
      createEvent({
        id: 'se-tip-1',
        source: 'streamelements',
        eventType: 'tip',
        amount: 25,
        currency: 'USD',
      }),
    )
    const streamlabsResult = applyGoalEvent(
      ladder,
      createEvent({
        id: 'sl-tip-1',
        source: 'streamlabs',
        eventType: 'tip',
        amount: 25,
        currency: 'USD',
      }),
    )

    expect(streamElementsResult.accepted).toBe(false)
    expect(streamElementsResult.ignoredReason).toBe('source_not_enabled')
    expect(streamlabsResult.accepted).toBe(true)
    expect(streamlabsResult.completedMilestones[0]?.rewardTitle).toBe('Hot sauce shot')
  })

  it('applies explicit mixed ladder conversion weights', () => {
    const ladder = createLadder({
      title: 'Community support ladder',
      sourceMode: 'mixed-source',
      sourceType: 'mixed-support',
      unitLabel: 'support points',
      milestones: [createMilestone('hat', 10, 'Wear the cursed hat')],
      config: {
        ...getDefaultGoalLadderConfig(),
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
      },
    })

    const afterBits = applyGoalEvent(
      ladder,
      createEvent({
        id: 'cheer-1',
        eventType: 'cheer',
        amount: 500,
      }),
    )
    const afterTip = applyGoalEvent(
      afterBits.ladder,
      createEvent({
        id: 'tip-1',
        source: 'streamlabs',
        eventType: 'tip',
        amount: 25,
        currency: 'USD',
      }),
    )

    expect(afterBits.contributionAmount).toBe(5)
    expect(afterTip.contributionAmount).toBe(5)
    expect(afterTip.ladder.currentAmount).toBe(10)
    expect(afterTip.completedMilestones[0]?.rewardTitle).toBe('Wear the cursed hat')
  })

  it('blocks test events from mutating production goal progress by default', () => {
    const result = applyGoalEvent(
      createLadder(),
      createEvent({
        id: 'test-cheer-1',
        eventType: 'cheer',
        amount: 500,
        rawPayload: { isTest: true },
      }),
    )

    expect(result.accepted).toBe(false)
    expect(result.ignoredReason).toBe('test_event_blocked')
    expect(result.ladder.currentAmount).toBe(0)
  })
})
