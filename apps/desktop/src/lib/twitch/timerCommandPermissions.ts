import type {
  ChatTimerCommand,
  ChatTimerCommandAction,
  TimerCommandPermission,
  TimerCommandPermissionConfig,
} from '../timer/types'

export interface TimerCommandPermissionDefinition {
  action: ChatTimerCommandAction
  commandLabel: string
  description: string
}

export const TIMER_COMMAND_PERMISSION_OPTIONS: Array<{
  value: TimerCommandPermission
  label: string
}> = [
  { value: 'streamer', label: 'Streamer only' },
  { value: 'mod', label: 'Mods only' },
  { value: 'both', label: 'Streamer + Mods' },
]

export const TIMER_COMMAND_PERMISSION_DEFINITIONS: TimerCommandPermissionDefinition[] = [
  {
    action: 'add',
    commandLabel: '!timer add',
    description: 'Adds time from chat using seconds, mm:ss, or hh:mm:ss.',
  },
  {
    action: 'remove',
    commandLabel: '!timer remove',
    description: 'Removes time from chat using seconds, mm:ss, or hh:mm:ss.',
  },
  {
    action: 'pause',
    commandLabel: '!timer pause',
    description: 'Pauses the live timer without changing the remaining time.',
  },
  {
    action: 'resume',
    commandLabel: '!timer resume',
    description: 'Resumes a paused timer from its current remaining time.',
  },
  {
    action: 'start',
    commandLabel: '!timer start',
    description: 'Starts the timer if it has not been started yet.',
  },
  {
    action: 'set',
    commandLabel: '!timer set',
    description: 'Sets the timer to an exact value. Usually best locked down.',
  },
  {
    action: 'reset',
    commandLabel: '!timer reset',
    description: 'Resets the timer to the default start value. Usually best locked down.',
  },
  {
    action: 'help',
    commandLabel: '!timer help',
    description: 'Replies in chat with the supported timer command list.',
  },
]

export const DEFAULT_TIMER_COMMAND_PERMISSIONS: TimerCommandPermissionConfig = {
  add: 'both',
  remove: 'both',
  pause: 'both',
  resume: 'both',
  start: 'both',
  set: 'streamer',
  reset: 'streamer',
  help: 'both',
}

export function normalizeTimerCommandPermissionConfig(
  value: Partial<TimerCommandPermissionConfig> | null | undefined,
): TimerCommandPermissionConfig {
  return {
    add: normalizeTimerCommandPermission(value?.add, DEFAULT_TIMER_COMMAND_PERMISSIONS.add),
    remove: normalizeTimerCommandPermission(value?.remove, DEFAULT_TIMER_COMMAND_PERMISSIONS.remove),
    pause: normalizeTimerCommandPermission(value?.pause, DEFAULT_TIMER_COMMAND_PERMISSIONS.pause),
    resume: normalizeTimerCommandPermission(value?.resume, DEFAULT_TIMER_COMMAND_PERMISSIONS.resume),
    start: normalizeTimerCommandPermission(value?.start, DEFAULT_TIMER_COMMAND_PERMISSIONS.start),
    set: normalizeTimerCommandPermission(value?.set, DEFAULT_TIMER_COMMAND_PERMISSIONS.set),
    reset: normalizeTimerCommandPermission(value?.reset, DEFAULT_TIMER_COMMAND_PERMISSIONS.reset),
    help: normalizeTimerCommandPermission(value?.help, DEFAULT_TIMER_COMMAND_PERMISSIONS.help),
  }
}

export function allowsChatTimerCommand(
  command: ChatTimerCommand,
  permission: TimerCommandPermission,
) {
  if (permission === 'streamer') {
    return command.isBroadcaster
  }

  if (permission === 'mod') {
    return command.isModerator && !command.isBroadcaster
  }

  return command.isBroadcaster || command.isModerator
}

function normalizeTimerCommandPermission(
  value: TimerCommandPermission | null | undefined,
  fallback: TimerCommandPermission,
) {
  return value === 'streamer' || value === 'mod' || value === 'both' ? value : fallback
}
