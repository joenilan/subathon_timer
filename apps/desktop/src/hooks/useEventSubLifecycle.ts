import { useEffect } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { useAppStore } from '../state/useAppStore'
import { useEventSubStore } from '../state/useEventSubStore'
import { selectEventSubLifecycleState, selectTwitchLifecycleState } from '../state/selectors'
import { useTwitchSessionStore } from '../state/useTwitchSessionStore'

export function useEventSubLifecycle(nativeStateReady: boolean) {
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

    for (const event of normalizedEvents) {
      processTwitchEvent(event)
    }
  }, [nativeStateReady, normalizedEvents, processTwitchEvent])
}
