import { useEffect } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { TWITCH_REFRESH_EARLY_MS, TWITCH_VALIDATE_INTERVAL_MS } from '../lib/twitch/constants'
import { selectTwitchLifecycleState } from '../state/selectors'
import { useTwitchSessionStore } from '../state/useTwitchSessionStore'

export function useTwitchSessionLifecycle() {
  const {
    isBootstrapped,
    authStatus,
    deviceFlow,
    tokens,
    pollDeviceAuth,
    refreshSession,
    validateSession,
  } = useTwitchSessionStore(useShallow(selectTwitchLifecycleState))

  useEffect(() => {
    if (!isBootstrapped) {
      return
    }

    const timer = window.setInterval(() => {
      void validateSession()
    }, TWITCH_VALIDATE_INTERVAL_MS)

    return () => window.clearInterval(timer)
  }, [isBootstrapped, validateSession])

  useEffect(() => {
    if (!isBootstrapped || authStatus !== 'connected' || !tokens?.refreshToken) {
      return
    }

    const refreshDelayMs = Math.max(0, tokens.expiresAt - Date.now() - TWITCH_REFRESH_EARLY_MS)
    const timer = window.setTimeout(() => {
      void refreshSession()
    }, refreshDelayMs)

    return () => window.clearTimeout(timer)
  }, [authStatus, isBootstrapped, refreshSession, tokens?.expiresAt, tokens?.refreshToken])

  useEffect(() => {
    if (authStatus !== 'authorizing' || !deviceFlow) {
      return
    }

    let cancelled = false
    let delayMs = Math.max(deviceFlow.intervalSeconds, 4) * 1000

    const run = async () => {
      while (!cancelled) {
        await new Promise((resolve) => window.setTimeout(resolve, delayMs))

        if (cancelled) {
          return
        }

        const result = await pollDeviceAuth()

        if (result === 'pending') {
          continue
        }

        if (result === 'slow_down') {
          delayMs += 5000
          continue
        }

        return
      }
    }

    void run()

    return () => {
      cancelled = true
    }
  }, [authStatus, deviceFlow, pollDeviceAuth])
}
