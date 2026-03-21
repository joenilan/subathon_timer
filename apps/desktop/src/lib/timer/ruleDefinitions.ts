import type { TimerRuleConfig, TimerRuleNumericKey, TimerRuleToggleKey } from './types'

export type TimerDisplayRuleKey =
  | 'tier1SubSeconds'
  | 'tier2SubSeconds'
  | 'tier3SubSeconds'
  | 'bitsUnitSeconds'
  | 'followSeconds'
  | 'raidUnitSeconds'

export type TimerRuleMarkerShape = 'square' | 'diamond' | 'pill'
export type TimerRuleMarkerTone = 'blue' | 'mint' | 'green' | 'cyan' | 'lime'

type TimerSharedTierKey = Extract<TimerDisplayRuleKey, 'tier1SubSeconds' | 'tier2SubSeconds' | 'tier3SubSeconds'>
type TimerSubOverrideToggleKey = Extract<
  TimerRuleToggleKey,
  'subscriptionUseCustomValues' | 'resubscriptionUseCustomValues' | 'giftSubscriptionUseCustomValues' | 'giftBombUseCustomValues'
>
type TimerSubOverrideTierKeys = readonly [TimerRuleNumericKey, TimerRuleNumericKey, TimerRuleNumericKey]

export interface TimerTierRuleDefinition {
  key: TimerSharedTierKey
  label: string
  shortLabel: string
  hint: string
  markerShape: TimerRuleMarkerShape
  markerTone: TimerRuleMarkerTone
}

export interface TimerRuleControlDefinition {
  key: TimerRuleNumericKey
  label: string
  min?: number
  step?: number
  suffix?: string
}

export interface TimerEventRuleDefinition {
  key: TimerRuleToggleKey
  label: string
  hint: string
  sharedValueNote?: string
  controls?: TimerRuleControlDefinition[]
  customToggleKey?: TimerSubOverrideToggleKey
  customToggleLabel?: string
}

interface TimerCustomSubDisplayDefinition {
  eventEnabledKey: Extract<
    TimerRuleToggleKey,
    'subscriptionEnabled' | 'resubscriptionEnabled' | 'giftSubscriptionEnabled' | 'giftBombEnabled'
  >
  customToggleKey: TimerSubOverrideToggleKey
  label: string
  shortLabel: string
  markerShape: TimerRuleMarkerShape
  markerTone: TimerRuleMarkerTone
  tierKeys: TimerSubOverrideTierKeys
}

export interface TimerRuleDisplayItem {
  key?: TimerDisplayRuleKey
  label: string
  value: string
  seconds?: number
  markerShape: TimerRuleMarkerShape
  markerTone: TimerRuleMarkerTone
}

export const timerTierRuleDefinitions: TimerTierRuleDefinition[] = [
  {
    key: 'tier1SubSeconds',
    label: 'Tier 1 sub',
    shortLabel: 'T1 Sub',
    hint: 'Shared seconds for tier 1000 subscriptions, resubs, gifted subs, and gift bombs by default.',
    markerShape: 'square',
    markerTone: 'blue',
  },
  {
    key: 'tier2SubSeconds',
    label: 'Tier 2 sub',
    shortLabel: 'T2 Sub',
    hint: 'Shared seconds when Twitch reports tier 2000.',
    markerShape: 'square',
    markerTone: 'mint',
  },
  {
    key: 'tier3SubSeconds',
    label: 'Tier 3 sub',
    shortLabel: 'T3 Sub',
    hint: 'Shared seconds when Twitch reports tier 3000.',
    markerShape: 'square',
    markerTone: 'green',
  },
]

const timerCustomSubDisplayDefinitions: TimerCustomSubDisplayDefinition[] = [
  {
    eventEnabledKey: 'subscriptionEnabled',
    customToggleKey: 'subscriptionUseCustomValues',
    label: 'New subscription tiers',
    shortLabel: 'New Sub',
    markerShape: 'square',
    markerTone: 'blue',
    tierKeys: ['subscriptionTier1Seconds', 'subscriptionTier2Seconds', 'subscriptionTier3Seconds'],
  },
  {
    eventEnabledKey: 'resubscriptionEnabled',
    customToggleKey: 'resubscriptionUseCustomValues',
    label: 'Resubscription tiers',
    shortLabel: 'Resub',
    markerShape: 'square',
    markerTone: 'mint',
    tierKeys: ['resubscriptionTier1Seconds', 'resubscriptionTier2Seconds', 'resubscriptionTier3Seconds'],
  },
  {
    eventEnabledKey: 'giftSubscriptionEnabled',
    customToggleKey: 'giftSubscriptionUseCustomValues',
    label: 'Gifted sub tiers',
    shortLabel: 'Gifted',
    markerShape: 'square',
    markerTone: 'cyan',
    tierKeys: ['giftSubscriptionTier1Seconds', 'giftSubscriptionTier2Seconds', 'giftSubscriptionTier3Seconds'],
  },
  {
    eventEnabledKey: 'giftBombEnabled',
    customToggleKey: 'giftBombUseCustomValues',
    label: 'Gift bomb tiers',
    shortLabel: 'Gift Bomb',
    markerShape: 'diamond',
    markerTone: 'lime',
    tierKeys: ['giftBombTier1Seconds', 'giftBombTier2Seconds', 'giftBombTier3Seconds'],
  },
]

export const timerEventRuleDefinitions: TimerEventRuleDefinition[] = [
  {
    key: 'subscriptionEnabled',
    label: 'New subscriptions',
    hint: 'Applies time when someone subscribes for the first time.',
    sharedValueNote: 'Defaults to the shared T1 / T2 / T3 values above.',
    customToggleKey: 'subscriptionUseCustomValues',
    customToggleLabel: 'Use custom tiers',
    controls: [
      { key: 'subscriptionTier1Seconds', label: 'Tier 1', min: 0, suffix: 's' },
      { key: 'subscriptionTier2Seconds', label: 'Tier 2', min: 0, suffix: 's' },
      { key: 'subscriptionTier3Seconds', label: 'Tier 3', min: 0, suffix: 's' },
    ],
  },
  {
    key: 'resubscriptionEnabled',
    label: 'Resubscriptions',
    hint: 'Applies time when Twitch sends a subscription message event.',
    sharedValueNote: 'Defaults to the shared T1 / T2 / T3 values above.',
    customToggleKey: 'resubscriptionUseCustomValues',
    customToggleLabel: 'Use custom tiers',
    controls: [
      { key: 'resubscriptionTier1Seconds', label: 'Tier 1', min: 0, suffix: 's' },
      { key: 'resubscriptionTier2Seconds', label: 'Tier 2', min: 0, suffix: 's' },
      { key: 'resubscriptionTier3Seconds', label: 'Tier 3', min: 0, suffix: 's' },
    ],
  },
  {
    key: 'giftSubscriptionEnabled',
    label: 'Single gifted subs',
    hint: 'Applies time for one-off gifted subscriptions.',
    sharedValueNote: 'Defaults to the shared T1 / T2 / T3 values above.',
    customToggleKey: 'giftSubscriptionUseCustomValues',
    customToggleLabel: 'Use custom tiers',
    controls: [
      { key: 'giftSubscriptionTier1Seconds', label: 'Tier 1', min: 0, suffix: 's' },
      { key: 'giftSubscriptionTier2Seconds', label: 'Tier 2', min: 0, suffix: 's' },
      { key: 'giftSubscriptionTier3Seconds', label: 'Tier 3', min: 0, suffix: 's' },
    ],
  },
  {
    key: 'giftBombEnabled',
    label: 'Gift bombs',
    hint: 'Applies time for multi-gift events and multiplies by gift count.',
    sharedValueNote: 'Defaults to the shared T1 / T2 / T3 values above, then multiplies per gift.',
    customToggleKey: 'giftBombUseCustomValues',
    customToggleLabel: 'Use custom per-gift tiers',
    controls: [
      { key: 'giftBombTier1Seconds', label: 'Tier 1 / gift', min: 0, suffix: 's' },
      { key: 'giftBombTier2Seconds', label: 'Tier 2 / gift', min: 0, suffix: 's' },
      { key: 'giftBombTier3Seconds', label: 'Tier 3 / gift', min: 0, suffix: 's' },
    ],
  },
  {
    key: 'cheerEnabled',
    label: 'Bits / cheers',
    hint: 'Applies time whenever the cheer crosses the configured bits unit.',
    controls: [
      { key: 'bitsPerUnit', label: 'Bits unit', min: 1 },
      { key: 'bitsUnitSeconds', label: 'Seconds', min: 0, suffix: 's' },
    ],
  },
  {
    key: 'followEnabled',
    label: 'Follows',
    hint: 'Applies a flat amount whenever someone follows the channel.',
    controls: [{ key: 'followSeconds', label: 'Seconds', min: 0, suffix: 's' }],
  },
  {
    key: 'raidEnabled',
    label: 'Incoming raids',
    hint: 'Applies time from raid viewer count using the configured viewer unit.',
    controls: [
      { key: 'raidViewerCountUnit', label: 'Viewer unit', min: 1, suffix: 'viewers' },
      { key: 'raidUnitSeconds', label: 'Seconds', min: 0, suffix: 's' },
    ],
  },
]

function usesSharedTierDefaults(
  ruleConfig: TimerRuleConfig,
  eventEnabledKey: TimerCustomSubDisplayDefinition['eventEnabledKey'],
  customToggleKey: TimerCustomSubDisplayDefinition['customToggleKey'],
  [tier1Key, tier2Key, tier3Key]: TimerSubOverrideTierKeys,
) {
  if (!ruleConfig[eventEnabledKey]) {
    return false
  }

  if (!ruleConfig.advancedSubEventOverridesEnabled || !ruleConfig[customToggleKey]) {
    return true
  }

  return (
    ruleConfig[tier1Key] === ruleConfig.tier1SubSeconds &&
    ruleConfig[tier2Key] === ruleConfig.tier2SubSeconds &&
    ruleConfig[tier3Key] === ruleConfig.tier3SubSeconds
  )
}

function buildTierValueSummary(ruleConfig: TimerRuleConfig, [tier1Key, tier2Key, tier3Key]: TimerSubOverrideTierKeys) {
  return `${ruleConfig[tier1Key]}/${ruleConfig[tier2Key]}/${ruleConfig[tier3Key]}s`
}

export function buildTimerRuleDisplay(
  ruleConfig: TimerRuleConfig,
  labelStyle: 'short' | 'full' = 'short',
): TimerRuleDisplayItem[] {
  const items: TimerRuleDisplayItem[] = []

  const hasSharedSubscriptionDisplay = timerCustomSubDisplayDefinitions.some((definition) =>
    usesSharedTierDefaults(ruleConfig, definition.eventEnabledKey, definition.customToggleKey, definition.tierKeys),
  )

  if (hasSharedSubscriptionDisplay) {
    timerTierRuleDefinitions.forEach((definition) => {
      items.push({
        key: definition.key,
        label: labelStyle === 'full' ? definition.label : definition.shortLabel,
        value: `+${ruleConfig[definition.key]}s`,
        seconds: ruleConfig[definition.key],
        markerShape: definition.markerShape,
        markerTone: definition.markerTone,
      })
    })
  }

  timerCustomSubDisplayDefinitions.forEach((definition) => {
    const [tier1Key, tier2Key, tier3Key] = definition.tierKeys
    const hasMeaningfulOverride =
      ruleConfig.advancedSubEventOverridesEnabled &&
      ruleConfig[definition.eventEnabledKey] &&
      ruleConfig[definition.customToggleKey] &&
      (ruleConfig[tier1Key] !== ruleConfig.tier1SubSeconds ||
        ruleConfig[tier2Key] !== ruleConfig.tier2SubSeconds ||
        ruleConfig[tier3Key] !== ruleConfig.tier3SubSeconds)

    if (!hasMeaningfulOverride) {
      return
    }

    items.push({
      label: labelStyle === 'full' ? definition.label : definition.shortLabel,
      value: buildTierValueSummary(ruleConfig, definition.tierKeys),
      markerShape: definition.markerShape,
      markerTone: definition.markerTone,
    })
  })

  if (ruleConfig.cheerEnabled) {
    items.push({
      key: 'bitsUnitSeconds',
      label: labelStyle === 'full' ? `Bits per ${ruleConfig.bitsPerUnit}` : `${ruleConfig.bitsPerUnit} Bits`,
      value: `+${ruleConfig.bitsUnitSeconds}s`,
      seconds: ruleConfig.bitsUnitSeconds,
      markerShape: 'diamond',
      markerTone: 'cyan',
    })
  }

  if (ruleConfig.followEnabled) {
    items.push({
      key: 'followSeconds',
      label: 'Follow',
      value: `+${ruleConfig.followSeconds}s`,
      seconds: ruleConfig.followSeconds,
      markerShape: 'pill',
      markerTone: 'lime',
    })
  }

  if (ruleConfig.raidEnabled) {
    items.push({
      key: 'raidUnitSeconds',
      label: labelStyle === 'full' ? `Raid per ${ruleConfig.raidViewerCountUnit} viewers` : `${ruleConfig.raidViewerCountUnit} Raiders`,
      value: `+${ruleConfig.raidUnitSeconds}s`,
      seconds: ruleConfig.raidUnitSeconds,
      markerShape: 'diamond',
      markerTone: 'mint',
    })
  }

  return items
}
