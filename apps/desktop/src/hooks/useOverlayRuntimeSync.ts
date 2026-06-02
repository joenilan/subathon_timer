import { useEffect } from 'react'
import { useShallow } from 'zustand/react/shallow'
import {
  buildOverlayPreview,
  buildOverlayRules,
  setOverlayNetworkMode,
  syncOverlayRuntime,
} from '../lib/platform/overlayRuntime'
import { buildGoalOverlayLadders } from '../lib/goals/overlay'
import { useAppStore } from '../state/useAppStore'
import { useGoalsStore } from '../state/useGoalsStore'
import { selectOverlayRuntimeState } from '../state/selectors'

export function useOverlayRuntimeSync(nativeStateReady: boolean) {
  const {
    activity,
    overlayLanAccessEnabled,
    reasonOverlayTransform,
    goalsOverlayTransform,
    compactOverlayTransform,
    ruleConfig,
    setOverlayBootstrapState,
    wheelOverlayTransform,
    wheelResultDisplaySeconds,
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
  const goalLadders = useGoalsStore((state) => state.ladders)

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
      wheelOverlayTransform,
      goalsOverlayTransform,
      compactOverlayTransform,
      wheelSegments,
      wheelSpin,
      wheelResultDisplaySeconds,
      wheelTextScale,
      incentiveRules: buildOverlayRules(ruleConfig),
      overlayPreview: buildOverlayPreview(activity[0] ?? null),
      goals: buildGoalOverlayLadders(goalLadders),
    })
  }, [
    activity,
    goalLadders,
    goalsOverlayTransform,
    compactOverlayTransform,
    nativeStateReady,
    reasonOverlayTransform,
    ruleConfig,
    wheelOverlayTransform,
    wheelResultDisplaySeconds,
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
