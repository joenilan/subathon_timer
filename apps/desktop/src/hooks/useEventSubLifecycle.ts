import { useEffect, useRef } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { useAppStore } from '../state/useAppStore'
import { useEventSubStore } from '../state/useEventSubStore'
import { selectEventSubLifecycleState, selectSharedSessionIngressState, selectTwitchLifecycleState } from '../state/selectors'
import { useSharedSessionStore } from '../state/useSharedSessionStore'
import { useTwitchSessionStore } from '../state/useTwitchSessionStore'

export function useEventSubLifecycle(nativeStateReady: boolean) {
  const seenEventIdsRef = useRef<Set<string>>(new Set())
  const { authStatus, session, tokens } = useTwitchSessionStore(
    useShallow((state) => {
      const selected = selectTwitchLifecycleState(state)
      return {
        authStatus: selected.authStatus,
        session: state.session,
        tokens: selected.tokens,
      }
    }),
  )
  const { connectEventSub, disconnectEventSub, normalizedEvents } = useEventSubStore(useShallow(selectEventSubLifecycleState))
  const processTwitchEvent = useAppStore((state) => state.processTwitchEvent)
  const { session: sharedSession, status: sharedSessionStatus, submitSharedTwitchEvent } = useSharedSessionStore(
    useShallow(selectSharedSessionIngressState),
  )

  useEffect(() => {
    if (authStatus === 'connected' && session?.userId && tokens?.accessToken) {
      connectEventSub({
        accessToken: tokens.accessToken,
        broadcasterUserId: session.userId,
      })
      return
    }

    disconnectEventSub()
  }, [authStatus, connectEventSub, disconnectEventSub, session?.userId, tokens?.accessToken])

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
        if (submitSharedTwitchEvent(event)) {
          seenEventIdsRef.current.add(event.id)
        }
        continue
      }

      processTwitchEvent(event)
      seenEventIdsRef.current.add(event.id)
    }
  }, [nativeStateReady, normalizedEvents, processTwitchEvent, sharedSession, sharedSessionStatus, submitSharedTwitchEvent])
}
