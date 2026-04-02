import type { ChatTimerCommand, ChatTimerCommandAction, NormalizedTwitchEvent } from '../timer/types'
import type { EventSubEnvelope } from './eventsub'

function asRecord(value: unknown) {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>
  }

  return null
}

function getString(record: Record<string, unknown>, key: string) {
  const value = record[key]
  return typeof value === 'string' && value.length > 0 ? value : null
}

function getNumber(record: Record<string, unknown>, key: string) {
  const value = record[key]
  return typeof value === 'number' ? value : null
}

function asArray(value: unknown) {
  return Array.isArray(value) ? value : []
}

function getBoolean(record: Record<string, unknown>, key: string) {
  const value = record[key]
  return typeof value === 'boolean' ? value : false
}

function getFirstString(record: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = getString(record, key)
    if (value) {
      return value
    }
  }

  return null
}

function parseColonDuration(value: string) {
  const parts = value
    .split(':')
    .map((part) => part.trim())
    .filter(Boolean)

  if (parts.length === 0 || parts.length > 3 || parts.some((part) => !/^\d+$/.test(part))) {
    return null
  }

  const numericParts = parts.map((part) => Number.parseInt(part, 10))

  if (numericParts.length === 1) {
    return Math.max(0, numericParts[0])
  }

  if (numericParts.length === 2) {
    const [minutes, seconds] = numericParts
    return Math.max(0, minutes) * 60 + Math.min(Math.max(0, seconds), 59)
  }

  const [hours, minutes, seconds] = numericParts
  return Math.max(0, hours) * 3600 + Math.min(Math.max(0, minutes), 59) * 60 + Math.min(Math.max(0, seconds), 59)
}

function parseUnitDuration(value: string) {
  const normalized = value.trim().toLowerCase()
  if (!normalized) {
    return null
  }

  if (/^\d+$/.test(normalized)) {
    return Number.parseInt(normalized, 10)
  }

  const unitPattern = /(\d+)\s*(h(?:ours?)?|m(?:in(?:ute)?s?)?|s(?:ec(?:ond)?s?)?)/g
  let totalSeconds = 0
  let consumedLength = 0

  for (const match of normalized.matchAll(unitPattern)) {
    const amount = Number.parseInt(match[1], 10)
    const unit = match[2]
    if (unit.startsWith('h')) {
      totalSeconds += amount * 3600
    } else if (unit.startsWith('m')) {
      totalSeconds += amount * 60
    } else {
      totalSeconds += amount
    }
    consumedLength += match[0].length
  }

  if (!totalSeconds) {
    return null
  }

  const compactNormalized = normalized.replace(/\s+/g, '')
  const compactConsumed = Array.from(normalized.matchAll(unitPattern))
    .map((match) => match[0].replace(/\s+/g, ''))
    .join('')

  return compactNormalized === compactConsumed ? totalSeconds : null
}

function parseCommandDuration(value: string) {
  return parseColonDuration(value) ?? parseUnitDuration(value)
}

function extractChatBadges(event: Record<string, unknown>) {
  return asArray(event.badges)
    .map((badge) => asRecord(badge))
    .filter((badge): badge is Record<string, unknown> => badge !== null)
    .map((badge) => getString(badge, 'set_id'))
    .filter((badge): badge is string => Boolean(badge))
}

function parseChatTimerCommand(event: Record<string, unknown>): ChatTimerCommand | null {
  const message = asRecord(event.message)
  const rawText = getString(message ?? event, 'text')?.trim()

  if (!rawText) {
    return null
  }

  const tokens = rawText.split(/\s+/)
  if (tokens.length === 0 || tokens[0].toLowerCase() !== '!timer') {
    return null
  }

  const badges = extractChatBadges(event)
  const isBroadcaster =
    badges.includes('broadcaster') || getString(event, 'chatter_user_id') === getString(event, 'broadcaster_user_id')
  const isModerator = isBroadcaster || badges.includes('moderator')
  if (tokens.length === 1) {
    return {
      action: 'help',
      rawText,
      seconds: null,
      isBroadcaster,
      isModerator,
    } satisfies ChatTimerCommand
  }

  const actionToken = tokens[1].toLowerCase()
  const durationText = tokens.slice(2).join(' ').trim()

  const buildCommand = (action: ChatTimerCommandAction, seconds: number | null) => ({
    action,
    rawText,
    seconds,
    isBroadcaster,
    isModerator,
  } satisfies ChatTimerCommand)

  switch (actionToken) {
    case 'add':
    case 'plus': {
      const seconds = parseCommandDuration(durationText)
      return seconds && seconds > 0 ? buildCommand('add', seconds) : null
    }
    case 'remove':
    case 'minus':
    case 'sub': {
      const seconds = parseCommandDuration(durationText)
      return seconds && seconds > 0 ? buildCommand('remove', seconds) : null
    }
    case 'set': {
      const seconds = parseCommandDuration(durationText)
      return seconds !== null ? buildCommand('set', seconds) : null
    }
    case 'pause':
    case 'stop':
      return buildCommand('pause', null)
    case 'resume':
    case 'unpause':
      return buildCommand('resume', null)
    case 'start':
      return buildCommand('start', null)
    case 'reset':
      return buildCommand('reset', null)
    case 'help':
      return buildCommand('help', null)
    default:
      return null
  }
}

export function normalizeEventSubMessage(message: EventSubEnvelope): NormalizedTwitchEvent | null {
  if (message.metadata?.message_type !== 'notification') {
    return null
  }

  const event = asRecord(message.payload?.event)

  if (!event) {
    return null
  }

  const baseEvent = {
    id: message.metadata?.message_id ?? crypto.randomUUID(),
    source: 'twitch-eventsub' as const,
    occurredAt: message.metadata?.message_timestamp ?? new Date().toISOString(),
    userId: getFirstString(event, ['chatter_user_id', 'user_id', 'from_broadcaster_user_id']),
    userLogin: getFirstString(event, ['chatter_user_login', 'user_login', 'from_broadcaster_user_login']),
    displayName: getFirstString(event, ['chatter_user_name', 'user_name', 'from_broadcaster_user_name']),
    anonymous: getBoolean(event, 'is_anonymous'),
    amount: null,
    currency: null,
    tier: getString(event, 'tier'),
    count: null,
    command: null,
    rawPayload: event,
  }

  switch (message.metadata?.subscription_type) {
    case 'channel.follow':
      return {
        ...baseEvent,
        eventType: 'follow',
      }
    case 'channel.subscribe':
      if (getBoolean(event, 'is_gift')) {
        return null
      }

      return {
        ...baseEvent,
        eventType: 'subscription',
      }
    case 'channel.subscription.message':
      return {
        ...baseEvent,
        eventType: 'resubscription',
      }
    case 'channel.subscription.gift': {
      const total = getNumber(event, 'total') ?? 1
      return {
        ...baseEvent,
        eventType: total > 1 ? 'gift_bomb' : 'gift_subscription',
        count: total,
      }
    }
    case 'channel.cheer':
      return {
        ...baseEvent,
        eventType: 'cheer',
        amount: getNumber(event, 'bits'),
      }
    case 'channel.raid':
      return {
        ...baseEvent,
        eventType: 'raid',
        amount: getNumber(event, 'viewers'),
      }
    case 'channel.chat.message': {
      const command = parseChatTimerCommand(event)
      if (!command) {
        return null
      }

      return {
        ...baseEvent,
        eventType: 'chat_command',
        command,
      }
    }
    default:
      return null
  }
}
