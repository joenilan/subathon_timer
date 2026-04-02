import type { NormalizedTimerEvent } from '../timer/types'
import type { StreamElementsTipConnection, TipProviderNotification } from './types'

interface StreamElementsSocketEnvelope {
  id?: string
  ts?: string
  type?: string
  error?: string
  topic?: string
  data?: Record<string, unknown>
}

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

function getNumber(record: Record<string, unknown> | null, key: string) {
  const value = record?.[key]
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

export function buildStreamElementsSubscribeMessage(connection: StreamElementsTipConnection) {
  return JSON.stringify({
    type: 'subscribe',
    nonce: `streamelements-tip-${crypto.randomUUID()}`,
    data: {
      topic: 'channel.tips',
      token: connection.token,
      token_type: connection.tokenType,
    },
  })
}

export function parseStreamElementsSocketEnvelope(raw: string): StreamElementsSocketEnvelope | null {
  try {
    const parsed = JSON.parse(raw) as StreamElementsSocketEnvelope
    return parsed && typeof parsed === 'object' ? parsed : null
  } catch {
    return null
  }
}

export function normalizeStreamElementsTipMessage(envelope: StreamElementsSocketEnvelope | null): NormalizedTimerEvent | null {
  if (!envelope || envelope.type !== 'message' || envelope.topic !== 'channel.tips') {
    return null
  }

  const payload = asRecord(envelope.data)
  const donation = asRecord(payload?.donation)
  const user = asRecord(donation?.user)
  const status = getString(payload, 'status')

  if (status !== null && status !== 'success') {
    return null
  }

  const amount = getNumber(donation, 'amount')
  if (amount === null || amount <= 0) {
    return null
  }

  return {
    id: envelope.id ?? getString(payload, 'transactionId') ?? getString(payload, '_id') ?? crypto.randomUUID(),
    source: 'streamelements',
    eventType: 'tip',
    occurredAt: envelope.ts ?? getString(payload, 'createdAt') ?? new Date().toISOString(),
    userId: null,
    userLogin: getString(user, 'username'),
    displayName: getString(user, 'username'),
    anonymous: false,
    amount,
    currency: getString(donation, 'currency'),
    tier: null,
    count: null,
    command: null,
    rawPayload: payload ?? {},
  }
}

export function summarizeStreamElementsTip(event: NormalizedTimerEvent): TipProviderNotification {
  const actor = event.displayName ?? event.userLogin ?? 'A viewer'

  return {
    id: event.id,
    provider: 'streamelements',
    title: 'StreamElements tip',
    detail: `${actor} tipped ${event.amount ?? 0}${event.currency ? ` ${event.currency}` : ''}.`,
    occurredAt: Date.parse(event.occurredAt) || Date.now(),
  }
}
