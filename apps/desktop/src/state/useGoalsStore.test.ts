import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useGoalsStore } from './useGoalsStore'

describe('useGoalsStore', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-05-16T12:00:00.000Z'))
    useGoalsStore.setState(useGoalsStore.getInitialState(), true)
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('creates a source-specific reward ladder with sorted milestones', () => {
    const id = useGoalsStore.getState().createLadder({
      title: 'Bits punishments',
      sourceMode: 'single-source',
      sourceType: 'bits',
      unitLabel: 'bits',
      milestones: [
        { thresholdAmount: 500, rewardTitle: 'Eat an egg' },
        { thresholdAmount: 100, rewardTitle: 'Eat a bean' },
      ],
    })

    const ladder = useGoalsStore.getState().ladders.find((entry) => entry.id === id)

    expect(ladder?.title).toBe('Bits punishments')
    expect(ladder?.milestones.map((milestone) => milestone.thresholdAmount)).toEqual([100, 500])
    expect(ladder?.currentAmount).toBe(0)
  })

  it('manually adjusts progress and records crossed milestone history', () => {
    const id = useGoalsStore.getState().createLadder({
      title: 'Bits punishments',
      sourceMode: 'single-source',
      sourceType: 'bits',
      unitLabel: 'bits',
      milestones: [
        { thresholdAmount: 100, rewardTitle: 'Eat a bean' },
        { thresholdAmount: 500, rewardTitle: 'Eat an egg' },
      ],
    })

    useGoalsStore.getState().adjustGoalProgress(id, 600, 'Offline contribution')

    const state = useGoalsStore.getState()
    const ladder = state.ladders.find((entry) => entry.id === id)

    expect(ladder?.currentAmount).toBe(600)
    expect(ladder?.milestones.map((milestone) => milestone.status)).toEqual(['completed', 'completed'])
    expect(state.history.map((entry) => entry.type)).toEqual([
      'manual_adjustment',
      'milestone_completed',
      'milestone_completed',
    ])
  })

  it('hydrates persisted ladders and history from a goals snapshot', () => {
    useGoalsStore.getState().hydrateGoalsSnapshot({
      ladders: [
        {
          id: 'ladder-1',
          title: '  Subs ladder  ',
          status: 'active',
          sourceMode: 'single-source',
          sourceType: 'subscriptions',
          currentAmount: 4,
          unitLabel: 'subs',
          milestones: [
            {
              id: 'm-1',
              thresholdAmount: 5,
              rewardTitle: 'Karaoke song',
              status: 'locked',
            },
          ],
          createdAt: '2026-05-16T12:00:00.000Z',
          config: {
            ...useGoalsStore.getInitialState().ladders[0]?.config,
          } as never,
          processedEventIds: ['twitch-eventsub:sub-1'],
        },
      ],
      announceGoalCompletionsInChat: true,
      history: [
        {
          id: 'history-1',
          ladderId: 'ladder-1',
          type: 'manual_adjustment',
          title: 'Manual goal adjustment',
          summary: 'Starting total',
          deltaAmount: 4,
          occurredAt: Date.now(),
          source: 'manual',
        },
      ],
    })

    const snapshot = useGoalsStore.getState().buildGoalsSnapshot()

    expect(snapshot.ladders[0]?.title).toBe('Subs ladder')
    expect(snapshot.ladders[0]?.processedEventIds).toEqual(['twitch-eventsub:sub-1'])
    expect(snapshot.announceGoalCompletionsInChat).toBe(true)
    expect(snapshot.history[0]?.summary).toBe('Starting total')
  })

  it('returns newly completed milestones and avoids duplicate completion results', () => {
    const id = useGoalsStore.getState().createLadder({
      title: 'Bits punishments',
      sourceMode: 'single-source',
      sourceType: 'bits',
      unitLabel: 'bits',
      milestones: [{ thresholdAmount: 100, rewardTitle: 'Eat a bean' }],
    })
    const event = {
      id: 'cheer-1',
      source: 'twitch-eventsub' as const,
      eventType: 'cheer' as const,
      occurredAt: '2026-05-16T12:00:00.000Z',
      userId: 'user-1',
      userLogin: 'viewer',
      displayName: 'Viewer',
      anonymous: false,
      amount: 150,
      currency: null,
      tier: null,
      count: null,
      command: null,
      rawPayload: {},
    }

    const firstResult = useGoalsStore.getState().processGoalEvent(event)
    const duplicateResult = useGoalsStore.getState().processGoalEvent(event)

    const state = useGoalsStore.getState()
    const ladder = state.ladders.find((entry) => entry.id === id)

    expect(firstResult.completedMilestones).toEqual([
      expect.objectContaining({
        ladderId: id,
        rewardTitle: 'Eat a bean',
        thresholdAmount: 100,
        unitLabel: 'bits',
      }),
    ])
    expect(duplicateResult.completedMilestones).toEqual([])
    expect(ladder?.currentAmount).toBe(150)
    expect(ladder?.processedEventIds).toEqual(['twitch-eventsub:cheer-1'])
    expect(state.history.filter((entry) => entry.type === 'event_progress')).toHaveLength(1)
  })
})
