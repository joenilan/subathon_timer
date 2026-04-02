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
  startNativeStreamlabsOAuth,
  STREAMLABS_DEFAULT_REDIRECT_URI,
} from '../lib/platform/nativeStreamlabsAuth'
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
  StreamlabsOAuthAppConfig,
  StreamlabsTipConnection,
  TipProviderNotification,
  TipProviderStatus,
} from '../lib/tips/types'
import type { NormalizedTimerEvent } from '../lib/timer/types'

const MAX_TIP_EVENTS = 24
const MAX_TIP_NOTIFICATIONS = 12
const STREAMELEMENTS_SOCKET_URL = 'wss://astro.streamelements.com/'
const STREAMLABS_OAUTH_SCOPES = ['donations.read']

let activeStreamElementsSocket: WebSocket | null = null
let activeStreamElementsReconnectTimer: number | null = null
let desiredStreamElementsConnection: StreamElementsTipConnection | null = null

let activeStreamlabsPollTimer: number | null = null
let activeStreamlabsAuthPollTimer: number | null = null
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
  streamlabsApp: StreamlabsOAuthAppConfig | null
  streamlabs: StreamlabsTipConnection | null
}) {
  if (!input.streamelements && !input.streamlabsApp && !input.streamlabs) {
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
  streamlabsAppConfig: StreamlabsOAuthAppConfig | null
  streamlabsAuthorizationPending: boolean
  streamlabsConnection: StreamlabsTipConnection | null
  streamlabsStatus: TipProviderStatus
  streamlabsLastError: string | null
  streamlabsLastEventAt: number | null
  recentNotifications: TipProviderNotification[]
  normalizedEvents: NormalizedTimerEvent[]

  bootstrap: () => Promise<void>
  connectStreamElements: (connection: StreamElementsTipConnection) => Promise<void>
  startStreamlabsOAuth: (config: StreamlabsOAuthAppConfig) => Promise<void>
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

      if (result.status !== 'success' || !result.accessToken) {
        set({
          streamlabsAuthorizationPending: false,
          streamlabsStatus: 'error',
          streamlabsLastError: result.error ?? 'Streamlabs authorization failed.',
        })
        return
      }

      const nextConnection = {
        accessToken: trimSecret(result.accessToken),
        refreshToken: result.refreshToken ? trimSecret(result.refreshToken) : null,
        tokenType: result.tokenType ? trimSecret(result.tokenType) : null,
      } satisfies StreamlabsTipConnection

      set({
        streamlabsAuthorizationPending: false,
        streamlabsConnection: nextConnection,
        streamlabsLastError: null,
      })

      await persistTipSnapshot({
        streamelements: get().streamelementsConnection,
        streamlabsApp: get().streamlabsAppConfig,
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
    streamlabsAppConfig: null,
    streamlabsAuthorizationPending: false,
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
          streamlabsAppConfig: snapshot?.streamlabsApp ?? null,
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
        streamlabsApp: get().streamlabsAppConfig,
        streamlabs: get().streamlabsConnection,
      })
      await connectStreamElementsRuntime(nextConnection)
    },

    startStreamlabsOAuth: async (config) => {
      const nextConfig = {
        clientId: trimSecret(config.clientId),
        clientSecret: trimSecret(config.clientSecret),
        redirectUri: trimSecret(config.redirectUri) || STREAMLABS_DEFAULT_REDIRECT_URI,
      } satisfies StreamlabsOAuthAppConfig

      if (!nextConfig.clientId || !nextConfig.clientSecret) {
        set({
          streamlabsStatus: 'error',
          streamlabsLastError: 'Enter the Streamlabs client ID and client secret before connecting.',
        })
        return
      }

      set({
        streamlabsAppConfig: nextConfig,
        streamlabsAuthorizationPending: true,
        streamlabsLastError: null,
      })

      await persistTipSnapshot({
        streamelements: get().streamelementsConnection,
        streamlabsApp: nextConfig,
        streamlabs: get().streamlabsConnection,
      })

      clearStreamlabsAuthPollTimer()
      await cancelNativeStreamlabsOAuth()

      try {
        const { authorizeUrl } = await startNativeStreamlabsOAuth({
          clientId: nextConfig.clientId,
          clientSecret: nextConfig.clientSecret,
          redirectUri: nextConfig.redirectUri,
          scopes: STREAMLABS_OAUTH_SCOPES,
        })

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
          streamlabsApp: get().streamlabsAppConfig,
          streamlabs: nextStreamlabsConnection,
        })
        return
      }

      clearStreamlabsAuthPollTimer()
      await cancelNativeStreamlabsOAuth()

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
        streamlabsApp: get().streamlabsAppConfig,
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
