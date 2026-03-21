import { create } from 'zustand'
import {
  buildCoreSubscriptionRequests,
  createEventSubSubscription,
  mapTransportSession,
  openEventSubSocket,
  parseEventSubEnvelope,
  summarizeEventSubNotification,
  type EventSubConnectionStatus,
  type EventSubNotificationRecord,
  type EventSubSubscriptionRecord,
  type EventSubTransportSession,
} from '../lib/twitch/eventsub'
import { TWITCH_CLIENT_ID } from '../lib/twitch/constants'
import { normalizeEventSubMessage } from '../lib/twitch/normalizeEventSubMessage'
import type { NormalizedTwitchEvent } from '../lib/timer/types'

let activeSocket: WebSocket | null = null
let activeReconnectTimer: number | null = null
let activeSessionUserId: string | null = null

export interface EventSubState {
  status: EventSubConnectionStatus
  session: EventSubTransportSession | null
  subscriptions: EventSubSubscriptionRecord[]
  recentNotifications: EventSubNotificationRecord[]
  normalizedEvents: NormalizedTwitchEvent[]
  lastMessageAt: number | null
  lastError: string | null

  connect: (params: {
    accessToken: string
    broadcasterUserId: string
    clientId?: string
  }) => void
  disconnect: () => void
  clearError: () => void
}

function clearReconnectTimer() {
  if (activeReconnectTimer !== null) {
    window.clearTimeout(activeReconnectTimer)
    activeReconnectTimer = null
  }
}

function closeActiveSocket() {
  if (activeSocket) {
    activeSocket.onopen = null
    activeSocket.onclose = null
    activeSocket.onerror = null
    activeSocket.onmessage = null
    activeSocket.close()
    activeSocket = null
  }
}

export const useEventSubStore = create<EventSubState>((set, get) => {
  const scheduleReconnect = (params: { accessToken: string; broadcasterUserId: string; clientId?: string }, url?: string) => {
    clearReconnectTimer()
    activeReconnectTimer = window.setTimeout(() => {
      establishSocket({ ...params, clientId: params.clientId ?? TWITCH_CLIENT_ID }, url)
    }, 1500)
  }

  const establishSocket = (
    params: { accessToken: string; broadcasterUserId: string; clientId?: string },
    url?: string,
  ) => {
    clearReconnectTimer()
    closeActiveSocket()

    set({
      status: url ? 'reconnecting' : 'connecting',
      lastError: null,
      subscriptions: [],
      session: null,
    })

    const socket = openEventSubSocket(url)
    activeSocket = socket
    activeSessionUserId = params.broadcasterUserId

    socket.onopen = () => {
      set({ status: 'connecting', lastError: null })
    }

    socket.onerror = () => {
      set({ status: 'error', lastError: 'EventSub WebSocket failed to connect.' })
    }

    socket.onclose = () => {
      if (activeSessionUserId !== params.broadcasterUserId) {
        return
      }

      activeSocket = null

      set((state) => ({
        ...state,
        status: state.status === 'idle' ? 'idle' : 'error',
        session: state.status === 'idle' ? null : state.session,
        lastError: state.status === 'idle' ? null : 'EventSub disconnected. Retrying…',
      }))

      scheduleReconnect(params)
    }

    socket.onmessage = async (message) => {
      try {
        const envelope = parseEventSubEnvelope(String(message.data))
        const messageType = envelope.metadata?.message_type

        set({ lastMessageAt: Date.now() })

        if (messageType === 'session_welcome') {
          const session = mapTransportSession(envelope)

          if (!session) {
            throw new Error('Twitch did not provide a valid EventSub session.')
          }

          set({
            status: 'subscribing',
            session,
            subscriptions: [],
            lastError: null,
          })

          const clientId = params.clientId ?? TWITCH_CLIENT_ID
          const requests = buildCoreSubscriptionRequests(params.broadcasterUserId)
          const subscriptions = await Promise.all(
            requests.map((request) =>
              createEventSubSubscription(clientId, params.accessToken, session.id, request),
            ),
          )

          set({
            status: 'connected',
            subscriptions,
            lastError: null,
          })

          return
        }

        if (messageType === 'session_reconnect') {
          const reconnectUrl = envelope.payload?.session?.reconnect_url

          if (typeof reconnectUrl === 'string' && reconnectUrl.length > 0) {
            set({ status: 'reconnecting' })
            establishSocket(params, reconnectUrl)
          }

          return
        }

        if (messageType === 'notification') {
          const notification = summarizeEventSubNotification(envelope)
          const normalizedEvent = normalizeEventSubMessage(envelope)

          if (!notification && !normalizedEvent) {
            return
          }

          set((state) => ({
            recentNotifications: notification
              ? [notification, ...state.recentNotifications].slice(0, 12)
              : state.recentNotifications,
            normalizedEvents: normalizedEvent
              ? [normalizedEvent, ...state.normalizedEvents].slice(0, 20)
              : state.normalizedEvents,
          }))

          return
        }

        if (messageType === 'revocation') {
          set({
            status: 'error',
            lastError: 'A Twitch EventSub subscription was revoked. Reconnect Twitch to restore it.',
          })
        }
      } catch (error) {
        set({
          status: 'error',
          lastError: error instanceof Error ? error.message : 'EventSub processing failed.',
        })
      }
    }
  }

  return {
    status: 'idle',
    session: null,
    subscriptions: [],
    recentNotifications: [],
    normalizedEvents: [],
    lastMessageAt: null,
    lastError: null,

    connect: (params) => {
      const clientId = params.clientId ?? TWITCH_CLIENT_ID

      if (
        activeSocket &&
        activeSessionUserId === params.broadcasterUserId &&
        (get().status === 'connecting' || get().status === 'subscribing' || get().status === 'connected')
      ) {
        return
      }

      establishSocket({ ...params, clientId })
    },

    disconnect: () => {
      clearReconnectTimer()
      activeSessionUserId = null
      closeActiveSocket()
      set({
        status: 'idle',
        session: null,
        subscriptions: [],
        recentNotifications: [],
        normalizedEvents: [],
        lastMessageAt: null,
        lastError: null,
      })
    },

    clearError: () => set({ lastError: null }),
  }
})
