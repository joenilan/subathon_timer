import { describe, expect, it } from 'vitest'
import { getNewStreamlabsDonationEvents, normalizeStreamlabsDonations } from './streamlabs'

describe('Streamlabs tip helpers', () => {
  it('normalizes donation polling payloads', () => {
    const events = normalizeStreamlabsDonations([
      {
        donationId: '96164121',
        displayName: 'test',
        amount: 13.37,
        currency: 'USD',
        occurredAt: '2026-04-02T10:00:00Z',
        rawPayload: { donation_id: '96164121' },
      },
    ])

    expect(events).toHaveLength(1)
    expect(events[0]?.source).toBe('streamlabs')
    expect(events[0]?.eventType).toBe('tip')
    expect(events[0]?.displayName).toBe('test')
    expect(events[0]?.amount).toBe(13.37)
    expect(events[0]?.currency).toBe('USD')
  })

  it('returns only donations newer than the last seen id', () => {
    const events = getNewStreamlabsDonationEvents(
      [
        {
          donationId: '103',
          displayName: 'Latest',
          amount: 10,
          currency: 'USD',
          occurredAt: '2026-04-02T10:03:00Z',
          rawPayload: { donation_id: '103' },
        },
        {
          donationId: '102',
          displayName: 'Newer',
          amount: 5,
          currency: 'USD',
          occurredAt: '2026-04-02T10:02:00Z',
          rawPayload: { donation_id: '102' },
        },
        {
          donationId: '101',
          displayName: 'Seen',
          amount: 1,
          currency: 'USD',
          occurredAt: '2026-04-02T10:01:00Z',
          rawPayload: { donation_id: '101' },
        },
      ],
      '101',
    )

    expect(events).toHaveLength(2)
    expect(events[0]?.id).toBe('102')
    expect(events[1]?.id).toBe('103')
  })
})
