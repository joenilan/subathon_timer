import { useEffect } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { useAppStore } from '../state/useAppStore'
import { selectTipLifecycleState } from '../state/selectors'
import { useTipSessionStore } from '../state/useTipSessionStore'

export function useTipSessionLifecycle(nativeStateReady: boolean) {
  const { bootstrap, normalizedEvents } = useTipSessionStore(useShallow(selectTipLifecycleState))
  const processTwitchEvent = useAppStore((state) => state.processTwitchEvent)

  useEffect(() => {
    void bootstrap()
  }, [bootstrap])

  useEffect(() => {
    if (!nativeStateReady) {
      return
    }

    for (const event of normalizedEvents) {
      processTwitchEvent(event)
    }
  }, [nativeStateReady, normalizedEvents, processTwitchEvent])
}
