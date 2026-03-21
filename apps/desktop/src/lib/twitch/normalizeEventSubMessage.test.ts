import { describe, expect, it } from 'vitest'
import { normalizeEventSubMessage } from './normalizeEventSubMessage'

describe('normalizeEventSubMessage', () => {
  it('parses add commands with unit durations from chat messages', () => {
    const result = normalizeEventSubMessage({
      metadata: {
        message_id: 'msg-1',
        message_type: 'notification',
        message_timestamp: '2026-03-21T00:00:00Z',
        subscription_type: 'channel.chat.message',
      },
      payload: {
        event: {
          chatter_user_id: '1',
          chatter_user_login: 'mod_user',
          chatter_user_name: 'Mod User',
          broadcaster_user_id: '99',
          message: {
            text: '!timer add 1h 2m 3s',
          },
          badges: [
            { set_id: 'moderator' },
          ],
        },
      },
    })

    expect(result?.eventType).toBe('chat_command')
    expect(result?.command?.action).toBe('add')
    expect(result?.command?.seconds).toBe(3723)
    expect(result?.command?.isModerator).toBe(true)
    expect(result?.command?.isBroadcaster).toBe(false)
  })

  it('parses set commands with hh:mm:ss durations', () => {
    const result = normalizeEventSubMessage({
      metadata: {
        message_id: 'msg-2',
        message_type: 'notification',
        message_timestamp: '2026-03-21T00:00:00Z',
        subscription_type: 'channel.chat.message',
      },
      payload: {
        event: {
          chatter_user_id: '99',
          chatter_user_login: 'streamer',
          chatter_user_name: 'Streamer',
          broadcaster_user_id: '99',
          message: {
            text: '!timer set 01:02:03',
          },
          badges: [
            { set_id: 'broadcaster' },
          ],
        },
      },
    })

    expect(result?.command?.action).toBe('set')
    expect(result?.command?.seconds).toBe(3723)
    expect(result?.command?.isBroadcaster).toBe(true)
  })

  it('rejects invalid timer commands', () => {
    const result = normalizeEventSubMessage({
      metadata: {
        message_id: 'msg-3',
        message_type: 'notification',
        message_timestamp: '2026-03-21T00:00:00Z',
        subscription_type: 'channel.chat.message',
      },
      payload: {
        event: {
          chatter_user_id: '1',
          chatter_user_login: 'viewer',
          chatter_user_name: 'Viewer',
          broadcaster_user_id: '99',
          message: {
            text: '!timer add nope',
          },
          badges: [],
        },
      },
    })

    expect(result).toBeNull()
  })

  it('normalizes gifted sub notifications into gift bomb events', () => {
    const result = normalizeEventSubMessage({
      metadata: {
        message_id: 'msg-4',
        message_type: 'notification',
        message_timestamp: '2026-03-21T00:00:00Z',
        subscription_type: 'channel.subscription.gift',
      },
      payload: {
        event: {
          user_id: '5',
          user_login: 'gifter',
          user_name: 'Gifter',
          tier: '1000',
          total: 5,
        },
      },
    })

    expect(result?.eventType).toBe('gift_bomb')
    expect(result?.count).toBe(5)
    expect(result?.displayName).toBe('Gifter')
  })
})
