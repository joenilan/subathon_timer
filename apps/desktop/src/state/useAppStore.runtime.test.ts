// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useAppStore } from './useAppStore'

describe('useAppStore runtime behavior', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    useAppStore.setState(useAppStore.getInitialState(), true)
  })

  afterEach(() => {
    vi.runOnlyPendingTimers()
    vi.useRealTimers()
  })

  it('applies a normalized Twitch event only once per event id', () => {
    const event = {
      id: 'event-1',
      source: 'twitch-eventsub' as const,
      eventType: 'subscription' as const,
      occurredAt: new Date().toISOString(),
      userId: 'user-1',
      userLogin: 'viewer1',
      displayName: 'Viewer 1',
      anonymous: false,
      amount: null,
      currency: null,
      tier: '1000',
      count: null,
      command: null,
      rawPayload: {},
    }

    useAppStore.getState().processTwitchEvent(event)
    useAppStore.getState().processTwitchEvent(event)

    const state = useAppStore.getState()
    expect(state.timerEvents).toHaveLength(1)
    expect(state.processedEventIds).toContain('event-1')
  })

  it('applies a ready time wheel result once and resets wheel state', async () => {
    const initial = useAppStore.getInitialState()

    useAppStore.setState({
      ...initial,
      wheelSegments: [
        {
          id: 'wheel-test',
          label: '+5 minutes',
          chance: '100%',
          outcome: 'Adds five minutes.',
          outcomeType: 'time',
          timeDeltaSeconds: 300,
          moderationRequired: false,
        },
      ],
      wheelSpin: {
        status: 'ready',
        activeSegmentId: 'wheel-test',
        resultTitle: '+5 minutes',
        resultSummary: 'Adds five minutes.',
        requiresModeration: false,
        autoApply: false,
      },
    })

    const before = useAppStore.getState().timerRemainingSeconds
    await useAppStore.getState().applyWheelResult()
    const after = useAppStore.getState()

    expect(after.timerRemainingSeconds).toBe(before + 300)
    expect(after.wheelSpin.status).toBe('idle')
    expect(after.timerEvents[0]?.title).toBe('Wheel outcome applied')
  })

  it('auto-spins and auto-applies the wheel for qualifying gift bombs', async () => {
    const initial = useAppStore.getInitialState()

    useAppStore.setState({
      ...initial,
      wheelSegments: [
        {
          id: 'wheel-gift-bomb',
          label: 'Gift bomb bonus',
          chance: '100%',
          outcome: 'Adds five minutes.',
          outcomeType: 'time',
          minSubs: 5,
          timeDeltaSeconds: 300,
          moderationRequired: false,
        },
      ],
    })

    useAppStore.getState().processTwitchEvent({
      id: 'gift-bomb-1',
      source: 'twitch-eventsub',
      eventType: 'gift_bomb',
      occurredAt: new Date().toISOString(),
      userId: 'gifter-1',
      userLogin: 'gifter',
      displayName: 'Gifter',
      anonymous: false,
      amount: null,
      currency: null,
      tier: '1000',
      count: 5,
      command: null,
      rawPayload: {},
    })

    const state = useAppStore.getState()
    expect(state.wheelSpin.status).toBe('spinning')
    expect(state.wheelSpin.activeSegmentId).toBe('wheel-gift-bomb')
    expect(state.timerEvents[0]?.title).toBe('Gift bomb applied')

    await vi.advanceTimersByTimeAsync(3000)

    const finalState = useAppStore.getState()
    expect(finalState.timerRemainingSeconds).toBe(initial.timerRemainingSeconds + 300 + 300)
    expect(finalState.wheelSpin.status).toBe('idle')
    expect(finalState.timerEvents[0]?.title).toBe('Wheel outcome applied')
  })

  it('runs the gift bomb test through the live wheel auto-spin path', async () => {
    useAppStore.setState({
      timerStatus: 'paused',
      timerRemainingSeconds: 3600,
      timerSessionBaseRemainingSeconds: 3600,
      timerSessionBaseUptimeSeconds: 0,
      timerSessionRunningSince: null,
      timerEvents: [],
      trendPoints: [3600],
      activity: [],
      processedEventIds: [],
      wheelSegments: [
        {
          id: 'wheel-test-spin',
          label: 'Test Spin',
          chance: '100%',
          outcome: 'Test reward',
          outcomeType: 'time',
          color: '#22d3ee',
          minSubs: 3,
          timeDeltaSeconds: 120,
          moderationRequired: false,
        },
      ],
      wheelSpin: {
        status: 'idle',
        activeSegmentId: null,
        resultTitle: null,
        resultSummary: null,
        requiresModeration: false,
        autoApply: false,
      },
    })

    useAppStore.getState().triggerGiftBombTest(3)

    const state = useAppStore.getState()
    expect(state.wheelSpin.status).toBe('spinning')
    expect(state.wheelSpin.activeSegmentId).toBe('wheel-test-spin')
    expect(state.timerEvents[0]?.title).toBe('Gift bomb applied')

    await vi.advanceTimersByTimeAsync(3000)

    const finalState = useAppStore.getState()
    expect(finalState.timerRemainingSeconds).toBe(3900)
    expect(finalState.wheelSpin.status).toBe('idle')
  })
})
