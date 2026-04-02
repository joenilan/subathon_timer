import io from 'socket.io-client'
import { create } from 'zustand'
import {
  buildNativeTipProviderSnapshot,
  clearNativeTipProviderSnapshot,
  loadNativeTipProviderSnapshot,
  saveNativeTipProviderSnapshot,
} from '../lib/platform/nativeTipSession'
import {
  buildStreamElementsSubscribeMessage,
  normalizeStreamElementsTipMessage,
  parseStreamElementsSocketEnvelope,
  summarizeStreamElementsTip,
} from '../lib/tips/streamelements'
import {
  normalizeStreamlabsSocketEvent,
  summarizeStreamlabsTip,
} from '../lib/tips/streamlabs'
import type {
  StreamElementsTipConnection,
  StreamlabsTipConnection,
  TipProviderNotification,
  TipProviderStatus,
} from '../lib/tips/types'
import type { NormalizedTimerEvent } from '../lib/timer/types'

const MAX_TIP_EVENTS = 24
const MAX_TIP_NOTIFICATIONS = 12
const STREAMELEMENTS_SOCKET_URL = 'wss://astro.streamelements.com/'
const STREAMLABS_SOCKET_URL = 'https://sockets.streamlabs.com'

let activeStreamElementsSocket: WebSocket | null = null
let activeStreamElementsReconnectTimer: number | null = null
let desiredStreamElementsConnection: StreamElementsTipConnection | null = null

let activeStreamlabsSocket: SocketIOClient.Socket | null = null
let desiredStreamlabsConnection: StreamlabsTipConnection | null = null

function trimSecret(value: string) {
  return value.trim()
}

function normalizeStreamElementsConnection(
  connection: StreamElementsTipConnection,
): StreamElementsTipConnection {
  return {
    token: trimSecret(connection.token),
    tokenType: connection.tokenType,
  }
}

function normalizeStreamlabsConnection(connection: StreamlabsTipConnection): StreamlabsTipConnection {
  return {
    token: trimSecret(connection.token),
  }
}

function prependNormalizedEvents(
  nextEvents: NormalizedTimerEvent[],
  currentEvents: NormalizedTimerEvent[],
) {
  return [...nextEvents.reverse(), ...currentEvents].slice(0, MAX_TIP_EVENTS)
}

function prependNotifications(
  nextNotifications: TipProviderNotification[],
  currentNotifications: TipProviderNotification[],
) {
  return [...nextNotifications.reverse(), ...currentNotifications].slice(0, MAX_TIP_NOTIFICATIONS)
}

function closeStreamElementsSocket() {
  if (!activeStreamElementsSocket) {
    return
  }

  activeStreamElementsSocket.onopen = null
  activeStreamElementsSocket.onclose = null
  activeStreamElementsSocket.onerror = null
  activeStreamElementsSocket.onmessage = null
  activeStreamElementsSocket.close()
  activeStreamElementsSocket = null
}

function clearStreamElementsReconnectTimer() {
  if (activeStreamElementsReconnectTimer !== null) {
    window.clearTimeout(activeStreamElementsReconnectTimer)
    activeStreamElementsReconnectTimer = null
  }
}

function closeStreamlabsSocket() {
  if (!activeStreamlabsSocket) {
    return
  }

  activeStreamlabsSocket.removeAllListeners()
  activeStreamlabsSocket.close()
  activeStreamlabsSocket = null
}

async function persistTipSnapshot(input: {
  streamelements: StreamElementsTipConnection | null
  streamlabs: StreamlabsTipConnection | null
}) {
  if (!input.streamelements && !input.streamlabs) {
    await clearNativeTipProviderSnapshot()
    return
  }

  await saveNativeTipProviderSnapshot(buildNativeTipProviderSnapshot(input))
}

export interface TipSessionState {
  isBootstrapped: boolean
  streamelementsConnection: StreamElementsTipConnection | null
  streamelementsStatus: TipProviderStatus
  streamelementsLastError: string | null
  streamelementsLastEventAt: number | null
  streamlabsConnection: StreamlabsTipConnection | null
  streamlabsStatus: TipProviderStatus
  streamlabsLastError: string | null
  streamlabsLastEventAt: number | null
  recentNotifications: TipProviderNotification[]
  normalizedEvents: NormalizedTimerEvent[]

  bootstrap: () => Promise<void>
  connectStreamElements: (connection: StreamElementsTipConnection) => Promise<void>
  connectStreamlabs: (connection: StreamlabsTipConnection) => Promise<void>
  disconnectProvider: (provider: 'streamelements' | 'streamlabs') => Promise<void>
  clearError: (provider: 'streamelements' | 'streamlabs') => void
}

export const useTipSessionStore = create<TipSessionState>((set, get) => {
  const scheduleStreamElementsReconnect = (url?: string) => {
    clearStreamElementsReconnectTimer()

    if (!desiredStreamElementsConnection) {
      return
    }

    activeStreamElementsReconnectTimer = window.setTimeout(() => {
      void connectStreamElementsRuntime(desiredStreamElementsConnection!, url)
    }, 1800)
  }

  const connectStreamElementsRuntime = async (
    connection: StreamElementsTipConnection,
    reconnectUrl?: string,
  ) => {
    desiredStreamElementsConnection = connection
    clearStreamElementsReconnectTimer()
    closeStreamElementsSocket()

    set({
      streamelementsStatus: 'connecting',
      streamelementsLastError: null,
    })

    try {
      const socket = new WebSocket(reconnectUrl ?? STREAMELEMENTS_SOCKET_URL)
      activeStreamElementsSocket = socket

      socket.onopen = () => {
        socket.send(buildStreamElementsSubscribeMessage(connection))
      }

      socket.onerror = () => {
        set({
          streamelementsStatus: 'error',
          streamelementsLastError: 'StreamElements socket failed to connect.',
        })
      }

      socket.onclose = () => {
        activeStreamElementsSocket = null

        if (!desiredStreamElementsConnection) {
          return
        }

        set((state) => ({
          streamelementsStatus: state.streamelementsStatus === 'idle' ? 'idle' : 'error',
          streamelementsLastError:
            state.streamelementsStatus === 'idle' ? null : 'StreamElements disconnected. Retrying…',
        }))

        scheduleStreamElementsReconnect()
      }

      socket.onmessage = (message) => {
        const envelope = parseStreamElementsSocketEnvelope(String(message.data))
        if (!envelope) {
          return
        }

        if (envelope.type === 'response' && envelope.error) {
          set({
            streamelementsStatus: 'error',
            streamelementsLastError:
              typeof envelope.data?.message === 'string'
                ? envelope.data.message
                : 'StreamElements rejected the tip subscription.',
          })
          return
        }

        if (envelope.type === 'response') {
          set({
            streamelementsStatus: 'connected',
            streamelementsLastError: null,
          })
          return
        }

        if (envelope.type === 'reconnect') {
          const reconnectToken =
            typeof envelope.data?.reconnect_token === 'string' ? envelope.data.reconnect_token : null

          if (reconnectToken) {
            void connectStreamElementsRuntime(
              connection,
              `${STREAMELEMENTS_SOCKET_URL}?reconnect_token=${encodeURIComponent(reconnectToken)}`,
            )
          }
          return
        }

        const normalizedEvent = normalizeStreamElementsTipMessage(envelope)
        if (!normalizedEvent) {
          return
        }

        const notification = summarizeStreamElementsTip(normalizedEvent)
        const occurredAt = notification.occurredAt

        set((state) => ({
          streamelementsStatus: 'connected',
          streamelementsLastError: null,
          streamelementsLastEventAt: occurredAt,
          normalizedEvents: prependNormalizedEvents([normalizedEvent], state.normalizedEvents),
          recentNotifications: prependNotifications([notification], state.recentNotifications),
        }))
      }
    } catch (error) {
      set({
        streamelementsStatus: 'error',
        streamelementsLastError:
          error instanceof Error ? error.message : 'Unable to connect StreamElements tips.',
      })
    }
  }

  const connectStreamlabsRuntime = async (connection: StreamlabsTipConnection) => {
    desiredStreamlabsConnection = connection
    closeStreamlabsSocket()

    set({
      streamlabsStatus: 'connecting',
      streamlabsLastError: null,
    })

    try {
      const socket = io(STREAMLABS_SOCKET_URL, {
        transports: ['websocket'],
        forceNew: true,
        reconnection: true,
        reconnectionAttempts: Infinity,
        reconnectionDelay: 1500,
        query: {
          token: connection.token,
        },
      }) as SocketIOClient.Socket

      activeStreamlabsSocket = socket

      socket.on('connect', () => {
        set({
          streamlabsStatus: 'connected',
          streamlabsLastError: null,
        })
      })

      socket.on('connect_error', (error: Error | undefined) => {
        set({
          streamlabsStatus: 'error',
          streamlabsLastError:
            error instanceof Error && error.message.trim().length > 0
              ? error.message
              : 'Streamlabs socket failed to connect.',
        })
      })

      socket.on('reconnect_attempt', () => {
        if (!desiredStreamlabsConnection) {
          return
        }

        set({
          streamlabsStatus: 'connecting',
          streamlabsLastError: null,
        })
      })

      socket.on('disconnect', (reason: string) => {
        if (!desiredStreamlabsConnection) {
          return
        }

        set({
          streamlabsStatus: 'error',
          streamlabsLastError:
            reason === 'io client disconnect' ? null : 'Streamlabs disconnected. Reconnecting…',
        })
      })

      socket.on('event', (payload: unknown) => {
        const normalizedEvents = normalizeStreamlabsSocketEvent(payload)
        if (normalizedEvents.length === 0) {
          return
        }

        const notifications = normalizedEvents.map((event) => summarizeStreamlabsTip(event))
        const occurredAt = notifications[0]?.occurredAt ?? Date.now()

        set((state) => ({
          streamlabsStatus: 'connected',
          streamlabsLastError: null,
          streamlabsLastEventAt: occurredAt,
          normalizedEvents: prependNormalizedEvents(normalizedEvents, state.normalizedEvents),
          recentNotifications: prependNotifications(notifications, state.recentNotifications),
        }))
      })
    } catch (error) {
      set({
        streamlabsStatus: 'error',
        streamlabsLastError:
          error instanceof Error ? error.message : 'Unable to connect Streamlabs tips.',
      })
    }
  }

  return {
    isBootstrapped: false,
    streamelementsConnection: null,
    streamelementsStatus: 'idle',
    streamelementsLastError: null,
    streamelementsLastEventAt: null,
    streamlabsConnection: null,
    streamlabsStatus: 'idle',
    streamlabsLastError: null,
    streamlabsLastEventAt: null,
    recentNotifications: [],
    normalizedEvents: [],

    bootstrap: async () => {
      if (get().isBootstrapped) {
        return
      }

      try {
        const snapshot = await loadNativeTipProviderSnapshot()

        set({
          streamelementsConnection: snapshot?.streamelements ?? null,
          streamlabsConnection: snapshot?.streamlabs ?? null,
          isBootstrapped: true,
        })

        if (snapshot?.streamelements) {
          await connectStreamElementsRuntime(snapshot.streamelements)
        }

        if (snapshot?.streamlabs) {
          await connectStreamlabsRuntime(snapshot.streamlabs)
        }
      } catch (error) {
        set({
          isBootstrapped: true,
          streamelementsStatus: 'error',
          streamelementsLastError:
            error instanceof Error ? error.message : 'Unable to load saved tip provider settings.',
        })
      }
    },

    connectStreamElements: async (connection) => {
      const nextConnection = normalizeStreamElementsConnection(connection)

      if (!nextConnection.token) {
        set({
          streamelementsStatus: 'error',
          streamelementsLastError: 'Paste a StreamElements token before connecting.',
        })
        return
      }

      set({ streamelementsConnection: nextConnection })
      await persistTipSnapshot({
        streamelements: nextConnection,
        streamlabs: get().streamlabsConnection,
      })
      await connectStreamElementsRuntime(nextConnection)
    },

    connectStreamlabs: async (connection) => {
      const nextConnection = normalizeStreamlabsConnection(connection)

      if (!nextConnection.token) {
        set({
          streamlabsStatus: 'error',
          streamlabsLastError: 'Paste your Streamlabs Socket API Token before connecting.',
        })
        return
      }

      set({ streamlabsConnection: nextConnection })
      await persistTipSnapshot({
        streamelements: get().streamelementsConnection,
        streamlabs: nextConnection,
      })
      await connectStreamlabsRuntime(nextConnection)
    },

    disconnectProvider: async (provider) => {
      if (provider === 'streamelements') {
        desiredStreamElementsConnection = null
        clearStreamElementsReconnectTimer()
        closeStreamElementsSocket()

        const nextStreamlabsConnection = get().streamlabsConnection
        set({
          streamelementsConnection: null,
          streamelementsStatus: 'idle',
          streamelementsLastError: null,
          streamelementsLastEventAt: null,
        })

        await persistTipSnapshot({
          streamelements: null,
          streamlabs: nextStreamlabsConnection,
        })
        return
      }

      desiredStreamlabsConnection = null
      closeStreamlabsSocket()

      const nextStreamElementsConnection = get().streamelementsConnection
      set({
        streamlabsConnection: null,
        streamlabsStatus: 'idle',
        streamlabsLastError: null,
        streamlabsLastEventAt: null,
      })

      await persistTipSnapshot({
        streamelements: nextStreamElementsConnection,
        streamlabs: null,
      })
    },

    clearError: (provider) =>
      set(
        provider === 'streamelements'
          ? { streamelementsLastError: null }
          : { streamlabsLastError: null },
      ),
  }
})
