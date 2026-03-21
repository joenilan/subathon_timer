import type {
  NormalizedTwitchEvent,
  TimerAdjustmentResult,
  TimerRuleConfig,
  TimerRuleNumericKey,
  TimerRuleToggleKey,
} from './types'

const timerRuleToggleKeys: TimerRuleToggleKey[] = [
  'advancedSubEventOverridesEnabled',
  'subscriptionEnabled',
  'resubscriptionEnabled',
  'giftSubscriptionEnabled',
  'giftBombEnabled',
  'subscriptionUseCustomValues',
  'resubscriptionUseCustomValues',
  'giftSubscriptionUseCustomValues',
  'giftBombUseCustomValues',
  'cheerEnabled',
  'followEnabled',
  'raidEnabled',
]

const timerRuleIntegerKeys: Exclude<TimerRuleNumericKey, 'donationMultiplier'>[] = [
  'baseValueSeconds',
  'tier1SubSeconds',
  'tier2SubSeconds',
  'tier3SubSeconds',
  'bitsPerUnit',
  'bitsUnitSeconds',
  'followSeconds',
  'subscriptionTier1Seconds',
  'subscriptionTier2Seconds',
  'subscriptionTier3Seconds',
  'resubscriptionTier1Seconds',
  'resubscriptionTier2Seconds',
  'resubscriptionTier3Seconds',
  'giftSubscriptionTier1Seconds',
  'giftSubscriptionTier2Seconds',
  'giftSubscriptionTier3Seconds',
  'giftBombTier1Seconds',
  'giftBombTier2Seconds',
  'giftBombTier3Seconds',
  'raidViewerCountUnit',
  'raidUnitSeconds',
]

type SubLikeEventType = Extract<
  NormalizedTwitchEvent['eventType'],
  'subscription' | 'resubscription' | 'gift_subscription' | 'gift_bomb'
>

type TierOverrideKeys = readonly [
  TimerRuleNumericKey,
  TimerRuleNumericKey,
  TimerRuleNumericKey,
]

function isToggleRuleKey(key: keyof TimerRuleConfig): key is TimerRuleToggleKey {
  return timerRuleToggleKeys.includes(key as TimerRuleToggleKey)
}

function isIntegerRuleKey(key: keyof TimerRuleConfig): key is Exclude<TimerRuleNumericKey, 'donationMultiplier'> {
  return timerRuleIntegerKeys.includes(key as Exclude<TimerRuleNumericKey, 'donationMultiplier'>)
}

function normalizeInteger(value: number, minimum = 0) {
  return Math.max(minimum, Math.round(Number.isFinite(value) ? value : 0))
}

function normalizeDecimal(value: number, minimum = 0) {
  const safeValue = Number.isFinite(value) ? value : 0
  return Math.max(minimum, Math.round(safeValue * 100) / 100)
}

function getSharedTierSeconds(tier: string | null, config: TimerRuleConfig) {
  switch (tier) {
    case '2000':
      return config.tier2SubSeconds
    case '3000':
      return config.tier3SubSeconds
    default:
      return config.tier1SubSeconds
  }
}

function getOverrideTierKeys(eventType: SubLikeEventType): TierOverrideKeys {
  switch (eventType) {
    case 'subscription':
      return ['subscriptionTier1Seconds', 'subscriptionTier2Seconds', 'subscriptionTier3Seconds']
    case 'resubscription':
      return ['resubscriptionTier1Seconds', 'resubscriptionTier2Seconds', 'resubscriptionTier3Seconds']
    case 'gift_subscription':
      return ['giftSubscriptionTier1Seconds', 'giftSubscriptionTier2Seconds', 'giftSubscriptionTier3Seconds']
    case 'gift_bomb':
      return ['giftBombTier1Seconds', 'giftBombTier2Seconds', 'giftBombTier3Seconds']
  }
}

function usesCustomSubValues(eventType: SubLikeEventType, config: TimerRuleConfig) {
  if (!config.advancedSubEventOverridesEnabled) {
    return false
  }

  switch (eventType) {
    case 'subscription':
      return config.subscriptionUseCustomValues
    case 'resubscription':
      return config.resubscriptionUseCustomValues
    case 'gift_subscription':
      return config.giftSubscriptionUseCustomValues
    case 'gift_bomb':
      return config.giftBombUseCustomValues
  }
}

function getTierSecondsForEvent(eventType: SubLikeEventType, tier: string | null, config: TimerRuleConfig) {
  if (!usesCustomSubValues(eventType, config)) {
    return getSharedTierSeconds(tier, config)
  }

  const [tier1Key, tier2Key, tier3Key] = getOverrideTierKeys(eventType)

  switch (tier) {
    case '2000':
      return config[tier2Key]
    case '3000':
      return config[tier3Key]
    default:
      return config[tier1Key]
  }
}

export function formatDurationClock(totalSeconds: number) {
  const safeTotal = Math.max(0, Math.floor(totalSeconds))
  const hours = Math.floor(safeTotal / 3600)
  const minutes = Math.floor((safeTotal % 3600) / 60)
  const seconds = safeTotal % 60

  return [hours, minutes, seconds].map((value) => String(value).padStart(2, '0')).join(':')
}

export function formatSignedDuration(totalSeconds: number) {
  const absoluteDelta = Math.abs(Math.round(totalSeconds))
  const minutes = Math.floor(absoluteDelta / 60)
  const seconds = absoluteDelta % 60

  return `${totalSeconds >= 0 ? '+' : '-'}${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
}

export function getDefaultTimerRuleConfig(): TimerRuleConfig {
  return {
    baseValueSeconds: 60,
    tier1SubSeconds: 60,
    tier2SubSeconds: 120,
    tier3SubSeconds: 300,
    donationMultiplier: 0.2,
    bitsPerUnit: 100,
    bitsUnitSeconds: 12,
    followSeconds: 0,
    advancedSubEventOverridesEnabled: false,
    subscriptionEnabled: true,
    resubscriptionEnabled: true,
    giftSubscriptionEnabled: true,
    giftBombEnabled: true,
    subscriptionUseCustomValues: false,
    resubscriptionUseCustomValues: false,
    giftSubscriptionUseCustomValues: false,
    giftBombUseCustomValues: false,
    subscriptionTier1Seconds: 60,
    subscriptionTier2Seconds: 120,
    subscriptionTier3Seconds: 300,
    resubscriptionTier1Seconds: 60,
    resubscriptionTier2Seconds: 120,
    resubscriptionTier3Seconds: 300,
    giftSubscriptionTier1Seconds: 60,
    giftSubscriptionTier2Seconds: 120,
    giftSubscriptionTier3Seconds: 300,
    giftBombTier1Seconds: 60,
    giftBombTier2Seconds: 120,
    giftBombTier3Seconds: 300,
    cheerEnabled: true,
    followEnabled: false,
    raidEnabled: false,
    raidViewerCountUnit: 10,
    raidUnitSeconds: 60,
  }
}

export function normalizeTimerRuleConfig(value: Partial<TimerRuleConfig> | null | undefined): TimerRuleConfig {
  const fallback = getDefaultTimerRuleConfig()
  const legacyValue = (value ?? {}) as Partial<TimerRuleConfig> & {
    giftSubscriptionSeconds?: number
    giftBombSecondsPerGift?: number
  }
  const legacyGiftSubscriptionSeconds = legacyValue.giftSubscriptionSeconds
  const legacyGiftBombSecondsPerGift = legacyValue.giftBombSecondsPerGift
  const merged = {
    ...fallback,
    ...(value ?? {}),
    subscriptionTier1Seconds: value?.subscriptionTier1Seconds ?? value?.tier1SubSeconds ?? fallback.subscriptionTier1Seconds,
    subscriptionTier2Seconds: value?.subscriptionTier2Seconds ?? value?.tier2SubSeconds ?? fallback.subscriptionTier2Seconds,
    subscriptionTier3Seconds: value?.subscriptionTier3Seconds ?? value?.tier3SubSeconds ?? fallback.subscriptionTier3Seconds,
    resubscriptionTier1Seconds: value?.resubscriptionTier1Seconds ?? value?.tier1SubSeconds ?? fallback.resubscriptionTier1Seconds,
    resubscriptionTier2Seconds: value?.resubscriptionTier2Seconds ?? value?.tier2SubSeconds ?? fallback.resubscriptionTier2Seconds,
    resubscriptionTier3Seconds: value?.resubscriptionTier3Seconds ?? value?.tier3SubSeconds ?? fallback.resubscriptionTier3Seconds,
    giftSubscriptionTier1Seconds:
      value?.giftSubscriptionTier1Seconds ?? legacyGiftSubscriptionSeconds ?? value?.tier1SubSeconds ?? fallback.giftSubscriptionTier1Seconds,
    giftSubscriptionTier2Seconds:
      value?.giftSubscriptionTier2Seconds ?? legacyGiftSubscriptionSeconds ?? value?.tier2SubSeconds ?? fallback.giftSubscriptionTier2Seconds,
    giftSubscriptionTier3Seconds:
      value?.giftSubscriptionTier3Seconds ?? legacyGiftSubscriptionSeconds ?? value?.tier3SubSeconds ?? fallback.giftSubscriptionTier3Seconds,
    giftBombTier1Seconds: value?.giftBombTier1Seconds ?? legacyGiftBombSecondsPerGift ?? value?.tier1SubSeconds ?? fallback.giftBombTier1Seconds,
    giftBombTier2Seconds: value?.giftBombTier2Seconds ?? legacyGiftBombSecondsPerGift ?? value?.tier2SubSeconds ?? fallback.giftBombTier2Seconds,
    giftBombTier3Seconds: value?.giftBombTier3Seconds ?? legacyGiftBombSecondsPerGift ?? value?.tier3SubSeconds ?? fallback.giftBombTier3Seconds,
    advancedSubEventOverridesEnabled: value?.advancedSubEventOverridesEnabled ?? fallback.advancedSubEventOverridesEnabled,
    giftSubscriptionUseCustomValues: value?.giftSubscriptionUseCustomValues ?? fallback.giftSubscriptionUseCustomValues,
    giftBombUseCustomValues: value?.giftBombUseCustomValues ?? fallback.giftBombUseCustomValues,
  } satisfies TimerRuleConfig

  const normalized = { ...merged }

  ;(Object.keys(normalized) as Array<keyof TimerRuleConfig>).forEach((key) => {
    if (isToggleRuleKey(key)) {
      normalized[key] = Boolean(merged[key]) as TimerRuleConfig[typeof key]
      return
    }

    if (isIntegerRuleKey(key)) {
      const minimum = key === 'baseValueSeconds' || key === 'bitsPerUnit' || key === 'raidViewerCountUnit' ? 1 : 0
      normalized[key] = normalizeInteger(Number(merged[key]), minimum) as TimerRuleConfig[typeof key]
      return
    }

    normalized[key] = normalizeDecimal(Number(merged[key]), 0) as TimerRuleConfig[typeof key]
  })

  return normalized
}

export function resolveTimerAdjustment(
  event: NormalizedTwitchEvent,
  config: TimerRuleConfig,
): TimerAdjustmentResult | null {
  switch (event.eventType) {
    case 'subscription': {
      if (!config.subscriptionEnabled) {
        return null
      }

      const deltaSeconds = getTierSecondsForEvent('subscription', event.tier, config)
      return {
        deltaSeconds,
        title: 'Subscription applied',
        summary: `${event.displayName ?? 'A viewer'} added ${formatSignedDuration(deltaSeconds)} with a tier ${event.tier ?? '1000'} sub.`,
      }
    }
    case 'resubscription': {
      if (!config.resubscriptionEnabled) {
        return null
      }

      const deltaSeconds = getTierSecondsForEvent('resubscription', event.tier, config)
      return {
        deltaSeconds,
        title: 'Resubscription applied',
        summary: `${event.displayName ?? 'A viewer'} renewed and added ${formatSignedDuration(deltaSeconds)} to the timer.`,
      }
    }
    case 'gift_subscription': {
      if (!config.giftSubscriptionEnabled) {
        return null
      }

      const deltaSeconds = getTierSecondsForEvent('gift_subscription', event.tier, config)
      if (deltaSeconds <= 0) {
        return null
      }

      return {
        deltaSeconds,
        title: 'Gifted subscription applied',
        summary: `${event.anonymous ? 'An anonymous gifter' : event.displayName ?? 'A gifter'} added ${formatSignedDuration(deltaSeconds)} with a gifted sub.`,
      }
    }
    case 'gift_bomb': {
      if (!config.giftBombEnabled) {
        return null
      }

      const giftCount = Math.max(event.count ?? 1, 1)
      const deltaSeconds = getTierSecondsForEvent('gift_bomb', event.tier, config) * giftCount
      if (deltaSeconds <= 0) {
        return null
      }

      return {
        deltaSeconds,
        title: 'Gift bomb applied',
        summary: `${event.anonymous ? 'An anonymous gifter' : event.displayName ?? 'A gifter'} added ${formatSignedDuration(deltaSeconds)} across ${giftCount} gifted sub${giftCount === 1 ? '' : 's'}.`,
      }
    }
    case 'cheer': {
      if (!config.cheerEnabled) {
        return null
      }

      const bitCount = event.amount ?? 0
      const units = Math.floor(bitCount / config.bitsPerUnit)

      if (units <= 0) {
        return null
      }

      const deltaSeconds = units * config.bitsUnitSeconds
      return {
        deltaSeconds,
        title: 'Bits applied',
        summary: `${event.displayName ?? 'A viewer'} cheered ${bitCount} bits and added ${formatSignedDuration(deltaSeconds)}.`,
      }
    }
    case 'follow': {
      if (!config.followEnabled || config.followSeconds <= 0) {
        return null
      }

      return {
        deltaSeconds: config.followSeconds,
        title: 'Follow bonus applied',
        summary: `${event.displayName ?? 'A new follower'} triggered the follow rule for ${formatSignedDuration(config.followSeconds)}.`,
      }
    }
    case 'raid': {
      if (!config.raidEnabled) {
        return null
      }

      const viewerCount = Math.max(event.amount ?? 0, 0)
      const units = Math.floor(viewerCount / Math.max(config.raidViewerCountUnit, 1))

      if (units <= 0 || config.raidUnitSeconds <= 0) {
        return null
      }

      const deltaSeconds = units * config.raidUnitSeconds
      return {
        deltaSeconds,
        title: 'Raid applied',
        summary: `${event.displayName ?? 'Another streamer'} raided with ${viewerCount} viewer${viewerCount === 1 ? '' : 's'} and added ${formatSignedDuration(deltaSeconds)}.`,
      }
    }
    case 'chat_command':
      return null
  }
}
