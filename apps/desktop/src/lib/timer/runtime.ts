import type { NativeAppSnapshot, NativeTimerEventEntry } from '../platform/nativeAppState'

export type TimerStatus = 'idle' | 'running' | 'paused' | 'finished'

export interface TimerActivityEntry {
  id: string
  title: string
  summary: string
  deltaSeconds: number
  occurredAt: number
  source: 'twitch-eventsub' | 'manual'
}

export interface LastTwitchActor {
  userId: string | null
  userLogin: string | null
  displayName: string | null
}

export interface TimerRuntimeSnapshot {
  timerStatus: TimerStatus
  timerRemainingSeconds: number
  uptimeSeconds: number
  timerSessionBaseRemainingSeconds: number
  timerSessionBaseUptimeSeconds: number
  timerSessionRunningSince: number | null
}

export interface TimerSessionState {
  timerStatus: TimerStatus
  timerSessionBaseRemainingSeconds: number
  timerSessionBaseUptimeSeconds: number
  timerSessionRunningSince: number | null
}

export interface TimerDecorations {
  lastAppliedDeltaSeconds: number
  trendPoints: number[]
  activity: TimerActivityEntry[]
}

export const MAX_ACTIVITY = 12
export const MAX_TREND_POINTS = 40
export const MAX_TIMER_EVENTS = 80

export function clampTimer(value: number) {
  return Math.max(0, Math.round(value))
}

export function normalizeTimerEventHistory(events: NativeAppSnapshot['timerSession']['events'] | undefined) {
  if (!Array.isArray(events) || events.length === 0) {
    return [] as NativeTimerEventEntry[]
  }

  return events
    .filter((entry) => entry && typeof entry.id === 'string')
    .slice(0, MAX_TIMER_EVENTS)
    .map((entry) => ({
      id: entry.id,
      title: entry.title,
      summary: entry.summary,
      deltaSeconds: Math.round(entry.deltaSeconds),
      occurredAt: Math.round(entry.occurredAt),
      source: entry.source,
      remainingSeconds: clampTimer(entry.remainingSeconds),
    }))
}

export function buildActivityFromEvents(events: NativeTimerEventEntry[]) {
  return events.slice(0, MAX_ACTIVITY).map((entry) => ({
    id: entry.id,
    title: entry.title,
    summary: entry.summary,
    deltaSeconds: entry.deltaSeconds,
    occurredAt: entry.occurredAt,
    source: entry.source,
  })) satisfies TimerActivityEntry[]
}

export function buildTrendPoints(defaultTimerSeconds: number, events: NativeTimerEventEntry[], currentRemaining: number) {
  const points = [clampTimer(defaultTimerSeconds), ...events.slice().reverse().map((entry) => clampTimer(entry.remainingSeconds))]
  const nextRemaining = clampTimer(currentRemaining)

  if (points.length === 0) {
    return [nextRemaining]
  }

  if (points[points.length - 1] !== nextRemaining) {
    points.push(nextRemaining)
  }

  return points.slice(-MAX_TREND_POINTS)
}

export function appendTimerEvent(events: NativeTimerEventEntry[], entry: NativeTimerEventEntry) {
  return [entry, ...events].slice(0, MAX_TIMER_EVENTS)
}

export function deriveTimerDecorations(
  defaultTimerSeconds: number,
  events: NativeTimerEventEntry[],
  currentRemaining: number,
) {
  return {
    lastAppliedDeltaSeconds: events.find((entry) => entry.deltaSeconds !== 0)?.deltaSeconds ?? 0,
    trendPoints: buildTrendPoints(defaultTimerSeconds, events, currentRemaining),
    activity: buildActivityFromEvents(events),
  } satisfies TimerDecorations
}

export function resolveTimerStatus(currentStatus: TimerStatus, nextRemaining: number) {
  if (nextRemaining <= 0) {
    return 'finished' satisfies TimerStatus
  }

  return currentStatus === 'finished' ? 'paused' : currentStatus
}

export function hydrateTimerSessionFromSnapshot(
  snapshot: NativeAppSnapshot,
  now: number,
): TimerRuntimeSnapshot {
  const persistedRemainingSeconds = clampTimer(snapshot.timerSession.baseRemainingSeconds)
  const persistedUptimeSeconds = clampTimer(snapshot.timerSession.baseUptimeSeconds)
  const persistedRunningSince =
    typeof snapshot.timerSession.runningSince === 'number' ? Math.round(snapshot.timerSession.runningSince) : null
  const persistedStatus = snapshot.timerSession.timerStatus

  if (persistedStatus !== 'running' || persistedRunningSince === null) {
    return {
      timerStatus: resolveTimerStatus(persistedStatus as TimerStatus, persistedRemainingSeconds),
      timerRemainingSeconds: persistedRemainingSeconds,
      uptimeSeconds: persistedUptimeSeconds,
      timerSessionBaseRemainingSeconds: persistedRemainingSeconds,
      timerSessionBaseUptimeSeconds: persistedUptimeSeconds,
      timerSessionRunningSince: null,
    }
  }

  const elapsedSeconds = Math.max(0, Math.floor((now - persistedRunningSince) / 1000))
  const nextRemainingSeconds = clampTimer(persistedRemainingSeconds - elapsedSeconds)
  const nextStatus: TimerStatus = nextRemainingSeconds <= 0 ? 'finished' : 'running'
  const nextUptimeSeconds = persistedUptimeSeconds + elapsedSeconds

  return {
    timerStatus: nextStatus,
    timerRemainingSeconds: nextRemainingSeconds,
    uptimeSeconds: nextUptimeSeconds,
    timerSessionBaseRemainingSeconds: nextStatus === 'running' ? persistedRemainingSeconds : nextRemainingSeconds,
    timerSessionBaseUptimeSeconds: nextStatus === 'running' ? persistedUptimeSeconds : nextUptimeSeconds,
    timerSessionRunningSince: nextStatus === 'running' ? persistedRunningSince : null,
  }
}

export function resolveRuntimeFromSession(
  state: TimerSessionState,
  now: number,
): TimerRuntimeSnapshot {
  if (state.timerStatus !== 'running' || state.timerSessionRunningSince === null) {
    const timerRemainingSeconds = clampTimer(state.timerSessionBaseRemainingSeconds)
    const uptimeSeconds = clampTimer(state.timerSessionBaseUptimeSeconds)

    return {
      timerStatus: resolveTimerStatus(state.timerStatus, timerRemainingSeconds),
      timerRemainingSeconds,
      uptimeSeconds,
      timerSessionBaseRemainingSeconds: timerRemainingSeconds,
      timerSessionBaseUptimeSeconds: uptimeSeconds,
      timerSessionRunningSince: null,
    }
  }

  const elapsedSeconds = Math.max(0, Math.floor((now - state.timerSessionRunningSince) / 1000))
  const timerRemainingSeconds = clampTimer(state.timerSessionBaseRemainingSeconds - elapsedSeconds)
  const uptimeSeconds = clampTimer(state.timerSessionBaseUptimeSeconds + elapsedSeconds)
  const timerStatus: TimerStatus = timerRemainingSeconds <= 0 ? 'finished' : 'running'

  return {
    timerStatus,
    timerRemainingSeconds,
    uptimeSeconds,
    timerSessionBaseRemainingSeconds: timerStatus === 'running' ? state.timerSessionBaseRemainingSeconds : timerRemainingSeconds,
    timerSessionBaseUptimeSeconds: timerStatus === 'running' ? state.timerSessionBaseUptimeSeconds : uptimeSeconds,
    timerSessionRunningSince: timerStatus === 'running' ? state.timerSessionRunningSince : null,
  }
}
