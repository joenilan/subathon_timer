import { useEffect, useRef } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { useAppStore } from '../state/useAppStore'
import { selectSharedSessionIngressState, selectTipLifecycleState } from '../state/selectors'
import { useGoalsStore } from '../state/useGoalsStore'
import { useSharedSessionStore } from '../state/useSharedSessionStore'
import { useTipSessionStore } from '../state/useTipSessionStore'
import { announceGoalCompletionInChat } from '../lib/goals/chatDelivery'

export function useTipSessionLifecycle(nativeStateReady: boolean) {
  const seenEventIdsRef = useRef<Set<string>>(new Set())
  const { bootstrap, normalizedEvents } = useTipSessionStore(useShallow(selectTipLifecycleState))
  const processTwitchEvent = useAppStore((state) => state.processTwitchEvent)
  const processGoalEvent = useGoalsStore((state) => state.processGoalEvent)
  const buildGoalsSnapshot = useGoalsStore((state) => state.buildGoalsSnapshot)
  const announceGoalCompletionsInChat = useGoalsStore((state) => state.announceGoalCompletionsInChat)
  const { localRole, pushGoalsSnapshot, session: sharedSession, status: sharedSessionStatus, submitSharedTipEvent } = useSharedSessionStore(
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
          if (localRole === 'host') {
            processGoalEvent(event)
          }
        }
        continue
      }

      const goalResult = processGoalEvent(event)
      processTwitchEvent(event)
      if (announceGoalCompletionsInChat) {
        void announceGoalCompletionInChat(goalResult)
      }
      seenEventIdsRef.current.add(event.id)
    }

    if (sharedModeActive && localRole === 'host' && normalizedEvents.length > 0) {
      pushGoalsSnapshot(buildGoalsSnapshot().ladders)
    }
  }, [
    announceGoalCompletionsInChat,
    buildGoalsSnapshot,
    localRole,
    nativeStateReady,
    normalizedEvents,
    processGoalEvent,
    processTwitchEvent,
    pushGoalsSnapshot,
    sharedSession,
    sharedSessionStatus,
    submitSharedTipEvent,
  ])
}
