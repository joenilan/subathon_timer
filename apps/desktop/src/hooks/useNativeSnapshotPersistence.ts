import { useEffect, useMemo, useRef } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { buildNativeAppSnapshot, saveNativeAppSnapshot } from '../lib/platform/nativeAppState'
import { useAppStore } from '../state/useAppStore'
import { useGoalsStore } from '../state/useGoalsStore'
import { selectNativeGoalsSnapshotInputs, selectNativeSnapshotInputs } from '../state/selectors'

export function useNativeSnapshotPersistence(nativeStateReady: boolean) {
  const lastSavedNativeSnapshot = useRef<string | null>(null)
  const {
    commandPermissions,
    defaultTimerSeconds,
    lastAppliedDeltaSeconds,
    overlayLanAccessEnabled,
    ruleConfig,
    timerEvents,
    timerSessionBaseRemainingSeconds,
    timerSessionBaseUptimeSeconds,
    timerSessionRunningSince,
    timerStatus,
    wheelSegments,
    wheelBlacklist,
  } = useAppStore(useShallow(selectNativeSnapshotInputs))
  const {
    announceGoalCompletionsInChat,
    goalLadders,
    goalsHistory,
  } = useGoalsStore(useShallow(selectNativeGoalsSnapshotInputs))
  const nativeSnapshot = useMemo(
    () =>
      buildNativeAppSnapshot({
        defaultTimerSeconds,
        commandPermissions,
        overlayLanAccessEnabled,
        ruleConfig,
        wheelSegments,
        wheelBlacklist,
        timerStatus,
        timerSessionBaseRemainingSeconds,
        timerSessionBaseUptimeSeconds,
        timerSessionRunningSince,
        lastAppliedDeltaSeconds,
        timerEvents,
        goals: {
          ladders: goalLadders,
          history: goalsHistory,
          announceGoalCompletionsInChat,
        },
      }),
    [
      announceGoalCompletionsInChat,
      commandPermissions,
      defaultTimerSeconds,
      goalLadders,
      goalsHistory,
      lastAppliedDeltaSeconds,
      overlayLanAccessEnabled,
      ruleConfig,
      timerEvents,
      timerSessionBaseRemainingSeconds,
      timerSessionBaseUptimeSeconds,
      timerSessionRunningSince,
      timerStatus,
      wheelSegments,
      wheelBlacklist,
    ],
  )
  const serializedNativeSnapshot = useMemo(() => JSON.stringify(nativeSnapshot), [nativeSnapshot])

  useEffect(() => {
    if (!nativeStateReady) {
      return
    }

    if (serializedNativeSnapshot === lastSavedNativeSnapshot.current) {
      return
    }

    const timer = window.setTimeout(() => {
      lastSavedNativeSnapshot.current = serializedNativeSnapshot
      void saveNativeAppSnapshot(nativeSnapshot).catch(() => {
        lastSavedNativeSnapshot.current = null
      })
    }, timerStatus === 'running' ? 250 : 80)

    return () => window.clearTimeout(timer)
  }, [nativeSnapshot, nativeStateReady, serializedNativeSnapshot, timerStatus])
}
