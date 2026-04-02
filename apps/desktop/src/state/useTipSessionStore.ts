import { openUrl } from '@tauri-apps/plugin-opener'
import { create } from 'zustand'
import {
  buildNativeTipProviderSnapshot,
  clearNativeTipProviderSnapshot,
  loadNativeTipProviderSnapshot,
  saveNativeTipProviderSnapshot,
} from '../lib/platform/nativeTipSession'
import {
  cancelNativeStreamlabsOAuth,
  consumeNativeStreamlabsOAuthResult,
  STREAMLABS_DEFAULT_REDIRECT_URI,
} from '../lib/platform/nativeStreamlabsAuth'
import {
  exchangeStreamlabsBridgeOAuth,
  getTipAuthBridgeBaseUrl,
  getTipAuthBridgeHealth,
  refreshStreamlabsBridgeOAuth,
  startStreamlabsBridgeOAuth,
} from '../lib/tips/authBridge'
import {
  buildStreamElementsSubscribeMessage,
  normalizeStreamElementsTipMessage,
  parseStreamElementsSocketEnvelope,
  summarizeStreamElementsTip,
} from '../lib/tips/streamelements'
import {
  fetchStreamlabsDonations,
  getNewStreamlabsDonationEvents,
  StreamlabsDonationsRequestError,
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
let activeStreamlabsAuthPollTimer: number | null = null
let desiredStreamlabsConnection: StreamlabsTipConnection | null = null
let activeStreamlabsRuntimeId = 0
let lastSeenStreamlabsDonationId: string | null = null

function trimSecret(value: string) {
  return value.trim()
}

function normalizeStreamlabsConnection(connection: StreamlabsTipConnection): StreamlabsTipConnection {
  return {
    accessToken: trimSecret(connection.accessToken),
    refreshToken: connection.refreshToken ? trimSecret(connection.refreshToken) : null,
    tokenType: connection.tokenType ? trimSecret(connection.tokenType) : null,
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

function clearStreamlabsPollTimer() {
  if (activeStreamlabsPollTimer === null) {
    return
  }

  window.clearTimeout(activeStreamlabsPollTimer)
  activeStreamlabsPollTimer = null
}

function clearStreamlabsAuthPollTimer() {
  if (activeStreamlabsAuthPollTimer === null) {
    return
  }

  window.clearTimeout(activeStreamlabsAuthPollTimer)
  activeStreamlabsAuthPollTimer = null
}

async function openExternalUrl(url: string) {
  try {
    if ('__TAURI_INTERNALS__' in window) {
      await openUrl(url)
      return
    }
  } catch {
    // Fall back to the browser path below.
  }

  window.open(url, '_blank', 'noopener,noreferrer')
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
  streamlabsAuthorizationPending: boolean
  streamlabsBridgeUrl: string
  streamlabsBridgeReachable: boolean | null
  streamlabsBridgeLastError: string | null
  streamlabsConnection: StreamlabsTipConnection | null
  streamlabsStatus: TipProviderStatus
  streamlabsLastError: string | null
  streamlabsLastEventAt: number | null
  recentNotifications: TipProviderNotification[]
  normalizedEvents: NormalizedTimerEvent[]

  bootstrap: () => Promise<void>
  checkStreamlabsBridge: () => Promise<boolean>
  connectStreamElements: (connection: StreamElementsTipConnection) => Promise<void>
  startStreamlabsOAuth: () => Promise<void>
  disconnectProvider: (provider: 'streamelements' | 'streamlabs') => Promise<void>
  clearError: (provider: 'streamelements' | 'streamlabs') => void
}

export const useTipSessionStore = create<TipSessionState>((set, get) => {
  const isActiveStreamlabsRuntime = (runtimeId: number) =>
    desiredStreamlabsConnection !== null && activeStreamlabsRuntimeId === runtimeId

  const checkStreamlabsBridge = async () => {
    try {
      const health = await getTipAuthBridgeHealth()
      if (!health.streamlabsEnabled) {
        set({
          streamlabsBridgeUrl: health.baseUrl,
          streamlabsBridgeReachable: false,
          streamlabsBridgeLastError:
            'The auth bridge is reachable, but Streamlabs is not configured there. Set STREAMLABS_CLIENT_ID and STREAMLABS_CLIENT_SECRET on the bridge server.',
        })
        return false
      }

      set({
        streamlabsBridgeUrl: health.baseUrl,
        streamlabsBridgeReachable: true,
        streamlabsBridgeLastError: null,
      })
      return true
    } catch (error) {
      set({
        streamlabsBridgeUrl: getTipAuthBridgeBaseUrl(),
        streamlabsBridgeReachable: false,
        streamlabsBridgeLastError:
          error instanceof Error
            ? error.message
            : 'Unable to reach the Streamlabs auth bridge.',
      })
      return false
    }
  }

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
        streamelementsLastError: error instanceof Error ? error.message : 'Unable to connect StreamElements tips.',
      })
    }
  }

  const refreshStreamlabsRuntimeConnection = async (
    connection: StreamlabsTipConnection,
    runtimeId: number,
  ) => {
    if (!connection.refreshToken) {
      throw new Error('Streamlabs access expired. Reconnect Streamlabs to continue importing donations.')
    }

    const refreshed = normalizeStreamlabsConnection(
      await refreshStreamlabsBridgeOAuth(connection.refreshToken),
    )

    if (!isActiveStreamlabsRuntime(runtimeId)) {
      throw new Error('Streamlabs connection changed during token refresh.')
    }

    desiredStreamlabsConnection = refreshed

    set({
      streamlabsConnection: refreshed,
      streamlabsStatus: 'connected',
      streamlabsLastError: null,
    })

    await persistTipSnapshot({
      streamelements: get().streamelementsConnection,
      streamlabs: refreshed,
    })

    return refreshed
  }

  const fetchStreamlabsDonationsWithRefresh = async (
    connection: StreamlabsTipConnection,
    runtimeId: number,
  ) => {
    try {
      return {
        connection,
        donations: await fetchStreamlabsDonations(connection.accessToken),
      }
    } catch (error) {
      if (!(error instanceof StreamlabsDonationsRequestError) || error.status !== 401) {
        throw error
      }

      const refreshed = await refreshStreamlabsRuntimeConnection(connection, runtimeId)

      return {
        connection: refreshed,
        donations: await fetchStreamlabsDonations(refreshed.accessToken),
      }
    }
  }

  const connectStreamlabsRuntime = async (connection: StreamlabsTipConnection) => {
    const runtimeId = activeStreamlabsRuntimeId + 1
    activeStreamlabsRuntimeId = runtimeId
    desiredStreamlabsConnection = normalizeStreamlabsConnection(connection)
    clearStreamlabsPollTimer()
    lastSeenStreamlabsDonationId = null

    set({
      streamlabsStatus: 'connecting',
      streamlabsLastError: null,
    })

    try {
      const primeResult = await fetchStreamlabsDonationsWithRefresh(
        desiredStreamlabsConnection,
        runtimeId,
      )

      if (!isActiveStreamlabsRuntime(runtimeId)) {
        return
      }

      const primeDonations = primeResult.donations
      lastSeenStreamlabsDonationId = primeDonations[0]?.donationId ?? null

      set({
        streamlabsStatus: 'connected',
        streamlabsLastError: null,
      })

      const poll = async () => {
        const currentConnection = desiredStreamlabsConnection

        if (!currentConnection || !isActiveStreamlabsRuntime(runtimeId)) {
          return
        }

        try {
          const pollResult = await fetchStreamlabsDonationsWithRefresh(currentConnection, runtimeId)

          if (!isActiveStreamlabsRuntime(runtimeId)) {
            return
          }

          const donations = pollResult.donations
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
          if (isActiveStreamlabsRuntime(runtimeId)) {
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

  const pollStreamlabsOAuthResult = async () => {
    try {
      const result = await consumeNativeStreamlabsOAuthResult()

      if (!get().streamlabsAuthorizationPending) {
        return
      }

      if (!result) {
        activeStreamlabsAuthPollTimer = window.setTimeout(() => {
          void pollStreamlabsOAuthResult()
        }, 1000)
        return
      }

      clearStreamlabsAuthPollTimer()

      if (result.status !== 'success' || !result.code || !result.state) {
        set({
          streamlabsAuthorizationPending: false,
          streamlabsStatus: 'error',
          streamlabsLastError: result.error ?? 'Streamlabs authorization failed.',
        })
        return
      }

      const exchanged = await exchangeStreamlabsBridgeOAuth({
        code: result.code,
        state: result.state,
        redirectUri: STREAMLABS_DEFAULT_REDIRECT_URI,
      })

      const nextConnection = {
        accessToken: trimSecret(exchanged.accessToken),
        refreshToken: exchanged.refreshToken ? trimSecret(exchanged.refreshToken) : null,
        tokenType: exchanged.tokenType ? trimSecret(exchanged.tokenType) : null,
      } satisfies StreamlabsTipConnection

      set({
        streamlabsAuthorizationPending: false,
        streamlabsConnection: nextConnection,
        streamlabsStatus: 'connected',
        streamlabsLastError: null,
      })

      await persistTipSnapshot({
        streamelements: get().streamelementsConnection,
        streamlabs: nextConnection,
      })

      await connectStreamlabsRuntime(nextConnection)
    } catch (error) {
      clearStreamlabsAuthPollTimer()
      set({
        streamlabsAuthorizationPending: false,
        streamlabsStatus: 'error',
        streamlabsLastError:
          error instanceof Error ? error.message : 'Unable to finish Streamlabs authorization.',
      })
    }
  }

  return {
    isBootstrapped: false,
    streamelementsConnection: null,
    streamelementsStatus: 'idle',
    streamelementsLastError: null,
    streamelementsLastEventAt: null,
    streamlabsAuthorizationPending: false,
    streamlabsBridgeUrl: getTipAuthBridgeBaseUrl(),
    streamlabsBridgeReachable: null,
    streamlabsBridgeLastError: null,
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

        void checkStreamlabsBridge()
      } catch (error) {
        set({
          isBootstrapped: true,
          streamelementsStatus: 'error',
          streamelementsLastError: error instanceof Error ? error.message : 'Unable to load saved tip provider settings.',
        })
      }
    },

    checkStreamlabsBridge,

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

    startStreamlabsOAuth: async () => {
      const bridgeReady = await checkStreamlabsBridge()
      if (!bridgeReady) {
        set({
          streamlabsAuthorizationPending: false,
          streamlabsStatus: 'error',
          streamlabsLastError:
            get().streamlabsBridgeLastError ??
            'The Streamlabs auth bridge is unavailable. Start the bridge or point the app at the deployed bridge URL.',
        })
        return
      }

      set({
        streamlabsAuthorizationPending: true,
        streamlabsStatus: 'connecting',
        streamlabsLastError: null,
      })

      clearStreamlabsAuthPollTimer()
      await cancelNativeStreamlabsOAuth()

      try {
        const { authorizeUrl } = await startStreamlabsBridgeOAuth(STREAMLABS_DEFAULT_REDIRECT_URI)

        await openExternalUrl(authorizeUrl)
        activeStreamlabsAuthPollTimer = window.setTimeout(() => {
          void pollStreamlabsOAuthResult()
        }, 1000)
      } catch (error) {
        clearStreamlabsAuthPollTimer()
        set({
          streamlabsAuthorizationPending: false,
          streamlabsStatus: 'error',
          streamlabsLastError:
            error instanceof Error ? error.message : 'Unable to begin Streamlabs authorization.',
        })
      }
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

      clearStreamlabsAuthPollTimer()
      await cancelNativeStreamlabsOAuth()

      activeStreamlabsRuntimeId += 1
      desiredStreamlabsConnection = null
      clearStreamlabsPollTimer()
      lastSeenStreamlabsDonationId = null

      const nextStreamElementsConnection = get().streamelementsConnection
      set({
        streamlabsAuthorizationPending: false,
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
