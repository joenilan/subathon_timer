import { useEffect, useRef } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { useAppStore } from '../state/useAppStore'
import { selectSharedSessionIngressState, selectTipLifecycleState } from '../state/selectors'
import { useSharedSessionStore } from '../state/useSharedSessionStore'
import { useTipSessionStore } from '../state/useTipSessionStore'

export function useTipSessionLifecycle(nativeStateReady: boolean) {
  const seenEventIdsRef = useRef<Set<string>>(new Set())
  const { bootstrap, normalizedEvents } = useTipSessionStore(useShallow(selectTipLifecycleState))
  const processTwitchEvent = useAppStore((state) => state.processTwitchEvent)
  const { session: sharedSession, status: sharedSessionStatus, submitSharedTipEvent } = useSharedSessionStore(
    useShallow(selectSharedSessionIngressState),
  )

  useEffect(() => {
    void bootstrap()
  }, [bootstrap])

  useEffect(() => {
    if (!nativeStateReady) {
      return
    }

    const sharedModeActive = sharedSessionStatus === 'connected' && sharedSession !== null

    for (const event of normalizedEvents) {
      if (seenEventIdsRef.current.has(event.id)) {
        continue
      }

      if (sharedModeActive) {
        if (submitSharedTipEvent(event)) {
          seenEventIdsRef.current.add(event.id)
        }
        continue
      }

      processTwitchEvent(event)
      seenEventIdsRef.current.add(event.id)
    }
  }, [nativeStateReady, normalizedEvents, processTwitchEvent, sharedSession, sharedSessionStatus, submitSharedTipEvent])
}
