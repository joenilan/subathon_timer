// @vitest-environment jsdom

import { beforeEach, describe, expect, it } from 'vitest'
import { useAppStore } from './useAppStore'

describe('useAppStore runtime behavior', () => {
  beforeEach(() => {
    useAppStore.setState(useAppStore.getInitialState(), true)
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
      },
    })

    const before = useAppStore.getState().timerRemainingSeconds
    await useAppStore.getState().applyWheelResult()
    const after = useAppStore.getState()

    expect(after.timerRemainingSeconds).toBe(before + 300)
    expect(after.wheelSpin.status).toBe('idle')
    expect(after.timerEvents[0]?.title).toBe('Wheel outcome applied')
  })
})
