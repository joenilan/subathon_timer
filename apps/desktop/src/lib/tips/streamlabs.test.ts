import { describe, expect, it } from 'vitest'
import { normalizeStreamlabsSocketEvent, summarizeStreamlabsTip } from './streamlabs'

describe('Streamlabs tip helpers', () => {
  it('normalizes donation socket payloads', () => {
    const events = normalizeStreamlabsSocketEvent({
      type: 'donation',
      for: 'streamlabs',
      event_id: 'evt-100',
      message: [
        {
          donation_id: '96164121',
          name: 'test',
          amount: '13.37',
          currency: 'USD',
          created_at: '2026-04-02T10:00:00Z',
        },
      ],
    })

    expect(events).toHaveLength(1)
    expect(events[0]?.source).toBe('streamlabs')
    expect(events[0]?.eventType).toBe('tip')
    expect(events[0]?.displayName).toBe('test')
    expect(events[0]?.amount).toBe(13.37)
    expect(events[0]?.currency).toBe('USD')
    expect(events[0]?.id).toBe('96164121')
  })

  it('ignores unrelated or invalid socket events', () => {
    expect(
      normalizeStreamlabsSocketEvent({
        type: 'follow',
        for: 'streamlabs',
        message: [],
      }),
    ).toHaveLength(0)

    expect(
      normalizeStreamlabsSocketEvent({
        type: 'donation',
        for: 'merch',
        message: [],
      }),
    ).toHaveLength(0)

    expect(
      normalizeStreamlabsSocketEvent({
        type: 'donation',
        message: [{ amount: 0 }],
      }),
    ).toHaveLength(0)
  })

  it('formats the tip summary with a currency symbol when possible', () => {
    const summary = summarizeStreamlabsTip({
      id: 'tip-1',
      source: 'streamlabs',
      eventType: 'tip',
      occurredAt: '2026-04-02T10:00:00Z',
      userId: null,
      userLogin: 'test',
      displayName: 'test',
      anonymous: false,
      amount: 13.37,
      currency: 'USD',
      tier: null,
      count: null,
      command: null,
      rawPayload: {},
    })

    expect(summary.detail).toContain('$13.37')
  })
})
