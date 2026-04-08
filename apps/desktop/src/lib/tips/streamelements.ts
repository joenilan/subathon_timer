import type { NormalizedTimerEvent } from '../timer/types'
import type { StreamElementsTipConnection, TipProviderNotification } from './types'
import { formatTipAmount } from './formatTipAmount'

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

  if (typeof value === 'number' && Number.isFinite(value)) {
    return value
  }

  if (typeof value === 'string' && value.length > 0) {
    const parsed = Number.parseFloat(value)
    return Number.isFinite(parsed) ? parsed : null
  }

  return null
}

function getBoolean(record: Record<string, unknown> | null, key: string) {
  return record?.[key] === true
}

function buildStreamElementsSubscribeMessage(
  connection: StreamElementsTipConnection,
  topic: 'channel.tips' | 'channel.activities',
) {
  return JSON.stringify({
    type: 'subscribe',
    nonce: `streamelements-${topic}-${crypto.randomUUID()}`,
    data: {
      topic,
      token: connection.token,
      token_type: connection.tokenType,
    },
  })
}

export function buildStreamElementsSubscribeMessages(connection: StreamElementsTipConnection) {
  return [
    buildStreamElementsSubscribeMessage(connection, 'channel.tips'),
    buildStreamElementsSubscribeMessage(connection, 'channel.activities'),
  ]
}

export function parseStreamElementsSocketEnvelope(raw: string): StreamElementsSocketEnvelope | null {
  try {
    const parsed = JSON.parse(raw) as StreamElementsSocketEnvelope
    return parsed && typeof parsed === 'object' ? parsed : null
  } catch {
    return null
  }
}

function normalizeStreamElementsChannelTip(envelope: StreamElementsSocketEnvelope) {
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
  } satisfies NormalizedTimerEvent
}

function normalizeStreamElementsActivityTip(envelope: StreamElementsSocketEnvelope) {
  const payload = asRecord(envelope.data)
  const activityData = asRecord(payload?.data)
  const payloadType = getString(payload, 'type')?.toLowerCase()
  const nestedType =
    getString(activityData, 'type')?.toLowerCase() ??
    getString(activityData, 'eventType')?.toLowerCase() ??
    getString(activityData, 'event')?.toLowerCase()
  const isMarkedTest =
    getBoolean(payload, 'test') ||
    getBoolean(payload, 'isTest') ||
    getBoolean(activityData, 'test') ||
    getBoolean(activityData, 'isTest')

  if (payloadType !== 'tip' && nestedType !== 'tip' && !(isMarkedTest && nestedType === 'tip')) {
    return null
  }
  const amount =
    getNumber(activityData, 'amount') ??
    getNumber(activityData, 'tipAmount') ??
    getNumber(activityData, 'donationAmount') ??
    getNumber(payload, 'amount')

  if (amount === null || amount <= 0) {
    return null
  }

  const displayName =
    getString(activityData, 'displayName') ??
    getString(activityData, 'username') ??
    getString(activityData, 'name')

  return {
    id:
      envelope.id ??
      getString(payload, 'activityId') ??
      getString(payload, '_id') ??
      getString(activityData, 'transactionId') ??
      crypto.randomUUID(),
    source: 'streamelements',
    eventType: 'tip',
    occurredAt:
      envelope.ts ??
      getString(payload, 'createdAt') ??
      getString(payload, 'updatedAt') ??
      new Date().toISOString(),
    userId: getString(activityData, 'providerId'),
    userLogin: getString(activityData, 'username'),
    displayName,
    anonymous: false,
    amount,
    currency: getString(activityData, 'currency') ?? getString(payload, 'currency'),
    tier: null,
    count: null,
    command: null,
    rawPayload: payload ?? {},
  } satisfies NormalizedTimerEvent
}

export function normalizeStreamElementsTipMessage(envelope: StreamElementsSocketEnvelope | null): NormalizedTimerEvent | null {
  if (!envelope || envelope.type !== 'message') {
    return null
  }

  if (envelope.topic === 'channel.tips') {
    return normalizeStreamElementsChannelTip(envelope)
  }

  if (envelope.topic === 'channel.activities') {
    return normalizeStreamElementsActivityTip(envelope)
  }

  return null
}

export function summarizeStreamElementsTip(event: NormalizedTimerEvent): TipProviderNotification {
  const actor = event.displayName ?? event.userLogin ?? 'A viewer'

  return {
    id: event.id,
    provider: 'streamelements',
    title: 'StreamElements tip',
    detail: `${actor} tipped ${formatTipAmount(event.amount, event.currency)}.`,
    occurredAt: Date.parse(event.occurredAt) || Date.now(),
  }
}
