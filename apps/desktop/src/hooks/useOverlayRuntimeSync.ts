import { useEffect } from 'react'
import { useShallow } from 'zustand/react/shallow'
import {
  buildOverlayPreview,
  buildOverlayRules,
  setOverlayNetworkMode,
  syncOverlayRuntime,
} from '../lib/platform/overlayRuntime'
import { useAppStore } from '../state/useAppStore'
import { selectOverlayRuntimeState } from '../state/selectors'

export function useOverlayRuntimeSync(nativeStateReady: boolean) {
  const {
    activity,
    overlayLanAccessEnabled,
    reasonOverlayTransform,
    ruleConfig,
    setOverlayBootstrapState,
    wheelSegments,
    wheelSpin,
    wheelTextScale,
    timerOverlayTransform,
    timerRemainingSeconds,
    timerStatus,
    timerWidgetTheme,
    trendPoints,
    uptimeSeconds,
  } = useAppStore(useShallow(selectOverlayRuntimeState))

  useEffect(() => {
    if (!nativeStateReady) {
      return
    }

    let cancelled = false

    void setOverlayNetworkMode(overlayLanAccessEnabled)
      .then((state) => {
        if (!cancelled) {
          setOverlayBootstrapState(state)
        }
      })
      .catch(() => {
        // Keep the last known overlay bootstrap state when rebind fails.
      })

    return () => {
      cancelled = true
    }
  }, [nativeStateReady, overlayLanAccessEnabled, setOverlayBootstrapState])

  useEffect(() => {
    if (!nativeStateReady) {
      return
    }

    void syncOverlayRuntime({
      timerSeconds: timerRemainingSeconds,
      uptimeSeconds,
      timerStatus,
      timerTheme: timerWidgetTheme,
      graphPoints: trendPoints,
      timerOverlayTransform,
      reasonOverlayTransform,
      wheelSegments,
      wheelSpin,
      wheelTextScale,
      incentiveRules: buildOverlayRules(ruleConfig),
      overlayPreview: buildOverlayPreview(activity[0] ?? null),
    })
  }, [
    activity,
    nativeStateReady,
    reasonOverlayTransform,
    ruleConfig,
    wheelSegments,
    wheelSpin,
    wheelTextScale,
    timerOverlayTransform,
    timerRemainingSeconds,
    timerStatus,
    timerWidgetTheme,
    trendPoints,
    uptimeSeconds,
  ])
}
