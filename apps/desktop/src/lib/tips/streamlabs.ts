import type { NormalizedTimerEvent } from '../timer/types'
import type { TipProviderNotification } from './types'

function asRecord(value: unknown) {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>
  }

  return null
}

function getString(record: Record<string, unknown> | null, key: string) {
  const value = record?.[key]
  return typeof value === 'string' && value.length > 0 ? value : null
}

function getNumericValue(record: Record<string, unknown> | null, key: string) {
  const value = record?.[key]

  if (typeof value === 'number' && Number.isFinite(value)) {
    return value
  }

  if (typeof value === 'string' && value.length > 0) {
    const parsed = Number.parseFloat(value)
    return Number.isFinite(parsed) ? parsed : null
  }

  return null
}

export interface StreamlabsDonationRecord {
  donationId: string
  amount: number
  currency: string | null
  displayName: string | null
  occurredAt: string
  rawPayload: Record<string, unknown>
}

export async function fetchStreamlabsDonations(accessToken: string, limit = 10) {
  const response = await fetch(`https://streamlabs.com/api/v2.0/donations?limit=${limit}`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  })

  if (!response.ok) {
    throw new Error(`Streamlabs donations request failed (${response.status}).`)
  }

  const payload = asRecord(await response.json())
  const data = Array.isArray(payload?.data) ? payload.data : []

  return data
    .map((entry) => {
      const donation = asRecord(entry)
      const donationId = getString(donation, 'donation_id') ?? getString(donation, 'id')
      const amount = getNumericValue(donation, 'amount')

      if (!donation || !donationId || amount === null || amount <= 0) {
        return null
      }

      return {
        donationId,
        amount,
        currency: getString(donation, 'currency'),
        displayName: getString(donation, 'name') ?? getString(donation, 'from'),
        occurredAt:
          getString(donation, 'created_at') ??
          getString(donation, 'createdAt') ??
          new Date().toISOString(),
        rawPayload: donation,
      } satisfies StreamlabsDonationRecord
    })
    .filter((entry): entry is StreamlabsDonationRecord => entry !== null)
}

export function normalizeStreamlabsDonations(donations: StreamlabsDonationRecord[]) {
  return donations.map((donation) => ({
    id: donation.donationId,
    source: 'streamlabs' as const,
    eventType: 'tip' as const,
    occurredAt: donation.occurredAt,
    userId: null,
    userLogin: donation.displayName,
    displayName: donation.displayName,
    anonymous: false,
    amount: donation.amount,
    currency: donation.currency,
    tier: null,
    count: null,
    command: null,
    rawPayload: donation.rawPayload,
  })) satisfies NormalizedTimerEvent[]
}

export function getNewStreamlabsDonationEvents(
  donations: StreamlabsDonationRecord[],
  lastSeenDonationId: string | null,
) {
  if (donations.length === 0) {
    return [] as NormalizedTimerEvent[]
  }

  const unseen: StreamlabsDonationRecord[] = []

  for (const donation of donations) {
    if (donation.donationId === lastSeenDonationId) {
      break
    }

    unseen.push(donation)
  }

  return normalizeStreamlabsDonations(unseen.slice().reverse())
}

export function summarizeStreamlabsTip(event: NormalizedTimerEvent): TipProviderNotification {
  const actor = event.displayName ?? event.userLogin ?? 'A viewer'

  return {
    id: event.id,
    provider: 'streamlabs',
    title: 'Streamlabs tip',
    detail: `${actor} tipped ${event.amount ?? 0}${event.currency ? ` ${event.currency}` : ''}.`,
    occurredAt: Date.parse(event.occurredAt) || Date.now(),
  }
}
