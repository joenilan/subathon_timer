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
  SharedSessionTwitchEventMessage,
  SharedSessionWheelActionMessage,
} from '../lib/sharedSession/types'
import type { NormalizedTwitchEvent } from '../lib/timer/types'

const RECONNECT_MAX_ATTEMPTS = 4
const RECONNECT_DELAY_MS = [2000, 5000, 10000, 20000] as const

// ---- Module-level transport state (not in Zustand) -------------------------

let activeSocket: WebSocket | null = null
let reconnectAttempt = 0
let reconnectTimer: ReturnType<typeof setTimeout> | null = null

// Persisted so reconnect logic doesn't need to close over stale state.
let savedBaseUrl = DEFAULT_SHARED_SESSION_HTTP_BASE

function clearReconnectTimer() {
  if (reconnectTimer !== null) {
    clearTimeout(reconnectTimer)
    reconnectTimer = null
  }
}

function closeSocket() {
  clearReconnectTimer()
  if (activeSocket) {
    activeSocket.onopen = null
    activeSocket.onmessage = null
    activeSocket.onerror = null
    activeSocket.onclose = null
    activeSocket.close()
    activeSocket = null
  }
}

// ---- Store interface -------------------------------------------------------

export interface SharedSessionState {
  serviceUrl: string
  serviceHealth: SharedSessionServiceHealth
  serviceMessage: string | null
  status: 'idle' | 'creating' | 'joining' | 'connecting' | 'connected' | 'reconnecting' | 'error'
  session: SharedSessionSnapshot | null
  localParticipantId: string | null
  localSessionId: string | null
  localRole: SharedSessionRole | null
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
  // ---- Send a message to the server ----------------------------------------

  function sendToServer(message: SharedSessionSocketClientMessage): boolean {
    if (!activeSocket || activeSocket.readyState !== WebSocket.OPEN) {
      set({ status: 'error', lastError: 'The shared session connection is not open.' })
      return false
    }
    try {
      activeSocket.send(JSON.stringify(message))
      return true
    } catch {
      set({ status: 'error', lastError: 'Failed to send message to server.' })
      return false
    }
  }

  // ---- Open a WebSocket connection -----------------------------------------

  function openSocket(baseUrl: string, joinToken: string) {
    closeSocket()

    const socket = new WebSocket(buildSharedSessionSocketUrl(baseUrl, joinToken))
    activeSocket = socket

    socket.onmessage = (event) => {
      let message: SharedSessionSocketServerMessage
      try {
        message = JSON.parse(String(event.data)) as SharedSessionSocketServerMessage
      } catch {
        return
      }

      if (message.type === 'session.snapshot') {
        set({ status: 'connected', session: message.payload, lastError: null })
        return
      }

      if (message.type === 'session.ended') {
        // Clear saved state so onclose doesn't trigger reconnect.
        closeSocket()
        set({
          status: 'idle',
          session: null,
          localParticipantId: null,
          localSessionId: null,
          localRole: null,
          lastError: 'The host ended the shared session.',
        })
        return
      }

      if (message.type === 'session.error') {
        set({ status: 'error', lastError: message.payload.message })
      }
    }

    socket.onerror = () => {
      // onclose fires after onerror; handle reconnect there.
      set({ lastError: 'Shared session connection error.' })
    }

    socket.onclose = () => {
      activeSocket = null

      const state = get()
      // Don't reconnect if we intentionally left or the session already ended.
      if (!state.session || state.status === 'idle') return

      if (reconnectAttempt < RECONNECT_MAX_ATTEMPTS) {
        const delay = RECONNECT_DELAY_MS[reconnectAttempt] ?? 20000
        reconnectAttempt += 1
        set({ status: 'reconnecting', lastError: null })

        clearReconnectTimer()
        reconnectTimer = setTimeout(() => {
          reconnectTimer = null
          const current = get()
          if (!current.localSessionId || !current.localParticipantId) return
          void attemptRejoin(savedBaseUrl, current.localSessionId, current.localParticipantId)
        }, delay)
      } else {
        set({
          status: 'error',
          lastError: 'Lost connection to the server. Use Reconnect to try again.',
        })
      }
    }
  }

  // ---- Rejoin via HTTP then open a fresh socket ----------------------------

  async function attemptRejoin(baseUrl: string, sessionId: string, participantId: string) {
    try {
      const { joinToken, session } = await rejoinSharedSession(baseUrl, sessionId, participantId)
      reconnectAttempt = 0
      set({ session })
      openSocket(baseUrl, joinToken)
    } catch (error) {
      set({
        status: 'error',
        lastError:
          error instanceof Error && error.message
            ? error.message
            : 'Unable to reconnect to the shared session.',
      })
    }
  }

  // ---- Store ---------------------------------------------------------------

  return {
    serviceUrl: DEFAULT_SHARED_SESSION_HTTP_BASE,
    serviceHealth: 'unknown',
    serviceMessage: null,
    status: 'idle',
    session: null,
    localParticipantId: null,
    localSessionId: null,
    localRole: null,
    lastError: null,

    checkHealth: async () => {
      const baseUrl = savedBaseUrl
      set({ serviceHealth: 'checking', serviceMessage: 'Checking session server.' })
      try {
        const result = await checkSharedSessionHealth(baseUrl)
        if (result.ok) {
          set({
            serviceHealth: 'online',
            serviceUrl: baseUrl,
            serviceMessage: `Session server online. ${result.activeSessions} active session${result.activeSessions !== 1 ? 's' : ''}.`,
          })
        } else {
          set({
            serviceHealth: 'offline',
            serviceMessage: 'Session server unreachable. Check your internet connection.',
          })
        }
      } catch {
        set({ serviceHealth: 'offline', serviceMessage: 'Session server check failed.' })
      }
    },

    createSession: async (input) => {
      set({ status: 'creating', lastError: null })
      const baseUrl = savedBaseUrl

      try {
        const { session, participantId, joinToken } = await createSharedSession(baseUrl, input)

        set({
          status: 'connecting',
          session,
          localParticipantId: participantId,
          localSessionId: session.id,
          localRole: 'host',
          serviceHealth: 'online',
          serviceUrl: baseUrl,
          serviceMessage: null,
          lastError: null,
        })

        openSocket(baseUrl, joinToken)
      } catch (error) {
        closeSocket()
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
      const baseUrl = savedBaseUrl

      try {
        const { session, participantId, joinToken } = await joinSharedSession(baseUrl, input)

        set({
          status: 'connecting',
          session,
          localParticipantId: participantId,
          localSessionId: session.id,
          localRole: 'guest',
          serviceHealth: 'online',
          serviceUrl: baseUrl,
          serviceMessage: null,
          lastError: null,
        })

        openSocket(baseUrl, joinToken)
      } catch (error) {
        closeSocket()
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
      const { localSessionId, localParticipantId, localRole } = get()

      if (!localSessionId || !localParticipantId || !localRole) {
        set({ status: 'error', lastError: 'No session to rejoin. Use an invite code instead.' })
        return
      }

      set({ status: 'connecting', lastError: null })
      reconnectAttempt = 0
      await attemptRejoin(savedBaseUrl, localSessionId, localParticipantId)
    },

    leaveSession: () => {
      reconnectAttempt = 0
      closeSocket()
      set({
        status: 'idle',
        session: null,
        localParticipantId: null,
        localSessionId: null,
        localRole: null,
        lastError: null,
      })
    },

    clearError: () => set({ lastError: null }),

    syncParticipantStatus: (payload) => {
      sendToServer({ type: 'participant.status', payload })
    },

    submitSharedTwitchEvent: (event) =>
      sendToServer({
        type: 'twitch.event',
        payload: event,
      } satisfies SharedSessionTwitchEventMessage),

    submitSharedTipEvent: (event) =>
      sendToServer({
        type: 'tip.event',
        payload: event,
      } satisfies SharedSessionTipEventMessage),

    applySharedWheelTimeout: (payload) =>
      sendToServer({
        type: 'wheel.action',
        payload: { action: 'apply-timeout', ...payload },
      } satisfies SharedSessionWheelActionMessage),

    failSharedWheelTimeout: (payload) =>
      sendToServer({
        type: 'wheel.action',
        payload: { action: 'fail-timeout', ...payload },
      } satisfies SharedSessionWheelActionMessage),

    startSharedTimer: () => {
      sendToServer({ type: 'timer.action', payload: { action: 'start' } })
    },

    pauseSharedTimer: () => {
      sendToServer({ type: 'timer.action', payload: { action: 'pause' } })
    },

    resetSharedTimer: () => {
      sendToServer({ type: 'timer.action', payload: { action: 'reset' } })
    },

    adjustSharedTimer: (deltaSeconds, reason) => {
      sendToServer({
        type: 'timer.action',
        payload: { action: 'adjust', deltaSeconds: Math.round(deltaSeconds), reason },
      })
    },

    setSharedTimer: (timerSeconds, reason) => {
      sendToServer({
        type: 'timer.action',
        payload: {
          action: 'set',
          timerSeconds: Math.max(0, Math.round(timerSeconds)),
          reason,
        },
      })
    },

    endSharedSession: () => {
      sendToServer({ type: 'session.end' })
    },
  }
})
