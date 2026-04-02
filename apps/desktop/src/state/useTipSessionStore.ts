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
  fetchStreamlabsDonations,
  getNewStreamlabsDonationEvents,
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

let activeStreamElementsSocket: WebSocket | null = null
let activeStreamElementsReconnectTimer: number | null = null
let desiredStreamElementsConnection: StreamElementsTipConnection | null = null

let activeStreamlabsPollTimer: number | null = null
let desiredStreamlabsConnection: StreamlabsTipConnection | null = null
let lastSeenStreamlabsDonationId: string | null = null

function trimSecret(value: string) {
  return value.trim()
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

function clearStreamlabsPollTimer() {
  if (activeStreamlabsPollTimer === null) {
    return
  }

  window.clearTimeout(activeStreamlabsPollTimer)
  activeStreamlabsPollTimer = null
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
            void connectStreamElementsRuntime(connection, `${STREAMELEMENTS_SOCKET_URL}?reconnect_token=${encodeURIComponent(reconnectToken)}`)
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
        streamelementsLastError: error instanceof Error ? error.message : 'Unable to connect StreamElements tips.',
      })
    }
  }

  const connectStreamlabsRuntime = async (connection: StreamlabsTipConnection) => {
    desiredStreamlabsConnection = connection
    clearStreamlabsPollTimer()
    lastSeenStreamlabsDonationId = null

    set({
      streamlabsStatus: 'connecting',
      streamlabsLastError: null,
    })

    try {
      const primeDonations = await fetchStreamlabsDonations(connection.accessToken)

      if (desiredStreamlabsConnection !== connection) {
        return
      }

      lastSeenStreamlabsDonationId = primeDonations[0]?.donationId ?? null

      set({
        streamlabsStatus: 'connected',
        streamlabsLastError: null,
      })

      const poll = async () => {
        if (!desiredStreamlabsConnection) {
          return
        }

        try {
          const donations = await fetchStreamlabsDonations(connection.accessToken)
          if (!desiredStreamlabsConnection) {
            return
          }

          const normalizedEvents = getNewStreamlabsDonationEvents(donations, lastSeenStreamlabsDonationId)
          lastSeenStreamlabsDonationId = donations[0]?.donationId ?? lastSeenStreamlabsDonationId

          if (normalizedEvents.length > 0) {
            const notifications = normalizedEvents.map((event) => summarizeStreamlabsTip(event))
            const occurredAt = notifications[0]?.occurredAt ?? Date.now()

            set((state) => ({
              streamlabsStatus: 'connected',
              streamlabsLastError: null,
              streamlabsLastEventAt: occurredAt,
              normalizedEvents: prependNormalizedEvents(normalizedEvents, state.normalizedEvents),
              recentNotifications: prependNotifications(notifications, state.recentNotifications),
            }))
          } else {
            set({
              streamlabsStatus: 'connected',
              streamlabsLastError: null,
            })
          }
        } catch (error) {
          set({
            streamlabsStatus: 'error',
            streamlabsLastError:
              error instanceof Error ? error.message : 'Unable to refresh Streamlabs donations.',
          })
        } finally {
          if (desiredStreamlabsConnection) {
            activeStreamlabsPollTimer = window.setTimeout(() => {
              void poll()
            }, 15_000)
          }
        }
      }

      activeStreamlabsPollTimer = window.setTimeout(() => {
        void poll()
      }, 15_000)
    } catch (error) {
      set({
        streamlabsStatus: 'error',
        streamlabsLastError: error instanceof Error ? error.message : 'Unable to connect Streamlabs tips.',
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
          streamelementsLastError: error instanceof Error ? error.message : 'Unable to load saved tip provider settings.',
        })
      }
    },

    connectStreamElements: async (connection) => {
      const nextConnection = {
        token: trimSecret(connection.token),
        tokenType: connection.tokenType,
      } satisfies StreamElementsTipConnection

      if (!nextConnection.token) {
        set({
          streamelementsStatus: 'error',
          streamelementsLastError: 'Paste a StreamElements websocket token before connecting.',
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
      const nextConnection = {
        accessToken: trimSecret(connection.accessToken),
      } satisfies StreamlabsTipConnection

      if (!nextConnection.accessToken) {
        set({
          streamlabsStatus: 'error',
          streamlabsLastError: 'Paste a Streamlabs access token before connecting.',
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
      clearStreamlabsPollTimer()
      lastSeenStreamlabsDonationId = null

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
