import { useEffect, useRef } from 'react'
import { useAppStore } from '../state/useAppStore'
import { useSharedSessionStore } from '../state/useSharedSessionStore'

export function useSharedSessionLifecycle() {
  const sharedSessionEnabled = useAppStore((state) => state.sharedSessionEnabled)
  const leaveSession = useSharedSessionStore((state) => state.leaveSession)

  // Track previous value so we only trigger cleanup on the transition false
  const prevEnabled = useRef(sharedSessionEnabled)

  useEffect(() => {
    if (prevEnabled.current && !sharedSessionEnabled) {
      leaveSession()
    }
    prevEnabled.current = sharedSessionEnabled
  }, [sharedSessionEnabled, leaveSession])
}
