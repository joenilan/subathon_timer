import type { WheelSegment, WheelSpinState } from './types'

const MIN_WHEEL_TEXT_SCALE = 0.35
const MAX_WHEEL_TEXT_SCALE = 0.75
export const DEFAULT_WHEEL_TEXT_SCALE = 0.55

export const defaultWheelSpin: WheelSpinState = {
  status: 'idle',
  activeSegmentId: null,
  resultTitle: null,
  resultSummary: null,
  requiresModeration: false,
}

export function createDefaultWheelSegments(): WheelSegment[] {
  return [
    {
      id: 'wheel-1',
      label: '+5 minutes',
      chance: '28%',
      outcome: 'Adds five minutes to the live timer.',
      outcomeType: 'time',
      color: '#9cf000',
      minSubs: 5,
      timeDeltaSeconds: 300,
      moderationRequired: false,
    },
    {
      id: 'wheel-2',
      label: '-5 minutes',
      chance: '28%',
      outcome: 'Removes five minutes from the live timer.',
      outcomeType: 'time',
      color: '#0000FF',
      minSubs: 5,
      timeDeltaSeconds: -300,
      moderationRequired: false,
    },
    {
      id: 'wheel-3',
      label: '+30 minutes',
      chance: '2%',
      outcome: 'Adds thirty minutes to the live timer.',
      outcomeType: 'time',
      color: '#00990d',
      minSubs: 5,
      timeDeltaSeconds: 1800,
      moderationRequired: false,
    },
    {
      id: 'wheel-4',
      label: '-30 minutes',
      chance: '2%',
      outcome: 'Removes thirty minutes from the live timer.',
      outcomeType: 'time',
      color: '#9c0000',
      minSubs: 5,
      timeDeltaSeconds: -1800,
      moderationRequired: false,
    },
    {
      id: 'wheel-5',
      label: 'Self timeout',
      chance: '20%',
      outcome: 'Timeout the gifter for 300 seconds.',
      outcomeType: 'timeout',
      color: '#fc5d00',
      minSubs: 5,
      timeoutSeconds: 300,
      timeoutTarget: 'self',
      moderationRequired: true,
    },
    {
      id: 'wheel-6',
      label: 'Random timeout',
      chance: '20%',
      outcome: 'Timeout a random chatter for 300 seconds.',
      outcomeType: 'timeout',
      color: '#00fcd2',
      minSubs: 5,
      timeoutSeconds: 300,
      timeoutTarget: 'random',
      moderationRequired: true,
    },
  ]
}

export function createWheelSegment(outcomeType: WheelSegment['outcomeType']): WheelSegment {
  const id = `wheel-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`

  if (outcomeType === 'timeout') {
    return {
      id,
      label: 'New timeout',
      chance: '10%',
      outcome: 'Timeout a selected target.',
      outcomeType,
      color: '#f59e0b',
      minSubs: 1,
      timeoutSeconds: 300,
      timeoutTarget: 'self',
      moderationRequired: true,
    }
  }

  if (outcomeType === 'custom') {
    return {
      id,
      label: 'Stuff happens',
      chance: '10%',
      outcome: 'A custom wheel result that logs into activity.',
      outcomeType,
      color: '#6366f1',
      minSubs: 1,
      moderationRequired: false,
    }
  }

  return {
    id,
    label: '+5 minutes',
    chance: '10%',
    outcome: 'Adds five minutes to the live timer.',
    outcomeType: 'time',
    color: '#22c55e',
    minSubs: 1,
    timeDeltaSeconds: 300,
    moderationRequired: false,
  }
}

export function pickWheelSegment(segments: WheelSegment[]) {
  const weighted = segments.map((segment) => ({
    segment,
    weight: Math.max(Number.parseFloat(segment.chance), 0),
  }))
  const totalWeight = weighted.reduce((sum, entry) => sum + entry.weight, 0)

  if (totalWeight <= 0) {
    return segments[0] ?? null
  }

  let cursor = Math.random() * totalWeight
  for (const entry of weighted) {
    cursor -= entry.weight
    if (cursor <= 0) {
      return entry.segment
    }
  }

  return weighted[weighted.length - 1]?.segment ?? null
}

export function clampWheelTextScale(value: number) {
  if (!Number.isFinite(value)) {
    return DEFAULT_WHEEL_TEXT_SCALE
  }

  return Math.min(Math.max(Math.round(value * 100) / 100, MIN_WHEEL_TEXT_SCALE), MAX_WHEEL_TEXT_SCALE)
}

export function buildWheelSpinSummary(segment: WheelSegment) {
  return segment.outcomeType === 'time'
    ? segment.outcome
    : `This result requires moderation flow for a ${segment.timeoutSeconds ?? 0}s timeout targeting ${segment.timeoutTarget ?? 'self'}.`
}
