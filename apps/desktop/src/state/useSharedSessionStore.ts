import { create } from 'zustand'
import {
  buildSharedSessionSocketUrl,
  checkSharedSessionHealth,
  createSharedSession,
  DEFAULT_SHARED_SESSION_HTTP_BASE,
  joinSharedSession,
} from '../lib/sharedSession/client'
import type {
  SharedParticipantRuntimeState,
  SharedSessionCreateInput,
  SharedSessionJoinInput,
  SharedSessionRole,
  SharedSessionServiceHealth,
  SharedSessionSnapshot,
  SharedSessionSocketServerMessage,
} from '../lib/sharedSession/types'

let activeSharedSessionSocket: WebSocket | null = null

function closeSharedSessionSocket() {
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
  status: 'idle' | 'creating' | 'joining' | 'connecting' | 'connected' | 'error'
  session: SharedSessionSnapshot | null
  localParticipantId: string | null
  localRole: SharedSessionRole | null
  lastError: string | null

  checkHealth: () => Promise<void>
  createSession: (input: SharedSessionCreateInput) => Promise<void>
  joinSession: (input: SharedSessionJoinInput) => Promise<void>
  leaveSession: () => void
  clearError: () => void
  syncParticipantStatus: (payload: SharedParticipantRuntimeState) => void
}

export const useSharedSessionStore = create<SharedSessionState>((set, get) => {
  const connectRealtime = (joinToken: string, participantId: string, role: SharedSessionRole) => {
    closeSharedSessionSocket()

    set({
      status: 'connecting',
      lastError: null,
      localParticipantId: participantId,
      localRole: role,
    })

    const socket = new WebSocket(buildSharedSessionSocketUrl(get().serviceUrl, joinToken))
    activeSharedSessionSocket = socket

    socket.onopen = () => {
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

      set((state) => ({
        ...state,
        status: state.session ? 'error' : 'idle',
        lastError: state.session ? 'The shared session connection closed.' : null,
      }))
    }
  }

  return {
    serviceUrl: DEFAULT_SHARED_SESSION_HTTP_BASE,
    serviceHealth: 'unknown',
    serviceMessage: null,
    status: 'idle',
    session: null,
    localParticipantId: null,
    localRole: null,
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
        connectRealtime(response.joinToken, response.participantId, 'host')
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
        connectRealtime(response.joinToken, response.participantId, 'guest')
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

    leaveSession: () => {
      closeSharedSessionSocket()
      set({
        status: 'idle',
        session: null,
        localParticipantId: null,
        localRole: null,
        lastError: null,
      })
    },

    clearError: () => set({ lastError: null }),

    syncParticipantStatus: (payload) => {
      if (!activeSharedSessionSocket || activeSharedSessionSocket.readyState !== WebSocket.OPEN) {
        return
      }

      activeSharedSessionSocket.send(
        JSON.stringify({
          type: 'participant.status',
          payload,
        }),
      )
    },
  }
})
