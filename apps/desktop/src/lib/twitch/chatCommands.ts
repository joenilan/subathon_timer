import { formatDurationClock, formatSignedDuration } from '../timer/engine'
import type { ChatTimerCommand, ChatTimerCommandAction, TimerCommandPermissionConfig } from '../timer/types'
import {
  appendTimerEvent,
  clampTimer,
  deriveTimerDecorations,
  resolveRuntimeFromSession,
  resolveTimerStatus,
  type LastTwitchActor,
  type TimerSessionState,
} from '../timer/runtime'
import type { NativeTimerEventEntry } from '../platform/nativeAppState'
import { DEFAULT_TIMER_COMMAND_PERMISSIONS } from './timerCommandPermissions'

export interface ChatCommandStateInput extends TimerSessionState {
  defaultTimerSeconds: number
  commandPermissions: TimerCommandPermissionConfig
  timerEvents: NativeTimerEventEntry[]
}

export interface ChatCommandMutation {
  processedEventIds: string[]
  timerStatus: ChatCommandStateInput['timerStatus']
  timerRemainingSeconds: number
  uptimeSeconds: number
  timerSessionBaseRemainingSeconds: number
  timerSessionBaseUptimeSeconds: number
  timerSessionRunningSince: number | null
  timerEvents: NativeTimerEventEntry[]
  lastAppliedDeltaSeconds: number
  trendPoints: number[]
  activity: ReturnType<typeof deriveTimerDecorations>['activity']
  lastTwitchActor: LastTwitchActor
}

export type ChatCommandResult =
  | { kind: 'ignored'; processedEventIds: string[] }
  | { kind: 'help'; processedEventIds: string[]; lastTwitchActor: LastTwitchActor }
  | { kind: 'applied'; mutation: ChatCommandMutation }

export function getCommandPermission(
  permissions: TimerCommandPermissionConfig,
  action: ChatTimerCommandAction,
) {
  return permissions[action] ?? DEFAULT_TIMER_COMMAND_PERMISSIONS[action]
}

export function getChatCommandActorLabel(input: {
  displayName: string | null
  userLogin: string | null
}) {
  return input.displayName ?? input.userLogin ?? 'A moderator'
}

export function buildChatCommandSummary(
  actorLabel: string,
  command: ChatTimerCommand,
  options?: {
    deltaSeconds?: number
    nextRemaining?: number
  },
) {
  switch (command.action) {
    case 'add':
    case 'remove':
      return `${actorLabel} used ${command.rawText} (${formatSignedDuration(options?.deltaSeconds ?? 0)}).`
    case 'set':
      return `${actorLabel} used ${command.rawText} and set the timer to ${formatDurationClock(options?.nextRemaining ?? 0)}.`
    case 'pause':
      return `${actorLabel} used ${command.rawText} and paused the timer.`
    case 'resume':
      return `${actorLabel} used ${command.rawText} and resumed the timer.`
    case 'start':
      return `${actorLabel} used ${command.rawText} and started the timer.`
    case 'reset':
      return `${actorLabel} used ${command.rawText} and reset the timer to ${formatDurationClock(options?.nextRemaining ?? 0)}.`
    default:
      return `${actorLabel} used ${command.rawText}.`
  }
}

export function applyChatTimerCommand(input: {
  state: ChatCommandStateInput
  event: {
    id: string
    userId: string | null
    userLogin: string | null
    displayName: string | null
    command: ChatTimerCommand
  }
  processedEventIds: string[]
  now: number
}): ChatCommandResult {
  const { state, event, processedEventIds, now } = input
  const runtime = resolveRuntimeFromSession(state, now)
  const actorLabel = getChatCommandActorLabel(event)
  const lastTwitchActor = {
    userId: event.userId,
    userLogin: event.userLogin,
    displayName: event.displayName,
  } satisfies LastTwitchActor
  const command = event.command

  if (command.action === 'help') {
    return {
      kind: 'help',
      processedEventIds,
      lastTwitchActor,
    }
  }

  if (command.action === 'add' || command.action === 'remove') {
    const magnitude = Math.max(0, command.seconds ?? 0)
    if (magnitude <= 0) {
      return { kind: 'ignored', processedEventIds }
    }

    const deltaSeconds = command.action === 'remove' ? -magnitude : magnitude
    const nextRemaining = clampTimer(runtime.timerRemainingSeconds + deltaSeconds)
    const nextStatus = resolveTimerStatus(runtime.timerStatus, nextRemaining)
    const nextEvent = {
      id: event.id,
      title: 'Moderator command applied',
      summary: buildChatCommandSummary(actorLabel, command, { deltaSeconds }),
      deltaSeconds,
      occurredAt: now,
      source: 'twitch-eventsub',
      remainingSeconds: nextRemaining,
    } satisfies NativeTimerEventEntry
    const nextEvents = appendTimerEvent(state.timerEvents, nextEvent)
    const derived = deriveTimerDecorations(state.defaultTimerSeconds, nextEvents, nextRemaining)

    return {
      kind: 'applied',
      mutation: {
        processedEventIds,
        timerStatus: nextStatus,
        timerRemainingSeconds: nextRemaining,
        uptimeSeconds: runtime.uptimeSeconds,
        timerSessionBaseRemainingSeconds: nextRemaining,
        timerSessionBaseUptimeSeconds: runtime.uptimeSeconds,
        timerSessionRunningSince: nextStatus === 'running' ? now : null,
        timerEvents: nextEvents,
        lastAppliedDeltaSeconds: deltaSeconds,
        trendPoints: derived.trendPoints,
        activity: derived.activity,
        lastTwitchActor,
      },
    }
  }

  if (command.action === 'set') {
    const nextRemaining = clampTimer(command.seconds ?? runtime.timerRemainingSeconds)
    if (nextRemaining === runtime.timerRemainingSeconds) {
      return { kind: 'ignored', processedEventIds }
    }

    const deltaSeconds = nextRemaining - runtime.timerRemainingSeconds
    const nextStatus = resolveTimerStatus(runtime.timerStatus, nextRemaining)
    const nextEvent = {
      id: event.id,
      title: 'Moderator command applied',
      summary: buildChatCommandSummary(actorLabel, command, { nextRemaining }),
      deltaSeconds,
      occurredAt: now,
      source: 'twitch-eventsub',
      remainingSeconds: nextRemaining,
    } satisfies NativeTimerEventEntry
    const nextEvents = appendTimerEvent(state.timerEvents, nextEvent)
    const derived = deriveTimerDecorations(state.defaultTimerSeconds, nextEvents, nextRemaining)

    return {
      kind: 'applied',
      mutation: {
        processedEventIds,
        timerStatus: nextStatus,
        timerRemainingSeconds: nextRemaining,
        uptimeSeconds: runtime.uptimeSeconds,
        timerSessionBaseRemainingSeconds: nextRemaining,
        timerSessionBaseUptimeSeconds: runtime.uptimeSeconds,
        timerSessionRunningSince: nextStatus === 'running' ? now : null,
        timerEvents: nextEvents,
        lastAppliedDeltaSeconds: deltaSeconds,
        trendPoints: derived.trendPoints,
        activity: derived.activity,
        lastTwitchActor,
      },
    }
  }

  if (command.action === 'pause') {
    if (runtime.timerStatus !== 'running') {
      return { kind: 'ignored', processedEventIds }
    }

    const nextEvent = {
      id: event.id,
      title: 'Moderator command applied',
      summary: buildChatCommandSummary(actorLabel, command),
      deltaSeconds: 0,
      occurredAt: now,
      source: 'twitch-eventsub',
      remainingSeconds: runtime.timerRemainingSeconds,
    } satisfies NativeTimerEventEntry
    const nextEvents = appendTimerEvent(state.timerEvents, nextEvent)
    const derived = deriveTimerDecorations(state.defaultTimerSeconds, nextEvents, runtime.timerRemainingSeconds)

    return {
      kind: 'applied',
      mutation: {
        processedEventIds,
        timerStatus: 'paused',
        timerRemainingSeconds: runtime.timerRemainingSeconds,
        uptimeSeconds: runtime.uptimeSeconds,
        timerSessionBaseRemainingSeconds: runtime.timerRemainingSeconds,
        timerSessionBaseUptimeSeconds: runtime.uptimeSeconds,
        timerSessionRunningSince: null,
        timerEvents: nextEvents,
        lastAppliedDeltaSeconds: 0,
        trendPoints: derived.trendPoints,
        activity: derived.activity,
        lastTwitchActor,
      },
    }
  }

  if (command.action === 'resume' || command.action === 'start') {
    if (runtime.timerStatus === 'running' || runtime.timerRemainingSeconds <= 0) {
      return { kind: 'ignored', processedEventIds }
    }

    const nextEvent = {
      id: event.id,
      title: 'Moderator command applied',
      summary: buildChatCommandSummary(actorLabel, command),
      deltaSeconds: 0,
      occurredAt: now,
      source: 'twitch-eventsub',
      remainingSeconds: runtime.timerRemainingSeconds,
    } satisfies NativeTimerEventEntry
    const nextEvents = appendTimerEvent(state.timerEvents, nextEvent)
    const derived = deriveTimerDecorations(state.defaultTimerSeconds, nextEvents, runtime.timerRemainingSeconds)

    return {
      kind: 'applied',
      mutation: {
        processedEventIds,
        timerStatus: 'running',
        timerRemainingSeconds: runtime.timerRemainingSeconds,
        uptimeSeconds: runtime.uptimeSeconds,
        timerSessionBaseRemainingSeconds: runtime.timerRemainingSeconds,
        timerSessionBaseUptimeSeconds: runtime.uptimeSeconds,
        timerSessionRunningSince: now,
        timerEvents: nextEvents,
        lastAppliedDeltaSeconds: 0,
        trendPoints: derived.trendPoints,
        activity: derived.activity,
        lastTwitchActor,
      },
    }
  }

  if (command.action === 'reset') {
    const nextRemaining = state.defaultTimerSeconds
    const deltaSeconds = nextRemaining - runtime.timerRemainingSeconds
    const nextEvent = {
      id: event.id,
      title: 'Moderator command applied',
      summary: buildChatCommandSummary(actorLabel, command, { nextRemaining }),
      deltaSeconds,
      occurredAt: now,
      source: 'twitch-eventsub',
      remainingSeconds: nextRemaining,
    } satisfies NativeTimerEventEntry
    const nextEvents = [nextEvent]
    const derived = deriveTimerDecorations(state.defaultTimerSeconds, nextEvents, nextRemaining)

    return {
      kind: 'applied',
      mutation: {
        processedEventIds,
        timerStatus: 'paused',
        timerRemainingSeconds: nextRemaining,
        uptimeSeconds: 0,
        timerSessionBaseRemainingSeconds: nextRemaining,
        timerSessionBaseUptimeSeconds: 0,
        timerSessionRunningSince: null,
        timerEvents: nextEvents,
        lastAppliedDeltaSeconds: deltaSeconds,
        trendPoints: derived.trendPoints,
        activity: derived.activity,
        lastTwitchActor,
      },
    }
  }

  return { kind: 'ignored', processedEventIds }
}
