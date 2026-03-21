import { useEffect } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { useAppStore } from '../state/useAppStore'

export function useTimerRuntimeLifecycle(nativeStateReady: boolean) {
  const { tick, timerStatus } = useAppStore(
    useShallow((state) => ({
      tick: state.tick,
      timerStatus: state.timerStatus,
    })),
  )

  useEffect(() => {
    if (!nativeStateReady || timerStatus !== 'running') {
      return
    }

    const timer = window.setInterval(() => {
      tick(Date.now())
    }, 1000)

    return () => window.clearInterval(timer)
  }, [nativeStateReady, tick, timerStatus])
}
