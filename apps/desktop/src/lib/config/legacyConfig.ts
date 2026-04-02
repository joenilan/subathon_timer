import { normalizeTimerRuleConfig } from '../timer/engine'
import type { WheelSegment } from '../wheel/types'

export interface LegacyConfigImportResult {
  rules: ReturnType<typeof normalizeTimerRuleConfig>
  wheelSegments: WheelSegment[]
}

function asRecord(value: unknown) {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>
  }

  return null
}

function asString(value: unknown, fallback = '') {
  return typeof value === 'string' ? value : fallback
}

function asNumber(value: unknown, fallback = 0) {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}

function percentString(value: number) {
  return `${Math.round(value * 100)}%`
}

export function importLegacyConfig(raw: string): LegacyConfigImportResult {
  const parsed = JSON.parse(raw) as unknown
  const root = asRecord(parsed)

  if (!root) {
    throw new Error('Config JSON must be an object.')
  }

  const time = asRecord(root.time)
  const multipliers = asRecord(time?.multipliers)
  const baseValue = asNumber(time?.base_value, 60)
  const donationMultiplier = asNumber(multipliers?.donation, 0.2)

  const rules = normalizeTimerRuleConfig({
    baseValueSeconds: baseValue,
    tier1SubSeconds: Math.round(baseValue * asNumber(multipliers?.tier_1, 1)),
    tier2SubSeconds: Math.round(baseValue * asNumber(multipliers?.tier_2, 2)),
    tier3SubSeconds: Math.round(baseValue * asNumber(multipliers?.tier_3, 5)),
    donationMultiplier,
    tipEnabled: donationMultiplier > 0,
    tipAmountUnit: 1,
    tipUnitSeconds: Math.round(baseValue * donationMultiplier),
    bitsPerUnit: 100,
    bitsUnitSeconds: Math.round(baseValue * asNumber(multipliers?.bits, 0.2)),
    followSeconds: Math.round(baseValue * asNumber(multipliers?.follow, 0)),
    subscriptionEnabled: true,
    resubscriptionEnabled: true,
    giftSubscriptionEnabled: true,
    giftBombEnabled: true,
    cheerEnabled: asNumber(multipliers?.bits, 0.2) > 0,
    followEnabled: asNumber(multipliers?.follow, 0) > 0,
    raidEnabled: false,
    raidViewerCountUnit: 10,
    raidUnitSeconds: 60,
  })

  const wheel = Array.isArray(root.wheel) ? root.wheel : []
  const wheelSegments: WheelSegment[] = []

  wheel.forEach((entry, index) => {
    const segment = asRecord(entry)
    if (!segment) {
      return
    }

    const type = asString(segment.type, 'custom')
    const outcomeType = type === 'time' || type === 'timeout' ? type : 'custom'
    const chance = percentString(asNumber(segment.chance, 0.1))

    if (outcomeType === 'time') {
      wheelSegments.push({
        id: `wheel-import-${index}`,
        label: asString(segment.text, `Wheel ${index + 1}`),
        chance,
        outcome: `${asNumber(segment.value, 0) >= 0 ? 'Adds' : 'Removes'} ${Math.abs(asNumber(segment.value, 0))} seconds to the live timer.`,
        outcomeType,
        color: asString(segment.color, '#ffffff'),
        minSubs: asNumber(segment.min_subs, 1),
        timeDeltaSeconds: asNumber(segment.value, 0),
        moderationRequired: false,
      })
      return
    }

    if (outcomeType === 'timeout') {
      const target = asString(segment.target, 'sender') === 'random' ? 'random' : 'self'
      wheelSegments.push({
        id: `wheel-import-${index}`,
        label: asString(segment.text, `Wheel ${index + 1}`),
        chance,
        outcome: `Timeout ${target === 'self' ? 'the sender' : 'a random chatter'} for ${asNumber(segment.value, 300)} seconds.`,
        outcomeType,
        color: asString(segment.color, '#ffffff'),
        minSubs: asNumber(segment.min_subs, 1),
        timeoutSeconds: asNumber(segment.value, 300),
        timeoutTarget: target,
        moderationRequired: true,
      })
      return
    }

    wheelSegments.push({
      id: `wheel-import-${index}`,
      label: asString(segment.text, `Wheel ${index + 1}`),
      chance,
      outcome: 'Custom wheel result.',
      outcomeType: 'custom',
      color: asString(segment.color, '#ffffff'),
      minSubs: asNumber(segment.min_subs, 1),
      moderationRequired: false,
    })
  })

  return {
    rules,
    wheelSegments,
  }
}
