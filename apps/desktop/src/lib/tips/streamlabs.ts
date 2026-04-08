import type { NormalizedTimerEvent } from '../timer/types'
import type { TipProviderNotification } from './types'
import { formatTipAmount } from './formatTipAmount'

interface StreamlabsSocketEnvelope {
  type?: string
  for?: string
  event_id?: string
  message?: unknown
}

function asRecord(value: unknown) {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>
  }

  return null
}

function asArray(value: unknown) {
  if (Array.isArray(value)) {
    return value
  }

  if (value && typeof value === 'object') {
    return [value]
  }

  return []
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

function normalizeStreamlabsDonation(
  value: unknown,
  fallbackEventId: string | null,
  index: number,
): NormalizedTimerEvent | null {
  const donation = asRecord(value)
  const donationId =
    getString(donation, 'donation_id') ??
    getString(donation, 'id') ??
    (fallbackEventId ? `${fallbackEventId}:${index}` : null)
  const amount = getNumericValue(donation, 'amount')

  if (!donation || !donationId || amount === null || amount <= 0) {
    return null
  }

  const displayName = getString(donation, 'name') ?? getString(donation, 'from')

  return {
    id: donationId,
    source: 'streamlabs',
    eventType: 'tip',
    occurredAt:
      getString(donation, 'created_at') ??
      getString(donation, 'createdAt') ??
      new Date().toISOString(),
    userId: null,
    userLogin: displayName,
    displayName,
    anonymous: false,
    amount,
    currency: getString(donation, 'currency'),
    tier: null,
    count: null,
    command: null,
    rawPayload: donation,
  }
}

export function normalizeStreamlabsSocketEvent(value: unknown) {
  const payload = asRecord(value) as StreamlabsSocketEnvelope | null

  if (!payload || !['donation', 'donation_test', 'test'].includes(payload.type ?? '')) {
    return [] as NormalizedTimerEvent[]
  }

  if (payload.for && payload.for !== 'streamlabs') {
    return [] as NormalizedTimerEvent[]
  }

  return asArray(payload.message)
    .map((entry, index) => normalizeStreamlabsDonation(entry, payload.event_id ?? null, index))
    .filter((entry): entry is NormalizedTimerEvent => entry !== null)
}

export function summarizeStreamlabsTip(event: NormalizedTimerEvent): TipProviderNotification {
  const actor = event.displayName ?? event.userLogin ?? 'A viewer'

  return {
    id: event.id,
    provider: 'streamlabs',
    title: 'Streamlabs tip',
    detail: `${actor} tipped ${formatTipAmount(event.amount, event.currency)}.`,
    occurredAt: Date.parse(event.occurredAt) || Date.now(),
  }
}
