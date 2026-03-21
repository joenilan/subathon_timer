import { create } from 'zustand'
import { openUrl } from '@tauri-apps/plugin-opener'
import {
  refreshAccessToken,
  requestDeviceCode,
  pollDeviceCode,
  TwitchRefreshRejectedError,
  TwitchUnauthorizedError,
  validateAccessToken,
} from '../lib/twitch/client'
import {
  buildNativeTwitchSessionSnapshot,
  clearNativeTwitchSessionSnapshot,
  loadNativeTwitchSessionSnapshot,
  saveNativeTwitchSessionSnapshot,
} from '../lib/platform/nativeTwitchSession'
import { TWITCH_CLIENT_ID, TWITCH_REFRESH_EARLY_MS, TWITCH_SCOPES } from '../lib/twitch/constants'
import type {
  TwitchAuthStatus,
  TwitchDeviceCodeFlow,
  TwitchTokenSet,
  TwitchValidatedSession,
} from '../lib/twitch/types'

type PollOutcome = 'pending' | 'slow_down' | 'success' | 'expired' | 'denied' | 'error'

export interface TwitchSessionState {
  clientId: string
  status: TwitchAuthStatus
  tokens: TwitchTokenSet | null
  session: TwitchValidatedSession | null
  deviceFlow: TwitchDeviceCodeFlow | null
  lastError: string | null
  isBootstrapped: boolean

  bootstrap: () => Promise<void>
  startDeviceAuth: () => Promise<void>
  openVerificationUri: () => Promise<void>
  pollDeviceAuth: () => Promise<PollOutcome>
  validateSession: (options?: { allowRefresh?: boolean }) => Promise<boolean>
  refreshSession: () => Promise<boolean>
  disconnect: () => void
  clearError: () => void
}

function messageFromError(error: unknown, fallback: string) {
  if (error instanceof Error && error.message.trim().length > 0) {
    return error.message
  }

  return fallback
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

async function persistNativeSessionState(input: {
  tokens: TwitchTokenSet | null
  session: TwitchValidatedSession | null
}) {
  if (!input.tokens && !input.session) {
    await clearNativeTwitchSessionSnapshot()
    return
  }

  await saveNativeTwitchSessionSnapshot(buildNativeTwitchSessionSnapshot(input))
}

export const useTwitchSessionStore = create<TwitchSessionState>()((set, get) => ({
  clientId: TWITCH_CLIENT_ID,
  status: 'idle',
  tokens: null,
  session: null,
  deviceFlow: null,
  lastError: null,
  isBootstrapped: false,

  bootstrap: async () => {
    if (get().isBootstrapped) {
      return
    }

    try {
      const restored = await loadNativeTwitchSessionSnapshot()

      if (restored) {
        set({
          tokens: restored.tokens,
          session: restored.session,
        })
      }
    } catch (error) {
      set({
        status: 'error',
        lastError: messageFromError(error, 'Unable to load the saved Twitch session.'),
        isBootstrapped: true,
      })
      return
    }

    set({ isBootstrapped: true })

    if (!get().tokens) {
      set({ status: 'idle' })
      return
    }

    set({ status: 'bootstrapping', lastError: null })
    await get().validateSession()
  },

  startDeviceAuth: async () => {
    set({
      status: 'authorizing',
      lastError: null,
      deviceFlow: null,
    })

    try {
      const deviceFlow = await requestDeviceCode(get().clientId, TWITCH_SCOPES)
      set({ deviceFlow, status: 'authorizing' })
      await openExternalUrl(deviceFlow.verificationUri)
    } catch (error) {
      set({
        status: 'error',
        deviceFlow: null,
        lastError: messageFromError(error, 'Unable to begin Twitch authorization.'),
      })
    }
  },

  openVerificationUri: async () => {
    const deviceFlow = get().deviceFlow

    if (!deviceFlow) {
      return
    }

    await openExternalUrl(deviceFlow.verificationUri)
  },

  pollDeviceAuth: async () => {
    const deviceFlow = get().deviceFlow

    if (!deviceFlow) {
      return 'expired'
    }

    if (Date.now() >= deviceFlow.expiresAt) {
      set({
        status: 'reconnect-required',
        deviceFlow: null,
        lastError: 'The Twitch code expired. Start a new connection.',
      })
      return 'expired'
    }

    try {
      const result = await pollDeviceCode(get().clientId, deviceFlow.deviceCode, TWITCH_SCOPES)

      if (result.kind === 'pending') {
        return 'pending'
      }

      if (result.kind === 'slow_down') {
        return 'slow_down'
      }

      if (result.kind === 'expired') {
        set({
          status: 'reconnect-required',
          deviceFlow: null,
          lastError: 'The Twitch code expired. Start a new connection.',
        })
        return 'expired'
      }

      if (result.kind === 'denied') {
        set({
          status: 'reconnect-required',
          deviceFlow: null,
          lastError: 'The Twitch authorization request was denied.',
        })
        return 'denied'
      }

      const tokens = {
        accessToken: result.tokens.accessToken,
        refreshToken: result.tokens.refreshToken,
        expiresAt: result.tokens.expiresAt,
      } satisfies TwitchTokenSet

      set({
        tokens,
        session: null,
        deviceFlow: null,
        status: 'bootstrapping',
        lastError: null,
      })

      await persistNativeSessionState({
        tokens,
        session: null,
      })

      await get().validateSession({ allowRefresh: false })
      return 'success'
    } catch (error) {
      set({
        status: 'error',
        deviceFlow: null,
        lastError: messageFromError(error, 'Unable to complete Twitch authorization.'),
      })
      return 'error'
    }
  },

  validateSession: async (options) => {
    const allowRefresh = options?.allowRefresh ?? true
    const tokens = get().tokens

    if (!tokens) {
      set({ status: 'idle', session: null })
      await clearNativeTwitchSessionSnapshot()
      return false
    }

    if (allowRefresh && tokens.expiresAt <= Date.now() + TWITCH_REFRESH_EARLY_MS) {
      return get().refreshSession()
    }

    try {
      const session = await validateAccessToken(tokens.accessToken)

      set({
        session,
        status: 'connected',
        lastError: null,
      })

      await persistNativeSessionState({
        tokens: get().tokens,
        session,
      })

      return true
    } catch (error) {
      if (error instanceof TwitchUnauthorizedError && allowRefresh) {
        return get().refreshSession()
      }

      set({
        status: error instanceof TwitchUnauthorizedError ? 'reconnect-required' : 'error',
        lastError: messageFromError(
          error,
          error instanceof TwitchUnauthorizedError
            ? 'Reconnect Twitch to continue.'
            : 'Unable to validate the saved Twitch session.',
        ),
      })
      return false
    }
  },

  refreshSession: async () => {
    const tokens = get().tokens

    if (!tokens?.refreshToken) {
      set({
        status: 'reconnect-required',
        lastError: 'Reconnect Twitch to continue.',
      })
      await clearNativeTwitchSessionSnapshot()
      return false
    }

    set({ status: 'refreshing', lastError: null })

    try {
      const refreshed = await refreshAccessToken(get().clientId, tokens.refreshToken)
      const nextTokens = {
        accessToken: refreshed.accessToken,
        refreshToken: refreshed.refreshToken,
        expiresAt: refreshed.expiresAt,
      } satisfies TwitchTokenSet

      set({
        tokens: nextTokens,
      })

      await persistNativeSessionState({
        tokens: nextTokens,
        session: get().session,
      })

      return get().validateSession({ allowRefresh: false })
    } catch (error) {
      if (error instanceof TwitchRefreshRejectedError) {
        set({
          status: 'reconnect-required',
          tokens: null,
          session: null,
          deviceFlow: null,
          lastError: messageFromError(error, 'Reconnect Twitch to continue.'),
        })
        await clearNativeTwitchSessionSnapshot()
        return false
      }

      set({
        status: 'error',
        lastError: messageFromError(error, 'Unable to refresh the saved Twitch session.'),
      })
      return false
    }
  },

  disconnect: () => {
    set({
      status: 'idle',
      tokens: null,
      session: null,
      deviceFlow: null,
      lastError: null,
    })

    void clearNativeTwitchSessionSnapshot()
  },

  clearError: () => set({ lastError: null }),
}))
