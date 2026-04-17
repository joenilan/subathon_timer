import { create } from 'zustand'
import {
  buildSharedSessionSocketUrl,
  checkSharedSessionHealth,
  createSharedSession,
  DEFAULT_SHARED_SESSION_HTTP_BASE,
  joinSharedSession,
  rejoinSharedSession,
} from '../lib/sharedSession/client'
import type {
  SharedParticipantRuntimeState,
  SharedSessionCreateInput,
  SharedSessionJoinInput,
  SharedSessionRole,
  SharedSessionServiceHealth,
  SharedSessionSnapshot,
  SharedSessionSocketClientMessage,
  SharedSessionSocketServerMessage,
  SharedSessionTipEventMessage,
  SharedSessionWheelActionMessage,
  SharedSessionTwitchEventMessage,
} from '../lib/sharedSession/types'
import type { NormalizedTwitchEvent } from '../lib/timer/types'

const RECONNECT_MAX_ATTEMPTS = 3
const RECONNECT_DELAY_MS = [1000, 3000, 9000] as const

let activeSharedSessionSocket: WebSocket | null = null
let reconnectAttempt = 0
let reconnectTimer: ReturnType<typeof setTimeout> | null = null

function clearReconnectTimer() {
  if (reconnectTimer !== null) {
    clearTimeout(reconnectTimer)
    reconnectTimer = null
  }
}

function closeSharedSessionSocket() {
  clearReconnectTimer()

  if (!activeSharedSessionSocket) {
    return
  }

  activeSharedSessionSocket.onopen = null
  activeSharedSessionSocket.onmessage = null
  activeSharedSessionSocket.onerror = null
  activeSharedSessionSocket.onclose = null
  activeSharedSessionSocket.close()
  activeSharedSessionSocket = null
}

export interface SharedSessionState {
  serviceUrl: string
  serviceHealth: SharedSessionServiceHealth
  serviceMessage: string | null
  status: 'idle' | 'creating' | 'joining' | 'connecting' | 'connected' | 'reconnecting' | 'error'
  session: SharedSessionSnapshot | null
  localParticipantId: string | null
  localSessionId: string | null
  localRole: SharedSessionRole | null
  joinToken: string | null
  lastError: string | null

  checkHealth: () => Promise<void>
  createSession: (input: SharedSessionCreateInput) => Promise<void>
  joinSession: (input: SharedSessionJoinInput) => Promise<void>
  rejoinSession: () => Promise<void>
  leaveSession: () => void
  clearError: () => void
  syncParticipantStatus: (payload: SharedParticipantRuntimeState) => void
  submitSharedTwitchEvent: (event: NormalizedTwitchEvent) => boolean
  submitSharedTipEvent: (event: NormalizedTwitchEvent) => boolean
  applySharedWheelTimeout: (payload: {
    activeSegmentId: string
    targetUserId: string
    targetLabel: string
    targetMention: string
    durationSeconds: number
  }) => boolean
  failSharedWheelTimeout: (payload: { activeSegmentId: string; message: string }) => boolean
  startSharedTimer: () => void
  pauseSharedTimer: () => void
  resetSharedTimer: () => void
  adjustSharedTimer: (deltaSeconds: number, reason: string) => void
  setSharedTimer: (timerSeconds: number, reason: string) => void
  endSharedSession: () => void
}

export const useSharedSessionStore = create<SharedSessionState>((set, get) => {
  const sendSocketMessage = (message: SharedSessionSocketClientMessage) => {
    if (!activeSharedSessionSocket || activeSharedSessionSocket.readyState !== WebSocket.OPEN) {
      set({
        status: 'error',
        lastError: 'The shared session connection is not open.',
      })
      return false
    }

    activeSharedSessionSocket.send(JSON.stringify(message))
    return true
  }

  const connectRealtime = (joinToken: string, participantId: string, role: SharedSessionRole, sessionId: string) => {
    closeSharedSessionSocket()

    set({
      status: 'connecting',
      lastError: null,
      localParticipantId: participantId,
      localSessionId: sessionId,
      localRole: role,
      joinToken,
    })

    const socket = new WebSocket(buildSharedSessionSocketUrl(get().serviceUrl, joinToken))
    activeSharedSessionSocket = socket

    socket.onopen = () => {
      reconnectAttempt = 0
      socket.send(JSON.stringify({ type: 'hello' }))
    }

    socket.onmessage = (event) => {
      const message = JSON.parse(String(event.data)) as SharedSessionSocketServerMessage

      if (message.type === 'session.snapshot') {
        set({
          status: 'connected',
          session: message.payload,
          serviceHealth: 'online',
          serviceMessage: 'Shared session service reachable.',
          lastError: null,
        })
        return
      }

      if (message.type === 'session.ended') {
        closeSharedSessionSocket()
        set({
          status: 'idle',
          session: null,
          localParticipantId: null,
          localSessionId: null,
          localRole: null,
          joinToken: null,
          lastError: 'The host ended the shared session.',
        })
        return
      }

      if (message.type === 'session.error') {
        set({
          status: 'error',
          lastError: message.payload.message,
        })
      }
    }

    socket.onerror = () => {
      set({
        status: 'error',
        lastError: 'The shared session connection could not be opened.',
      })
    }

    socket.onclose = () => {
      activeSharedSessionSocket = null

      const state = get()

      // No session means this was a clean leave — do not reconnect.
      if (!state.session) {
        set((s) => ({ ...s, status: s.status === 'connecting' ? 'error' : 'idle' }))
        return
      }

      // session.ended message already handled — if we're already idle, don't clobber that state.
      if (state.status === 'idle') {
        return
      }

      // Attempt auto-reconnect if we have the stored token and have not exhausted retries.
      const storedToken = state.joinToken
      if (storedToken && reconnectAttempt < RECONNECT_MAX_ATTEMPTS) {
        const delay = RECONNECT_DELAY_MS[reconnectAttempt] ?? 9000
        reconnectAttempt += 1

        set({ status: 'reconnecting', lastError: null })

        clearReconnectTimer()
        reconnectTimer = setTimeout(() => {
          reconnectTimer = null
          const current = get()

          // If the user manually left during the backoff window, abort.
          if (!current.session || !current.localParticipantId || !current.localSessionId || !current.localRole) {
            return
          }

          connectRealtime(
            storedToken,
            current.localParticipantId,
            current.localRole,
            current.localSessionId,
          )
        }, delay)

        return
      }

      set({
        status: 'error',
        lastError: 'The shared session connection closed. You may need to rejoin.',
      })
    }
  }

  return {
    serviceUrl: DEFAULT_SHARED_SESSION_HTTP_BASE,
    serviceHealth: 'unknown',
    serviceMessage: null,
    status: 'idle',
    session: null,
    localParticipantId: null,
    localSessionId: null,
    localRole: null,
    joinToken: null,
    lastError: null,

    checkHealth: async () => {
      set({
        serviceHealth: 'checking',
        serviceMessage: 'Checking the shared session service.',
      })

      try {
        const response = await checkSharedSessionHealth(get().serviceUrl)
        set({
          serviceHealth: 'online',
          serviceMessage: `${response.name} is ready. ${response.activeSessions} active session${response.activeSessions === 1 ? '' : 's'} right now.`,
        })
      } catch (error) {
        set({
          serviceHealth: 'offline',
          serviceMessage:
            error instanceof Error && error.message.trim().length > 0
              ? error.message
              : 'The shared session service is unreachable.',
        })
      }
    },

    createSession: async (input) => {
      set({ status: 'creating', lastError: null })

      try {
        const response = await createSharedSession(get().serviceUrl, input)
        connectRealtime(
          response.joinToken,
          response.participantId,
          'host',
          response.session.id,
        )
      } catch (error) {
        set({
          status: 'error',
          lastError:
            error instanceof Error && error.message.trim().length > 0
              ? error.message
              : 'Unable to create the shared session.',
        })
      }
    },

    joinSession: async (input) => {
      set({ status: 'joining', lastError: null })

      try {
        const response = await joinSharedSession(get().serviceUrl, input)
        connectRealtime(
          response.joinToken,
          response.participantId,
          'guest',
          response.session.id,
        )
      } catch (error) {
        set({
          status: 'error',
          lastError:
            error instanceof Error && error.message.trim().length > 0
              ? error.message
              : 'Unable to join the shared session.',
        })
      }
    },

    rejoinSession: async () => {
      const { localSessionId, localParticipantId, localRole, serviceUrl } = get()

      if (!localSessionId || !localParticipantId || !localRole) {
        set({
          status: 'error',
          lastError: 'No session to rejoin. Use an invite code instead.',
        })
        return
      }

      set({ status: 'connecting', lastError: null })
      reconnectAttempt = 0

      try {
        const response = await rejoinSharedSession(serviceUrl, localSessionId, localParticipantId)
        connectRealtime(response.joinToken, localParticipantId, localRole, localSessionId)
      } catch (error) {
        set({
          status: 'error',
          lastError:
            error instanceof Error && error.message.trim().length > 0
              ? error.message
              : 'Unable to rejoin the shared session. It may have ended.',
        })
      }
    },

    leaveSession: () => {
      reconnectAttempt = 0
      closeSharedSessionSocket()
      set({
        status: 'idle',
        session: null,
        localParticipantId: null,
        localSessionId: null,
        localRole: null,
        joinToken: null,
        lastError: null,
      })
    },

    clearError: () => set({ lastError: null }),

    syncParticipantStatus: (payload) => {
      sendSocketMessage({
        type: 'participant.status',
        payload,
      })
    },

    submitSharedTwitchEvent: (event) =>
      sendSocketMessage({
        type: 'twitch.event',
        payload: event,
      } satisfies SharedSessionTwitchEventMessage),

    submitSharedTipEvent: (event) =>
      sendSocketMessage({
        type: 'tip.event',
        payload: event,
      } satisfies SharedSessionTipEventMessage),

    applySharedWheelTimeout: (payload) =>
      sendSocketMessage({
        type: 'wheel.action',
        payload: {
          action: 'apply-timeout',
          ...payload,
        },
      } satisfies SharedSessionWheelActionMessage),

    failSharedWheelTimeout: (payload) =>
      sendSocketMessage({
        type: 'wheel.action',
        payload: {
          action: 'fail-timeout',
          ...payload,
        },
      } satisfies SharedSessionWheelActionMessage),

    startSharedTimer: () => {
      sendSocketMessage({
        type: 'timer.action',
        payload: { action: 'start' satisfies SharedTimerActionPayload['action'] },
      })
    },

    pauseSharedTimer: () => {
      sendSocketMessage({
        type: 'timer.action',
        payload: { action: 'pause' satisfies SharedTimerActionPayload['action'] },
      })
    },

    resetSharedTimer: () => {
      sendSocketMessage({
        type: 'timer.action',
        payload: { action: 'reset' satisfies SharedTimerActionPayload['action'] },
      })
    },

    adjustSharedTimer: (deltaSeconds, reason) => {
      sendSocketMessage({
        type: 'timer.action',
        payload: {
          action: 'adjust',
          deltaSeconds: Math.round(deltaSeconds),
          reason,
        },
      })
    },

    setSharedTimer: (timerSeconds, reason) => {
      sendSocketMessage({
        type: 'timer.action',
        payload: {
          action: 'set',
          timerSeconds: Math.max(0, Math.round(timerSeconds)),
          reason,
        },
      })
    },

    endSharedSession: () => {
      sendSocketMessage({ type: 'session.end' } as SharedSessionSocketClientMessage)
    },
  }
})

type SharedTimerActionPayload =
  | { action: 'start' }
  | { action: 'pause' }
  | { action: 'reset' }
  | { action: 'adjust'; deltaSeconds: number; reason: string }
  | { action: 'set'; timerSeconds: number; reason: string }
