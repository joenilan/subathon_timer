export type EventSubConnectionStatus =
  | 'idle'
  | 'connecting'
  | 'connected'
  | 'subscribing'
  | 'error'
  | 'reconnecting'

export interface EventSubTransportSession {
  id: string
  status: string
  reconnectUrl: string | null
  connectedAt: string | null
  keepaliveTimeoutSeconds: number | null
}

export interface EventSubSubscriptionRequest {
  type: string
  version: string
  condition: Record<string, string>
}

export interface EventSubSubscriptionRecord {
  id: string
  status: string
  type: string
  version: string
  condition: Record<string, string>
  createdAt: string
}

export interface EventSubNotificationRecord {
  id: string
  type: string
  title: string
  detail: string
  receivedAt: number
}

export interface EventSubEnvelope {
  metadata?: {
    message_id?: string
    message_type?: string
    message_timestamp?: string
    subscription_type?: string
  }
  payload?: {
    session?: {
      id?: string
      status?: string
      connected_at?: string
      keepalive_timeout_seconds?: number
      reconnect_url?: string | null
    }
    subscription?: {
      id?: string
      status?: string
      type?: string
      version?: string
      condition?: Record<string, string>
      created_at?: string
    }
    event?: Record<string, unknown>
  }
}

const WS_URL = 'wss://eventsub.wss.twitch.tv/ws'
const CREATE_SUBSCRIPTION_URL = 'https://api.twitch.tv/helix/eventsub/subscriptions'

export const CORE_EVENTSUB_SUBSCRIPTIONS: EventSubSubscriptionRequest[] = [
  {
    type: 'channel.subscribe',
    version: '1',
    condition: {},
  },
  {
    type: 'channel.subscription.gift',
    version: '1',
    condition: {},
  },
  {
    type: 'channel.subscription.message',
    version: '1',
    condition: {},
  },
  {
    type: 'channel.cheer',
    version: '1',
    condition: {},
  },
  {
    type: 'channel.follow',
    version: '2',
    condition: {},
  },
  {
    type: 'channel.raid',
    version: '1',
    condition: {},
  },
  {
    type: 'channel.chat.message',
    version: '1',
    condition: {},
  },
]

function safeString(value: unknown) {
  return typeof value === 'string' ? value : ''
}

export function openEventSubSocket(url = WS_URL) {
  return new WebSocket(url)
}

export function parseEventSubEnvelope(raw: string): EventSubEnvelope {
  return JSON.parse(raw) as EventSubEnvelope
}

export function mapTransportSession(envelope: EventSubEnvelope): EventSubTransportSession | null {
  const session = envelope.payload?.session

  if (!session?.id || !session.status) {
    return null
  }

  return {
    id: session.id,
    status: session.status,
    reconnectUrl: typeof session.reconnect_url === 'string' ? session.reconnect_url : null,
    connectedAt: typeof session.connected_at === 'string' ? session.connected_at : null,
    keepaliveTimeoutSeconds:
      typeof session.keepalive_timeout_seconds === 'number' ? session.keepalive_timeout_seconds : null,
  }
}

export function buildCoreSubscriptionRequests(
  broadcasterUserId: string,
  listeningUserId = broadcasterUserId,
): EventSubSubscriptionRequest[] {
  return CORE_EVENTSUB_SUBSCRIPTIONS.map((subscription) => {
    let condition: Record<string, string>

    if (subscription.type === 'channel.follow') {
      condition = {
        broadcaster_user_id: broadcasterUserId,
        moderator_user_id: broadcasterUserId,
      }
    } else if (subscription.type === 'channel.chat.message') {
      condition = {
        broadcaster_user_id: broadcasterUserId,
        user_id: listeningUserId,
      }
    } else if (subscription.type === 'channel.raid') {
      condition = {
        to_broadcaster_user_id: broadcasterUserId,
      }
    } else {
      condition = {
        broadcaster_user_id: broadcasterUserId,
      }
    }

    return {
      ...subscription,
      condition,
    }
  })
}

export async function createEventSubSubscription(
  clientId: string,
  accessToken: string,
  sessionId: string,
  request: EventSubSubscriptionRequest,
): Promise<EventSubSubscriptionRecord> {
  const response = await fetch(CREATE_SUBSCRIPTION_URL, {
    method: 'POST',
    headers: {
      'Client-Id': clientId,
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      type: request.type,
      version: request.version,
      condition: request.condition,
      transport: {
        method: 'websocket',
        session_id: sessionId,
      },
    }),
  })

  const payload = (await response.json()) as {
    data?: Array<{
      id?: string
      status?: string
      type?: string
      version?: string
      condition?: Record<string, string>
      created_at?: string
    }>
    message?: string
    error?: string
  }

  if (!response.ok || !payload.data?.[0]) {
    const errorMessage = payload.message || payload.error || `Subscription failed for ${request.type}.`
    throw new Error(errorMessage)
  }

  const record = payload.data[0]

  return {
    id: record.id ?? crypto.randomUUID(),
    status: record.status ?? 'enabled',
    type: record.type ?? request.type,
    version: record.version ?? request.version,
    condition: record.condition ?? request.condition,
    createdAt: record.created_at ?? new Date().toISOString(),
  }
}

export function summarizeEventSubNotification(envelope: EventSubEnvelope): EventSubNotificationRecord | null {
  const type = safeString(envelope.metadata?.subscription_type)
  const event = envelope.payload?.event

  if (!type || !event) {
    return null
  }

  if (type === 'channel.chat.message') {
    return null
  }

  const userName =
    safeString(event.from_broadcaster_user_name) ||
    safeString(event.from_broadcaster_user_login) ||
    safeString(event.from_broadcaster_user_id) ||
    safeString(event.user_name) ||
    safeString(event.user_login) ||
    safeString(event.user_id) ||
    'Unknown user'

  let title = type
  let detail = userName

  if (type === 'channel.subscribe') {
    title = 'New subscription'
    detail = `${userName} subscribed`
  } else if (type === 'channel.subscription.gift') {
    const total = typeof event.total === 'number' ? event.total : 0
    title = 'Gifted subs'
    detail = `${userName} gifted ${total} sub${total === 1 ? '' : 's'}`
  } else if (type === 'channel.subscription.message') {
    const tier = safeString(event.tier)
    title = 'Resubscription'
    detail = `${userName} shared a resub message${tier ? ` (${tier})` : ''}`
  } else if (type === 'channel.cheer') {
    const bits = typeof event.bits === 'number' ? event.bits : 0
    title = 'Cheer'
    detail = `${userName} cheered ${bits} bits`
  } else if (type === 'channel.follow') {
    title = 'New follow'
    detail = `${userName} followed`
  } else if (type === 'channel.raid') {
    const viewers = typeof event.viewers === 'number' ? event.viewers : 0
    title = 'Incoming raid'
    detail = `${userName} raided with ${viewers} viewer${viewers === 1 ? '' : 's'}`
  }

  return {
    id: safeString(envelope.metadata?.message_id) || crypto.randomUUID(),
    type,
    title,
    detail,
    receivedAt: Date.now(),
  }
}
