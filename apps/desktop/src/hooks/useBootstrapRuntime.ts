import { useEffect, useState } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { useAppStore } from '../state/useAppStore'
import { selectBootstrapRuntimeState } from '../state/selectors'
import { useTwitchSessionStore } from '../state/useTwitchSessionStore'
import { getOverlayBootstrapState } from '../lib/platform/overlayRuntime'
import { loadNativeAppSnapshot } from '../lib/platform/nativeAppState'

export function useBootstrapRuntime() {
  const [nativeStateReady, setNativeStateReady] = useState(false)
  const bootstrap = useTwitchSessionStore((state) => state.bootstrap)
  const { hydrateNativeSnapshot, setOverlayBootstrapState } = useAppStore(useShallow(selectBootstrapRuntimeState))

  useEffect(() => {
    void bootstrap()
  }, [bootstrap])

  useEffect(() => {
    let cancelled = false

    void loadNativeAppSnapshot()
      .then((snapshot) => {
        if (snapshot) {
          hydrateNativeSnapshot(snapshot, Date.now())
        }
      })
      .catch(() => {
        // Fall back to the existing in-memory or localStorage state when native persistence is unavailable.
      })
      .finally(() => {
        if (!cancelled) {
          setNativeStateReady(true)
        }
      })

    return () => {
      cancelled = true
    }
  }, [hydrateNativeSnapshot])

  useEffect(() => {
    let cancelled = false

    void getOverlayBootstrapState().then((state) => {
      if (!cancelled) {
        setOverlayBootstrapState(state)
      }
    })

    return () => {
      cancelled = true
    }
  }, [setOverlayBootstrapState])

  return nativeStateReady
}
