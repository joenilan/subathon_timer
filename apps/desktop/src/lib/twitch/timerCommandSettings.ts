import type { ChatTimerCommandAction, TimerCommandPermission, TimerCommandPermissionConfig } from '../timer/types'

export const TIMER_COMMAND_PERMISSION_LABELS: Record<TimerCommandPermission, string> = {
  streamer: 'Streamer only',
  mod: 'Mods only',
  both: 'Streamer + Mods',
}

export const DEFAULT_TIMER_COMMAND_PERMISSIONS: TimerCommandPermissionConfig = {
  add: 'both',
  remove: 'both',
  pause: 'both',
  resume: 'both',
  start: 'both',
  reset: 'streamer',
  set: 'streamer',
  help: 'both',
}

export const TIMER_COMMAND_SETTINGS: Array<{
  action: ChatTimerCommandAction
  label: string
  hint: string
}> = [
  {
    action: 'add',
    label: '!timer add',
    hint: 'Add time from chat without opening the app.',
  },
  {
    action: 'remove',
    label: '!timer remove',
    hint: 'Remove time from chat.',
  },
  {
    action: 'set',
    label: '!timer set',
    hint: 'Set the timer to an exact duration like 01:30:00.',
  },
  {
    action: 'pause',
    label: '!timer pause',
    hint: 'Pause the running timer.',
  },
  {
    action: 'resume',
    label: '!timer resume',
    hint: 'Resume a paused timer.',
  },
  {
    action: 'start',
    label: '!timer start',
    hint: 'Start the timer if it is paused.',
  },
  {
    action: 'reset',
    label: '!timer reset',
    hint: 'Reset back to the saved default timer start.',
  },
  {
    action: 'help',
    label: '!timer help',
    hint: 'Reply in chat with the supported timer commands.',
  },
]

export function normalizeTimerCommandPermissions(
  value: Partial<Record<ChatTimerCommandAction, unknown>> | null | undefined,
): TimerCommandPermissionConfig {
  const next = { ...DEFAULT_TIMER_COMMAND_PERMISSIONS }

  if (!value) {
    return next
  }

  for (const action of Object.keys(DEFAULT_TIMER_COMMAND_PERMISSIONS) as ChatTimerCommandAction[]) {
    const candidate = value[action]
    if (candidate === 'streamer' || candidate === 'mod' || candidate === 'both') {
      next[action] = candidate
    }
  }

  return next
}
