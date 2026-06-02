import { useEffect } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { useGoalsStore } from '../state/useGoalsStore'
import { useSharedSessionStore } from '../state/useSharedSessionStore'
import { selectSharedGoalsSyncState } from '../state/selectors'

export function useSharedGoalsSync() {
  const hydrateGoalsSnapshot = useGoalsStore((state) => state.hydrateGoalsSnapshot)
  const buildGoalsSnapshot = useGoalsStore((state) => state.buildGoalsSnapshot)
  const ladders = useGoalsStore((state) => state.ladders)
  const { localRole, receivedGoalsLadders, status } = useSharedSessionStore(useShallow(selectSharedGoalsSyncState))

  // Guest: apply goals snapshot broadcast from host
  useEffect(() => {
    if (status !== 'connected' || localRole !== 'guest' || !receivedGoalsLadders) {
      return
    }
    hydrateGoalsSnapshot({ ladders: receivedGoalsLadders, history: [], announceGoalCompletionsInChat: false })
  }, [hydrateGoalsSnapshot, localRole, receivedGoalsLadders, status])

  // Host: push current goals to guests on any ladder change
  const pushGoalsSnapshot = useSharedSessionStore((state) => state.pushGoalsSnapshot)
  useEffect(() => {
    if (status !== 'connected' || localRole !== 'host') {
      return
    }
    pushGoalsSnapshot(buildGoalsSnapshot().ladders)
  }, [buildGoalsSnapshot, ladders, localRole, pushGoalsSnapshot, status])
}
