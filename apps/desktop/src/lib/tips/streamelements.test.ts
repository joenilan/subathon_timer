import { describe, expect, it } from 'vitest'
import {
  buildStreamElementsSubscribeMessages,
  normalizeStreamElementsTipMessage,
  parseStreamElementsSocketEnvelope,
} from './streamelements'

describe('StreamElements tip helpers', () => {
  it('builds both channel.tips and channel.activities subscription payloads', () => {
    const payloads = buildStreamElementsSubscribeMessages({
      token: 'secret-token',
      tokenType: 'apikey',
    }).map((entry) =>
      JSON.parse(entry) as {
        type: string
        data: { topic: string; token: string; token_type: string }
      },
    )

    expect(payloads).toHaveLength(2)
    expect(payloads.map((entry) => entry.data.topic)).toEqual(['channel.tips', 'channel.activities'])
    expect(payloads[0]?.type).toBe('subscribe')
    expect(payloads[0]?.data.token).toBe('secret-token')
    expect(payloads[0]?.data.token_type).toBe('apikey')
  })

  it('normalizes a successful StreamElements tip message', () => {
    const envelope = parseStreamElementsSocketEnvelope(JSON.stringify({
      id: 'tip-evt-1',
      ts: '2025-02-19T15:07:17Z',
      type: 'message',
      topic: 'channel.tips',
      data: {
        donation: {
          user: {
            username: 'Styler',
          },
          amount: 4.2,
          currency: 'USD',
        },
        status: 'success',
        transactionId: 'txn-1',
      },
    }))

    const event = normalizeStreamElementsTipMessage(envelope)

    expect(event?.source).toBe('streamelements')
    expect(event?.eventType).toBe('tip')
    expect(event?.displayName).toBe('Styler')
    expect(event?.amount).toBe(4.2)
    expect(event?.currency).toBe('USD')
  })

  it('normalizes a tip from channel.activities', () => {
    const envelope = parseStreamElementsSocketEnvelope(
      JSON.stringify({
        id: 'activity-tip-1',
        ts: '2026-04-02T15:07:17Z',
        type: 'message',
        topic: 'channel.activities',
        data: {
          type: 'tip',
          provider: 'StreamElements',
          _id: 'activity-1',
          activityId: 'activity-1',
          createdAt: '2026-04-02T15:07:09.302Z',
          data: {
            username: 'Styler',
            displayName: 'Styler',
            providerId: 'user-1',
            amount: '5.50',
            currency: 'USD',
          },
        },
      }),
    )

    const event = normalizeStreamElementsTipMessage(envelope)

    expect(event?.source).toBe('streamelements')
    expect(event?.eventType).toBe('tip')
    expect(event?.displayName).toBe('Styler')
    expect(event?.amount).toBe(5.5)
    expect(event?.currency).toBe('USD')
    expect(event?.id).toBe('activity-tip-1')
  })

  it('ignores non-tip channel.activities events', () => {
    const envelope = parseStreamElementsSocketEnvelope(
      JSON.stringify({
        id: 'activity-follow-1',
        ts: '2026-04-02T15:07:17Z',
        type: 'message',
        topic: 'channel.activities',
        data: {
          type: 'follow',
          activityId: 'activity-follow-1',
          createdAt: '2026-04-02T15:07:09.302Z',
          data: {
            username: 'Styler',
          },
        },
      }),
    )

    expect(normalizeStreamElementsTipMessage(envelope)).toBeNull()
  })
})
