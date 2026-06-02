import { invoke } from '@tauri-apps/api/core'
import type { TimerRuleConfig } from '../timer/types'
import type { WheelSegment } from '../wheel/types'
import type { TimerCommandPermissionConfig } from '../timer/types'
import { normalizeTimerCommandPermissionConfig } from '../twitch/timerCommandPermissions'
import type { GoalsSnapshot } from '../goals/types'

const BROWSER_NATIVE_SNAPSHOT_KEY = 'fdgt.app.native.state'
const FALLBACK_DEFAULT_TIMER_SECONDS = 6 * 60 * 60

export type NativeTimerStatus = 'idle' | 'running' | 'paused' | 'finished'

export interface NativeTimerActivityEntry {
  id: string
  title: string
  summary: string
  deltaSeconds: number
  occurredAt: number
  source: 'twitch-eventsub' | 'streamelements' | 'streamlabs' | 'manual'
}

export interface NativeTimerEventEntry extends NativeTimerActivityEntry {
  remainingSeconds: number
}

export interface NativeAppSettingsSnapshot {
  defaultTimerSeconds: number
  commandPermissions: TimerCommandPermissionConfig
  overlayLanAccessEnabled: boolean
  wheelBlacklist?: string[]
}

export interface NativeTimerSessionSnapshot {
  timerStatus: NativeTimerStatus
  baseRemainingSeconds: number
  baseUptimeSeconds: number
  runningSince: number | null
  lastAppliedDeltaSeconds: number
  events: NativeTimerEventEntry[]
}

export interface NativeAppSnapshot {
  version: 7
  settings: NativeAppSettingsSnapshot
  ruleConfig: TimerRuleConfig
  wheelSegments: WheelSegment[]
  timerSession: NativeTimerSessionSnapshot
  goals: GoalsSnapshot
}

export interface NativeAppSnapshotInput {
  defaultTimerSeconds: number
  commandPermissions: TimerCommandPermissionConfig
  overlayLanAccessEnabled: boolean
  ruleConfig: TimerRuleConfig
  wheelSegments: WheelSegment[]
  wheelBlacklist: string
  timerStatus: NativeTimerStatus
  timerSessionBaseRemainingSeconds: number
  timerSessionBaseUptimeSeconds: number
  timerSessionRunningSince: number | null
  lastAppliedDeltaSeconds: number
  timerEvents: NativeTimerEventEntry[]
  goals: GoalsSnapshot
}

interface LegacyNativeTimerSessionSnapshot {
  timerStatus: NativeTimerStatus
  timerRemainingSeconds: number
  uptimeSeconds: number
  lastTickedAt: number | null
  lastAppliedDeltaSeconds: number
  trendPoints: number[]
  activity: NativeTimerActivityEntry[]
}

interface LegacyNativeAppSettingsSnapshot extends NativeAppSettingsSnapshot {
  port?: number
  channel?: string
  admins?: string[]
  wheelBlacklist?: string[]
  useStreamlabs?: boolean
  streamlabsToken?: string
  useStreamelements?: boolean
  streamelementsToken?: string
  enableWheel?: boolean
}

interface LegacyNativeAppSnapshotV1 {
  version: 1
  settings: LegacyNativeAppSettingsSnapshot
  ruleConfig: TimerRuleConfig
  wheelSegments: WheelSegment[]
  timerSession: LegacyNativeTimerSessionSnapshot
}

interface LegacyNativeAppSnapshotV2 {
  version: 2
  settings: LegacyNativeAppSettingsSnapshot
  ruleConfig: TimerRuleConfig
  wheelSegments: WheelSegment[]
  timerSession: NativeTimerSessionSnapshot
}

interface LegacyNativeAppSnapshotV3 {
  version: 3
  settings: {
    defaultTimerSeconds: number
  }
  ruleConfig: TimerRuleConfig
  wheelSegments: WheelSegment[]
  timerSession: NativeTimerSessionSnapshot
}

interface LegacyNativeAppSnapshotV4 {
  version: 4
  settings: {
    defaultTimerSeconds: number
  }
  ruleConfig: TimerRuleConfig
  wheelSegments: WheelSegment[]
  timerSession: NativeTimerSessionSnapshot
}

interface LegacyNativeAppSnapshotV5 {
  version: 5
  settings: {
    defaultTimerSeconds: number
    commandPermissions: TimerCommandPermissionConfig
  }
  ruleConfig: TimerRuleConfig
  wheelSegments: WheelSegment[]
  timerSession: NativeTimerSessionSnapshot
}

interface LegacyNativeAppSnapshotV6 {
  version: 6
  settings: NativeAppSettingsSnapshot
  ruleConfig: TimerRuleConfig
  wheelSegments: WheelSegment[]
  timerSession: NativeTimerSessionSnapshot
}

function getEmptyGoalsSnapshot(): GoalsSnapshot {
  return {
    ladders: [],
    history: [],
    announceGoalCompletionsInChat: false,
  }
}

function isNativeRuntime() {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window
}

function parseBrowserSnapshot(raw: string | null) {
  if (!raw) {
    return null
  }

  try {
    const parsed = JSON.parse(raw) as
      | NativeAppSnapshot
      | LegacyNativeAppSnapshotV1
      | LegacyNativeAppSnapshotV2
      | LegacyNativeAppSnapshotV3
      | LegacyNativeAppSnapshotV4
      | LegacyNativeAppSnapshotV5
      | LegacyNativeAppSnapshotV6
    return normalizeLoadedSnapshot(parsed)
  } catch {
    return null
  }
}

function normalizeTimerEventHistory(events: NativeTimerEventEntry[] | undefined) {
  if (!Array.isArray(events)) {
    return []
  }

  return events
    .filter((entry) => entry && typeof entry.id === 'string')
    .map((entry) => ({
      id: entry.id,
      title: entry.title,
      summary: entry.summary,
      deltaSeconds: Math.round(entry.deltaSeconds),
      occurredAt: Math.round(entry.occurredAt),
      source: entry.source,
      remainingSeconds: Math.max(0, Math.round(entry.remainingSeconds)),
    }))
}

function normalizeDefaultTimerSeconds(
  value: number | undefined,
  options?: {
    repairLegacyOddSeconds?: boolean
  },
) {
  const nextValue = Math.max(0, Math.round(value ?? FALLBACK_DEFAULT_TIMER_SECONDS))
  if (options?.repairLegacyOddSeconds && nextValue > 0 && nextValue % 60 !== 0) {
    return FALLBACK_DEFAULT_TIMER_SECONDS
  }
  return nextValue
}

function normalizeOverlayLanAccessEnabled(value: boolean | undefined) {
  return value === true
}

function normalizeWheelBlacklist(value: string | string[] | undefined) {
  const entries = Array.isArray(value) ? value : String(value ?? '').split(',')
  return entries
    .map((entry) => entry.trim().replace(/^@/, '').toLowerCase())
    .filter((entry, index, all) => entry.length > 0 && all.indexOf(entry) === index)
}

function shouldRepairLegacySyncedDefault(
  defaultTimerSeconds: number,
  timerSession: NativeTimerSessionSnapshot,
) {
  return (
    defaultTimerSeconds !== FALLBACK_DEFAULT_TIMER_SECONDS &&
    defaultTimerSeconds % 60 !== 0 &&
    timerSession.timerStatus === 'paused' &&
    timerSession.baseRemainingSeconds === defaultTimerSeconds &&
    timerSession.baseUptimeSeconds === 0 &&
    timerSession.runningSince === null &&
    timerSession.lastAppliedDeltaSeconds === 0 &&
    timerSession.events.length === 0
  )
}

function migrateLegacyActivityToEvents(defaultTimerSeconds: number, activity: NativeTimerActivityEntry[] | undefined) {
  if (!Array.isArray(activity) || activity.length === 0) {
    return [] as NativeTimerEventEntry[]
  }

  let remainingSeconds = Math.max(0, Math.round(defaultTimerSeconds))
  const chronologicalEvents = activity
    .slice()
    .reverse()
    .filter((entry) => entry && typeof entry.id === 'string')
    .map((entry) => {
      remainingSeconds = Math.max(0, remainingSeconds + Math.round(entry.deltaSeconds))
      return {
        id: entry.id,
        title: entry.title,
        summary: entry.summary,
        deltaSeconds: Math.round(entry.deltaSeconds),
        occurredAt: Math.round(entry.occurredAt),
        source: entry.source,
        remainingSeconds,
      } satisfies NativeTimerEventEntry
    })

  return chronologicalEvents.reverse()
}

function normalizeLoadedSnapshot(
  snapshot:
    | NativeAppSnapshot
    | LegacyNativeAppSnapshotV1
    | LegacyNativeAppSnapshotV2
    | LegacyNativeAppSnapshotV3
    | LegacyNativeAppSnapshotV4
    | LegacyNativeAppSnapshotV5
    | LegacyNativeAppSnapshotV6
    | null
    | undefined,
) {
  if (!snapshot) {
    return null
  }

  if (snapshot.version === 7 || snapshot.version === 6) {
    const timerSession = {
      timerStatus: snapshot.timerSession.timerStatus,
      baseRemainingSeconds: Math.max(0, Math.round(snapshot.timerSession.baseRemainingSeconds)),
      baseUptimeSeconds: Math.max(0, Math.round(snapshot.timerSession.baseUptimeSeconds)),
      runningSince:
        typeof snapshot.timerSession.runningSince === 'number'
          ? Math.round(snapshot.timerSession.runningSince)
          : null,
      lastAppliedDeltaSeconds: Math.round(snapshot.timerSession.lastAppliedDeltaSeconds),
      events: normalizeTimerEventHistory(snapshot.timerSession.events),
    } satisfies NativeTimerSessionSnapshot
    const defaultTimerSeconds = normalizeDefaultTimerSeconds(snapshot.settings.defaultTimerSeconds)

    return {
      version: 7,
      settings: {
        defaultTimerSeconds: shouldRepairLegacySyncedDefault(defaultTimerSeconds, timerSession)
          ? FALLBACK_DEFAULT_TIMER_SECONDS
          : defaultTimerSeconds,
        commandPermissions: normalizeTimerCommandPermissionConfig(snapshot.settings.commandPermissions),
        overlayLanAccessEnabled: normalizeOverlayLanAccessEnabled(snapshot.settings.overlayLanAccessEnabled),
        wheelBlacklist: normalizeWheelBlacklist(snapshot.settings.wheelBlacklist),
      },
      ruleConfig: snapshot.ruleConfig,
      wheelSegments: snapshot.wheelSegments,
      timerSession,
      goals: snapshot.version === 7 ? snapshot.goals : getEmptyGoalsSnapshot(),
    } satisfies NativeAppSnapshot
  }

  if (snapshot.version === 3) {
    return {
      version: 7,
      settings: {
        defaultTimerSeconds: normalizeDefaultTimerSeconds(snapshot.settings.defaultTimerSeconds, {
          repairLegacyOddSeconds: true,
        }),
        commandPermissions: normalizeTimerCommandPermissionConfig(undefined),
        overlayLanAccessEnabled: false,
        wheelBlacklist: normalizeWheelBlacklist(undefined),
      },
      ruleConfig: snapshot.ruleConfig,
      wheelSegments: snapshot.wheelSegments,
      timerSession: {
        timerStatus: snapshot.timerSession.timerStatus,
        baseRemainingSeconds: Math.max(0, Math.round(snapshot.timerSession.baseRemainingSeconds)),
        baseUptimeSeconds: Math.max(0, Math.round(snapshot.timerSession.baseUptimeSeconds)),
        runningSince:
          typeof snapshot.timerSession.runningSince === 'number'
            ? Math.round(snapshot.timerSession.runningSince)
            : null,
        lastAppliedDeltaSeconds: Math.round(snapshot.timerSession.lastAppliedDeltaSeconds),
        events: normalizeTimerEventHistory(snapshot.timerSession.events),
      },
      goals: getEmptyGoalsSnapshot(),
    } satisfies NativeAppSnapshot
  }

  if (snapshot.version === 2) {
    return {
      version: 7,
      settings: {
        defaultTimerSeconds: normalizeDefaultTimerSeconds(snapshot.settings.defaultTimerSeconds, {
          repairLegacyOddSeconds: true,
        }),
        commandPermissions: normalizeTimerCommandPermissionConfig(undefined),
        overlayLanAccessEnabled: false,
        wheelBlacklist: normalizeWheelBlacklist(snapshot.settings.wheelBlacklist),
      },
      ruleConfig: snapshot.ruleConfig,
      wheelSegments: snapshot.wheelSegments,
      timerSession: {
        timerStatus: snapshot.timerSession.timerStatus,
        baseRemainingSeconds: Math.max(0, Math.round(snapshot.timerSession.baseRemainingSeconds)),
        baseUptimeSeconds: Math.max(0, Math.round(snapshot.timerSession.baseUptimeSeconds)),
        runningSince:
          typeof snapshot.timerSession.runningSince === 'number'
            ? Math.round(snapshot.timerSession.runningSince)
            : null,
        lastAppliedDeltaSeconds: Math.round(snapshot.timerSession.lastAppliedDeltaSeconds),
        events: normalizeTimerEventHistory(snapshot.timerSession.events),
      },
      goals: getEmptyGoalsSnapshot(),
    } satisfies NativeAppSnapshot
  }

  if (snapshot.version === 4) {
    return {
      version: 7,
      settings: {
        defaultTimerSeconds: normalizeDefaultTimerSeconds(snapshot.settings.defaultTimerSeconds, {
          repairLegacyOddSeconds: true,
        }),
        commandPermissions: normalizeTimerCommandPermissionConfig(undefined),
        overlayLanAccessEnabled: false,
        wheelBlacklist: normalizeWheelBlacklist(undefined),
      },
      ruleConfig: snapshot.ruleConfig,
      wheelSegments: snapshot.wheelSegments,
      timerSession: {
        timerStatus: snapshot.timerSession.timerStatus,
        baseRemainingSeconds: Math.max(0, Math.round(snapshot.timerSession.baseRemainingSeconds)),
        baseUptimeSeconds: Math.max(0, Math.round(snapshot.timerSession.baseUptimeSeconds)),
        runningSince:
          typeof snapshot.timerSession.runningSince === 'number'
            ? Math.round(snapshot.timerSession.runningSince)
            : null,
        lastAppliedDeltaSeconds: Math.round(snapshot.timerSession.lastAppliedDeltaSeconds),
        events: normalizeTimerEventHistory(snapshot.timerSession.events),
      },
      goals: getEmptyGoalsSnapshot(),
    } satisfies NativeAppSnapshot
  }

  if (snapshot.version === 5) {
    return {
      version: 7,
      settings: {
        defaultTimerSeconds: normalizeDefaultTimerSeconds(snapshot.settings.defaultTimerSeconds, {
          repairLegacyOddSeconds: true,
        }),
        commandPermissions: normalizeTimerCommandPermissionConfig(snapshot.settings.commandPermissions),
        overlayLanAccessEnabled: false,
        wheelBlacklist: normalizeWheelBlacklist(undefined),
      },
      ruleConfig: snapshot.ruleConfig,
      wheelSegments: snapshot.wheelSegments,
      timerSession: {
        timerStatus: snapshot.timerSession.timerStatus,
        baseRemainingSeconds: Math.max(0, Math.round(snapshot.timerSession.baseRemainingSeconds)),
        baseUptimeSeconds: Math.max(0, Math.round(snapshot.timerSession.baseUptimeSeconds)),
        runningSince:
          typeof snapshot.timerSession.runningSince === 'number'
            ? Math.round(snapshot.timerSession.runningSince)
            : null,
        lastAppliedDeltaSeconds: Math.round(snapshot.timerSession.lastAppliedDeltaSeconds),
        events: normalizeTimerEventHistory(snapshot.timerSession.events),
      },
      goals: getEmptyGoalsSnapshot(),
    } satisfies NativeAppSnapshot
  }

  const defaultTimerSeconds = normalizeDefaultTimerSeconds(snapshot.settings.defaultTimerSeconds, {
    repairLegacyOddSeconds: true,
  })

  return {
    version: 7,
    settings: {
      defaultTimerSeconds,
      commandPermissions: normalizeTimerCommandPermissionConfig(undefined),
      overlayLanAccessEnabled: false,
      wheelBlacklist: normalizeWheelBlacklist(snapshot.settings.wheelBlacklist),
    },
    ruleConfig: snapshot.ruleConfig,
    wheelSegments: snapshot.wheelSegments,
    timerSession: {
      timerStatus: snapshot.timerSession.timerStatus,
      baseRemainingSeconds: Math.max(0, Math.round(snapshot.timerSession.timerRemainingSeconds)),
      baseUptimeSeconds: Math.max(0, Math.round(snapshot.timerSession.uptimeSeconds)),
      runningSince:
        snapshot.timerSession.timerStatus === 'running' && typeof snapshot.timerSession.lastTickedAt === 'number'
          ? Math.round(snapshot.timerSession.lastTickedAt)
          : null,
      lastAppliedDeltaSeconds: Math.round(snapshot.timerSession.lastAppliedDeltaSeconds),
      events: migrateLegacyActivityToEvents(defaultTimerSeconds, snapshot.timerSession.activity),
    },
    goals: getEmptyGoalsSnapshot(),
  } satisfies NativeAppSnapshot
}

export async function loadNativeAppSnapshot() {
  if (!isNativeRuntime()) {
    return parseBrowserSnapshot(window.localStorage.getItem(BROWSER_NATIVE_SNAPSHOT_KEY))
  }

  const snapshot = await invoke<
    | NativeAppSnapshot
    | LegacyNativeAppSnapshotV1
      | LegacyNativeAppSnapshotV2
      | LegacyNativeAppSnapshotV3
      | LegacyNativeAppSnapshotV4
      | LegacyNativeAppSnapshotV5
      | LegacyNativeAppSnapshotV6
      | null
  >(
    'load_native_app_state',
  )
  return normalizeLoadedSnapshot(snapshot)
}

export async function saveNativeAppSnapshot(snapshot: NativeAppSnapshot) {
  if (!isNativeRuntime()) {
    window.localStorage.setItem(BROWSER_NATIVE_SNAPSHOT_KEY, JSON.stringify(snapshot))
    return
  }

  await invoke('save_native_app_state', { snapshot })
}

export function buildNativeAppSnapshot(input: NativeAppSnapshotInput): NativeAppSnapshot {
  return {
    version: 7,
    settings: {
      defaultTimerSeconds: input.defaultTimerSeconds,
      commandPermissions: normalizeTimerCommandPermissionConfig(input.commandPermissions),
      overlayLanAccessEnabled: normalizeOverlayLanAccessEnabled(input.overlayLanAccessEnabled),
      wheelBlacklist: normalizeWheelBlacklist(input.wheelBlacklist),
    },
    ruleConfig: input.ruleConfig,
    wheelSegments: input.wheelSegments,
    timerSession: {
      timerStatus: input.timerStatus,
      baseRemainingSeconds: input.timerSessionBaseRemainingSeconds,
      baseUptimeSeconds: input.timerSessionBaseUptimeSeconds,
      runningSince: input.timerSessionRunningSince,
      lastAppliedDeltaSeconds: input.lastAppliedDeltaSeconds,
      events: input.timerEvents,
    },
    goals: input.goals,
  }
}
