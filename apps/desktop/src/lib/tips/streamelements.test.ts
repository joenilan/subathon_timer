import { describe, expect, it } from 'vitest'
import {
  buildStreamElementsSubscribeMessage,
  normalizeStreamElementsTipMessage,
  parseStreamElementsSocketEnvelope,
} from './streamelements'

describe('StreamElements tip helpers', () => {
  it('builds a channel.tips subscription payload', () => {
    const payload = JSON.parse(
      buildStreamElementsSubscribeMessage({
        token: 'secret-token',
        tokenType: 'apikey',
      }),
    ) as {
      type: string
      data: { topic: string; token: string; token_type: string }
    }

    expect(payload.type).toBe('subscribe')
    expect(payload.data.topic).toBe('channel.tips')
    expect(payload.data.token).toBe('secret-token')
    expect(payload.data.token_type).toBe('apikey')
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
})
