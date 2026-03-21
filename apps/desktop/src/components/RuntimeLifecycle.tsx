import { useBootstrapRuntime } from '../hooks/useBootstrapRuntime'
import { useEventSubLifecycle } from '../hooks/useEventSubLifecycle'
import { useNativeSnapshotPersistence } from '../hooks/useNativeSnapshotPersistence'
import { useOverlayRuntimeSync } from '../hooks/useOverlayRuntimeSync'
import { useTimerRuntimeLifecycle } from '../hooks/useTimerRuntimeLifecycle'
import { useTwitchSessionLifecycle } from '../hooks/useTwitchSessionLifecycle'

export function RuntimeLifecycle() {
  const nativeStateReady = useBootstrapRuntime()
  useTwitchSessionLifecycle()
  useNativeSnapshotPersistence(nativeStateReady)
  useEventSubLifecycle(nativeStateReady)
  useTimerRuntimeLifecycle(nativeStateReady)
  useOverlayRuntimeSync(nativeStateReady)

  return null
}
