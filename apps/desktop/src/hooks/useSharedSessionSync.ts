import { useEffect } from 'react'
import { useAppStore } from '../state/useAppStore'
import { useSharedSessionStore } from '../state/useSharedSessionStore'
import { resolveRuntimeFromSession } from '../lib/timer/runtime'
import type { TimerStatus } from '../lib/timer/runtime'

/**
 * When this desktop is the HOST of a shared session, keeps the local app store
 * (which drives overlays and the dashboard timer) in sync with the authoritative
 * shared session snapshot.
 *
 * Both host and guest sync from the shared snapshot — the host's timer is
 * authoritative and all overlays on all PCs show the same value. Guests still
 * collect and forward their own Twitch/tip events independently.
 */
export function useSharedSessionSync() {
  const session = useSharedSessionStore((state) => state.session)
  const localRole = useSharedSessionStore((state) => state.localRole)

  useEffect(() => {
    if (!localRole || !session) return

    const { timerState, wheelSpin } = session

    // Compute live remaining/uptime so the overlay reflects the current moment,
    // not a stale base snapshot.
    const now = Date.now()
    const runtime = resolveRuntimeFromSession(
      {
        timerStatus: timerState.timerStatus as TimerStatus,
        timerSessionBaseRemainingSeconds: timerState.timerSessionBaseRemainingSeconds,
        timerSessionBaseUptimeSeconds: timerState.timerSessionBaseUptimeSeconds,
        timerSessionRunningSince: timerState.timerSessionRunningSince,
      },
      now,
    )

    // Write timer state so the overlay and local tick() both use shared values.
    useAppStore.setState({
      timerStatus: runtime.timerStatus as TimerStatus,
      timerRemainingSeconds: runtime.timerRemainingSeconds,
      uptimeSeconds: runtime.uptimeSeconds,
      timerSessionBaseRemainingSeconds: timerState.timerSessionBaseRemainingSeconds,
      timerSessionBaseUptimeSeconds: timerState.timerSessionBaseUptimeSeconds,
      timerSessionRunningSince: timerState.timerSessionRunningSince,
    })

    // Sync wheel spin so the in-app shell overlay and wheel overlay both reflect
    // the shared wheel result. Strip the shared-session-only fields down to the
    // WheelSpinState shape the app store expects.
    useAppStore.setState({
      wheelSpin: {
        status: wheelSpin.status,
        activeSegmentId: wheelSpin.activeSegmentId,
        resultTitle: wheelSpin.resultTitle,
        resultSummary: wheelSpin.resultSummary,
        requiresModeration: wheelSpin.requiresModeration,
        autoApply: wheelSpin.autoApply,
        isTest: wheelSpin.isTest,
      },
    })
  }, [localRole, session])
}
