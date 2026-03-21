import { describe, expect, it } from 'vitest'
import {
  allowsChatTimerCommand,
  normalizeTimerCommandPermissionConfig,
} from './timerCommandPermissions'

describe('normalizeTimerCommandPermissionConfig', () => {
  it('falls back to safe defaults for invalid entries', () => {
    const config = normalizeTimerCommandPermissionConfig({
      add: 'streamer',
      remove: 'invalid' as never,
    })

    expect(config.add).toBe('streamer')
    expect(config.remove).toBe('both')
    expect(config.set).toBe('streamer')
  })
})

describe('allowsChatTimerCommand', () => {
  const baseCommand = {
    action: 'add' as const,
    rawText: '!timer add 60',
    seconds: 60,
  }

  it('allows only the broadcaster for streamer-only commands', () => {
    expect(
      allowsChatTimerCommand(
        {
          ...baseCommand,
          isBroadcaster: true,
          isModerator: true,
        },
        'streamer',
      ),
    ).toBe(true)

    expect(
      allowsChatTimerCommand(
        {
          ...baseCommand,
          isBroadcaster: false,
          isModerator: true,
        },
        'streamer',
      ),
    ).toBe(false)
  })

  it('allows moderators but excludes the broadcaster for mod-only commands', () => {
    expect(
      allowsChatTimerCommand(
        {
          ...baseCommand,
          isBroadcaster: false,
          isModerator: true,
        },
        'mod',
      ),
    ).toBe(true)

    expect(
      allowsChatTimerCommand(
        {
          ...baseCommand,
          isBroadcaster: true,
          isModerator: true,
        },
        'mod',
      ),
    ).toBe(false)
  })
})
