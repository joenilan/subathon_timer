import { describe, expect, it } from 'vitest'
import type { NativeAppSnapshot } from '../platform/nativeAppState'
import {
  getDefaultTimerRuleConfig,
  normalizeTimerRuleConfig,
  resolveTimerAdjustment,
} from './engine'
import {
  clampTimer,
  deriveTimerDecorations,
  hydrateTimerSessionFromSnapshot,
  resolveRuntimeFromSession,
} from './runtime'

describe('normalizeTimerRuleConfig', () => {
  it('fills missing values from defaults and preserves legacy fields', () => {
    const config = normalizeTimerRuleConfig({
      tier1SubSeconds: 75,
      giftSubscriptionSeconds: 90,
      giftBombSecondsPerGift: 45,
    } as never)

    expect(config.subscriptionTier1Seconds).toBe(75)
    expect(config.giftSubscriptionTier1Seconds).toBe(90)
    expect(config.giftBombTier1Seconds).toBe(45)
    expect(config.baseValueSeconds).toBe(getDefaultTimerRuleConfig().baseValueSeconds)
  })

  it('clamps invalid numeric values to safe minimums', () => {
    const config = normalizeTimerRuleConfig({
      baseValueSeconds: -4,
      bitsPerUnit: 0,
      raidViewerCountUnit: -10,
      donationMultiplier: -5,
    })

    expect(config.baseValueSeconds).toBe(1)
    expect(config.bitsPerUnit).toBe(1)
    expect(config.raidViewerCountUnit).toBe(1)
    expect(config.donationMultiplier).toBe(0)
  })
})

describe('resolveTimerAdjustment', () => {
  it('uses advanced tier overrides for gift bombs', () => {
    const config = normalizeTimerRuleConfig({
      advancedSubEventOverridesEnabled: true,
      giftBombUseCustomValues: true,
      giftBombTier2Seconds: 210,
    })

    const result = resolveTimerAdjustment(
      {
        id: 'evt-1',
        source: 'twitch-eventsub',
        eventType: 'gift_bomb',
        occurredAt: new Date().toISOString(),
        userId: '1',
        userLogin: 'gifter',
        displayName: 'Gifter',
        anonymous: false,
        amount: null,
        tier: '2000',
        count: 3,
        command: null,
        rawPayload: {},
      },
      config,
    )

    expect(result?.deltaSeconds).toBe(630)
    expect(result?.summary).toContain('3 gifted subs')
  })

  it('returns null when a rule is disabled', () => {
    const config = normalizeTimerRuleConfig({
      followEnabled: false,
      followSeconds: 90,
    })

    const result = resolveTimerAdjustment(
      {
        id: 'evt-2',
        source: 'twitch-eventsub',
        eventType: 'follow',
        occurredAt: new Date().toISOString(),
        userId: '2',
        userLogin: 'viewer',
        displayName: 'Viewer',
        anonymous: false,
        amount: null,
        tier: null,
        count: null,
        command: null,
        rawPayload: {},
      },
      config,
    )

    expect(result).toBeNull()
  })
})

describe('timer runtime helpers', () => {
  it('rehydrates a running timer session from the persisted anchor', () => {
    const now = 20_000
    const snapshot: NativeAppSnapshot = {
      version: 6 as const,
      settings: {
        defaultTimerSeconds: 21_600,
        commandPermissions: {
          add: 'both',
          remove: 'both',
          pause: 'both',
          resume: 'both',
          start: 'both',
          set: 'streamer',
          reset: 'streamer',
          help: 'both',
        },
        overlayLanAccessEnabled: false,
      },
      ruleConfig: getDefaultTimerRuleConfig(),
      wheelSegments: [],
      timerSession: {
        timerStatus: 'running' as const,
        baseRemainingSeconds: 600,
        baseUptimeSeconds: 120,
        runningSince: 10_000,
        lastAppliedDeltaSeconds: 0,
        events: [],
      },
    }

    const hydrated = hydrateTimerSessionFromSnapshot(snapshot, now)

    expect(hydrated.timerRemainingSeconds).toBe(590)
    expect(hydrated.uptimeSeconds).toBe(130)
    expect(hydrated.timerStatus).toBe('running')
  })

  it('resolves a finished timer when elapsed time reaches zero', () => {
    const runtime = resolveRuntimeFromSession(
      {
        timerStatus: 'running',
        timerSessionBaseRemainingSeconds: 5,
        timerSessionBaseUptimeSeconds: 100,
        timerSessionRunningSince: 1_000,
      },
      7_000,
    )

    expect(runtime.timerStatus).toBe('finished')
    expect(runtime.timerRemainingSeconds).toBe(0)
    expect(runtime.uptimeSeconds).toBe(106)
  })

  it('derives trend and activity history from timer events', () => {
    const decorations = deriveTimerDecorations(
      300,
      [
        {
          id: 'event-2',
          title: 'Remove',
          summary: 'Removed time',
          deltaSeconds: -60,
          occurredAt: 2,
          source: 'manual',
          remainingSeconds: 240,
        },
        {
          id: 'event-1',
          title: 'Add',
          summary: 'Added time',
          deltaSeconds: 120,
          occurredAt: 1,
          source: 'manual',
          remainingSeconds: 360,
        },
      ],
      clampTimer(240),
    )

    expect(decorations.lastAppliedDeltaSeconds).toBe(-60)
    expect(decorations.activity).toHaveLength(2)
    expect(decorations.trendPoints).toEqual([300, 360, 240])
  })
})
