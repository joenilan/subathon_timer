import { useEffect } from 'react'
import { useBootstrapRuntime } from '../hooks/useBootstrapRuntime'
import { useEventSubLifecycle } from '../hooks/useEventSubLifecycle'
import { useNativeSnapshotPersistence } from '../hooks/useNativeSnapshotPersistence'
import { useOverlayRuntimeSync } from '../hooks/useOverlayRuntimeSync'
import { useTimerRuntimeLifecycle } from '../hooks/useTimerRuntimeLifecycle'
import { useTipSessionLifecycle } from '../hooks/useTipSessionLifecycle'
import { useTwitchSessionLifecycle } from '../hooks/useTwitchSessionLifecycle'
import { useUpdateStore } from '../state/useUpdateStore'

export function RuntimeLifecycle() {
  const nativeStateReady = useBootstrapRuntime()
  useTwitchSessionLifecycle()
  useNativeSnapshotPersistence(nativeStateReady)
  useEventSubLifecycle(nativeStateReady)
  useTipSessionLifecycle(nativeStateReady)
  useTimerRuntimeLifecycle(nativeStateReady)
  useOverlayRuntimeSync(nativeStateReady)

  const checkForUpdate = useUpdateStore((state) => state.checkForUpdate)
  useEffect(() => {
    void checkForUpdate()
  }, [checkForUpdate])

  return null
}
