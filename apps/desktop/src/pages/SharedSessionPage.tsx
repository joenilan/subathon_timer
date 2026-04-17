import { useEffect, useMemo, useState } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { WheelLiveSurface } from '../components/WheelLiveSurface'
import { TimerWidget } from '../components/TimerWidget'
import { TWITCH_CLIENT_ID } from '../lib/twitch/constants'
import { formatDurationClock } from '../lib/timer/engine'
import { resolveRuntimeFromSession } from '../lib/timer/runtime'
import { getChatters, timeoutUser } from '../lib/twitch/helix'
import { selectSharedSessionPageState } from '../state/selectors'
import { useSharedSessionStore } from '../state/useSharedSessionStore'
import { useTipSessionStore } from '../state/useTipSessionStore'
import { useTwitchSessionStore } from '../state/useTwitchSessionStore'
import { useAppStore } from '../state/useAppStore'
import type {
  SharedSessionActivityEntry,
  SharedParticipantRuntimeState,
  SharedSessionParticipant,
  SharedSessionServiceHealth,
} from '../lib/sharedSession/types'

function getServiceTone(status: SharedSessionServiceHealth) {
  switch (status) {
    case 'online':
      return 'connected'
    case 'checking':
      return 'pending'
    case 'offline':
      return 'critical'
    default:
      return 'idle'
  }
}

function getRuntimeStateLabel(state: SharedParticipantRuntimeState) {
  if (state.twitchStatus !== 'connected') {
    return 'Twitch not linked yet'
  }

  if (state.streamElementsStatus === 'connected' || state.streamlabsStatus === 'connected') {
    return 'Twitch linked, tip feeds ready'
  }

  return 'Twitch linked, waiting on optional tip feeds'
}

function getParticipantPresenceLabel(participant: SharedSessionParticipant) {
  return participant.connectionStatus === 'connected' ? 'Live on session' : 'Disconnected'
}

function getParticipantTone(participant: SharedSessionParticipant) {
  return participant.connectionStatus === 'connected' ? 'connected' : 'critical'
}

function formatActivityTime(occurredAt: string) {
  const date = new Date(occurredAt)
  return Number.isNaN(date.valueOf())
    ? 'Just now'
    : new Intl.DateTimeFormat(undefined, {
        hour: 'numeric',
        minute: '2-digit',
      }).format(date)
}

function getActivityDeltaLabel(entry: SharedSessionActivityEntry) {
  if (entry.deltaSeconds === 0) {
    return 'No timer change'
  }

  return `${entry.deltaSeconds > 0 ? '+' : '-'}${formatDurationClock(Math.abs(entry.deltaSeconds))}`
}

function getActivityProviderLabel(entry: SharedSessionActivityEntry) {
  switch (entry.provider) {
    case 'streamelements':
      return 'StreamElements'
    case 'streamlabs':
      return 'Streamlabs'
    default:
      return 'Twitch'
  }
}

export function SharedSessionPage() {
  const [createOpen, setCreateOpen] = useState(false)
  const [joinOpen, setJoinOpen] = useState(false)
  const [sessionTitle, setSessionTitle] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [joinCode, setJoinCode] = useState('')
  const [setTimerDraft, setSetTimerDraft] = useState('06:00:00')
  const [sharedWheelActionPending, setSharedWheelActionPending] = useState(false)
  const [now, setNow] = useState(() => Date.now())
  const {
    adjustSharedTimer,
    applySharedWheelTimeout,
    serviceUrl,
    serviceHealth,
    serviceMessage,
    status,
    session,
    localParticipantId,
    localRole,
    lastError,
    checkHealth,
    createSession,
    endSharedSession,
    failSharedWheelTimeout,
    joinSession,
    leaveSession,
    pauseSharedTimer,
    rejoinSession,
    resetSharedTimer,
    setSharedTimer,
    startSharedTimer,
    clearError,
    syncParticipantStatus,
  } = useSharedSessionStore(useShallow(selectSharedSessionPageState))
  const twitchStatus = useTwitchSessionStore((state) => state.status)
  const twitchSession = useTwitchSessionStore((state) => state.session)
  const twitchTokens = useTwitchSessionStore((state) => state.tokens)
  const streamElementsStatus = useTipSessionStore((state) => state.streamelementsStatus)
  const streamlabsStatus = useTipSessionStore((state) => state.streamlabsStatus)
  const localRuleConfig = useAppStore((state) => state.ruleConfig)
  const localWheelSegments = useAppStore((state) => state.wheelSegments)
  const localWheelTextScale = useAppStore((state) => state.wheelTextScale)

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(timer)
  }, [])

  useEffect(() => {
    void checkHealth()
  }, [checkHealth])

  useEffect(() => {
    if (status !== 'connected') {
      return
    }

    syncParticipantStatus({
      twitchStatus: twitchStatus === 'connected' ? 'connected' : twitchSession ? 'needs-attention' : 'not-linked',
      twitchLogin: twitchSession?.login ?? null,
      streamElementsStatus,
      streamlabsStatus,
    })
  }, [status, syncParticipantStatus, streamElementsStatus, streamlabsStatus, twitchSession, twitchStatus])

  const serviceTone = getServiceTone(serviceHealth)
  const localIdentity = useMemo(
    () =>
      twitchSession
        ? {
            userId: twitchSession.userId,
            login: twitchSession.login,
            displayName: twitchSession.login,
          }
        : null,
    [twitchSession],
  )
  const participantCards = session?.participants ?? []
  const localParticipant = participantCards.find((participant) => participant.id === localParticipantId) ?? null
  const sharedWheelSegment = session?.wheelSegments.find((segment) => segment.id === session.wheelSpin.activeSegmentId) ?? null
  const sharedTimer = useMemo(() => {
    if (!session) {
      return null
    }

    return resolveRuntimeFromSession(
      {
        timerStatus: session.timerState.timerStatus,
        timerSessionBaseRemainingSeconds: session.timerState.timerSessionBaseRemainingSeconds,
        timerSessionBaseUptimeSeconds: session.timerState.timerSessionBaseUptimeSeconds,
        timerSessionRunningSince: session.timerState.timerSessionRunningSince,
      },
      now,
    )
  }, [now, session])
  const isHost = localRole === 'host'
  const ownsSharedWheelTimeout =
    session?.wheelSpin.status === 'ready'
    && session.wheelSpin.sourceParticipantId === localParticipantId
    && sharedWheelSegment?.outcomeType === 'timeout'
  const runButtonLabel =
    sharedTimer?.timerStatus === 'running'
      ? 'Pause'
      : sharedTimer?.timerStatus === 'paused' && sharedTimer.timerRemainingSeconds > 0
        ? 'Resume'
        : 'Start'
  const runButtonAction = sharedTimer?.timerStatus === 'running' ? pauseSharedTimer : startSharedTimer

  const handleCreate = async () => {
    await createSession({
      title: sessionTitle.trim(),
      displayName: displayName.trim() || twitchSession?.login || 'Host',
      twitchIdentity: localIdentity,
      ruleConfig: localRuleConfig,
      wheelSegments: localWheelSegments,
    })
    setCreateOpen(false)
    setDisplayName('')
    setSessionTitle('')
  }

  const handleJoin = async () => {
    await joinSession({
      inviteCode: joinCode.trim().toUpperCase(),
      displayName: displayName.trim() || twitchSession?.login || 'Guest',
      twitchIdentity: localIdentity,
    })
    setJoinOpen(false)
    setDisplayName('')
    setJoinCode('')
  }

  const applyExactTimer = () => {
    const nextSeconds = parseDurationDraft(setTimerDraft)
    setSharedTimer(nextSeconds, 'Shared session host set timer')
    setSetTimerDraft(formatDurationDraft(nextSeconds))
  }

  const applySharedTimeoutResult = async () => {
    if (!session || !ownsSharedWheelTimeout || !sharedWheelSegment || !twitchSession || !twitchTokens) {
      return
    }

    setSharedWheelActionPending(true)

    try {
      let targetUserId: string | null = null
      let targetLabel = 'selected target'
      let targetMention = '@target'

      if (sharedWheelSegment.timeoutTarget === 'self') {
        if (!session.wheelSpin.triggerUserId) {
          throw new Error('The gifted-sub gifter is missing from this shared wheel result.')
        }

        targetUserId = session.wheelSpin.triggerUserId
        targetLabel = session.wheelSpin.triggerDisplayName ?? session.wheelSpin.triggerUserLogin ?? 'gifter'
        targetMention = session.wheelSpin.triggerUserLogin ? `@${session.wheelSpin.triggerUserLogin}` : targetLabel
      } else {
        if (!twitchSession.scopes.includes('moderator:read:chatters')) {
          throw new Error('Reconnect Twitch to grant moderator:read:chatters before using shared random timeout outcomes.')
        }

        const chatters = await getChatters({
          clientId: TWITCH_CLIENT_ID,
          accessToken: twitchTokens.accessToken,
          broadcasterId: twitchSession.userId,
          moderatorId: twitchSession.userId,
        })
        const candidates = chatters.filter((chatter) => chatter.userId !== twitchSession.userId)

        if (candidates.length === 0) {
          throw new Error('No eligible chatters are available for this shared random timeout outcome.')
        }

        const selectedChatter = candidates[Math.floor(Math.random() * candidates.length)]
        targetUserId = selectedChatter.userId
        targetLabel = selectedChatter.userName
        targetMention = `@${selectedChatter.userLogin}`
      }

      if (!twitchSession.scopes.includes('moderator:manage:banned_users')) {
        throw new Error('Reconnect Twitch to grant moderator:manage:banned_users before shared timeout outcomes can run.')
      }

      await timeoutUser({
        clientId: TWITCH_CLIENT_ID,
        accessToken: twitchTokens.accessToken,
        broadcasterId: twitchSession.userId,
        moderatorId: twitchSession.userId,
        userId: targetUserId,
        durationSeconds: sharedWheelSegment.timeoutSeconds ?? 300,
        reason: `Shared wheel outcome: ${sharedWheelSegment.label}`,
      })

      applySharedWheelTimeout({
        activeSegmentId: sharedWheelSegment.id,
        targetUserId,
        targetLabel,
        targetMention,
        durationSeconds: sharedWheelSegment.timeoutSeconds ?? 300,
      })
    } catch (error) {
      failSharedWheelTimeout({
        activeSegmentId: sharedWheelSegment.id,
        message: error instanceof Error ? error.message : 'Shared timeout outcome failed.',
      })
    } finally {
      setSharedWheelActionPending(false)
    }
  }

  return (
    <div className="page-container settings-page shared-session-page">
      <section className="page-header rules-header">
        <div>
          <h1 className="page-title">Shared Session</h1>
          <p className="page-desc">
            Link up to six creators into one shared subathon room, verify each broadcaster account is attached to the right PC, and keep one shared timer snapshot in sync across every desktop client.
          </p>
        </div>
      </section>

      <section className={`panel shared-session-strip shared-session-strip--${serviceTone}`}>
        <div className="shared-session-strip__copy">
          <span className="shared-session-strip__kicker">Shared service</span>
          <strong className="shared-session-strip__title">
            {serviceHealth === 'online'
              ? 'Shared session service reachable'
              : serviceHealth === 'checking'
                ? 'Checking shared session service'
                : serviceHealth === 'offline'
                  ? 'Shared session service unavailable'
                  : 'Shared session service not checked yet'}
          </strong>
          <p className="shared-session-strip__detail">
            {serviceMessage ?? `Shared session traffic uses ${serviceUrl}.`}
          </p>
        </div>
        <button type="button" className="btn btn--ghost shared-session-strip__action" onClick={() => void checkHealth()}>
          Check again
        </button>
      </section>

      {status === 'reconnecting' ? (
        <section className="panel shared-session-alert shared-session-alert--warning">
          <div>
            <strong>Reconnecting</strong>
            <p>Lost contact with the shared session service. Attempting to reconnect automatically.</p>
          </div>
        </section>
      ) : null}

      {lastError && status === 'error' && session ? (
        <section className="panel shared-session-alert shared-session-alert--critical">
          <div>
            <strong>Connection lost</strong>
            <p>{lastError}</p>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button type="button" className="btn btn--primary" onClick={() => void rejoinSession()}>
              Reconnect
            </button>
            <button type="button" className="btn btn--ghost" onClick={leaveSession}>
              Leave session
            </button>
          </div>
        </section>
      ) : lastError ? (
        <section className="panel shared-session-alert shared-session-alert--critical">
          <div>
            <strong>Shared session error</strong>
            <p>{lastError}</p>
          </div>
          <button type="button" className="btn btn--ghost" onClick={clearError}>
            Dismiss
          </button>
        </section>
      ) : null}

      {!session ? (
        <>
          <section className="panel shared-session-hero">
            <div className="shared-session-hero__copy">
              <span className="mini-chip">Phase 2</span>
              <h2 className="panel-title">Create the room, link the creators, and let the host drive one shared timer</h2>
              <p className="panel-copy">
                The shared-session flow now covers room creation, invite flow, creator presence, broadcaster identity, provider health, and one server-owned timer snapshot. The host can drive the shared timer while every guest sees the same live value.
              </p>
            </div>
            <div className="shared-session-hero__grid">
              <div className="shared-session-callout">
                <strong>Host streamer</strong>
                <p>Create the room, share the invite code, and stay responsible for the future shared runtime controls for the whole collaboration.</p>
                <button type="button" className="btn btn--primary" onClick={() => setCreateOpen(true)}>
                  Create shared session
                </button>
              </div>
              <div className="shared-session-callout">
                <strong>Joining creator</strong>
                <p>Join the host’s room with the invite code from their app and confirm your own Twitch account is the one attached to this PC.</p>
                <button type="button" className="btn btn--accent" onClick={() => setJoinOpen(true)}>
                  Join shared session
                </button>
              </div>
            </div>
          </section>

          <section className="shared-session-summary-grid">
            <article className="panel shared-session-summary-card">
              <span className="shared-session-summary-card__label">Local Twitch account</span>
              <strong className="shared-session-summary-card__value">
                {twitchSession ? `@${twitchSession.login}` : 'Not connected'}
              </strong>
              <p className="shared-session-summary-card__detail">
                {twitchSession
                  ? 'This broadcaster account will be attached to the shared session from this PC.'
                  : 'Connect Twitch first so the shared session can clearly identify which broadcaster belongs to this app.'}
              </p>
            </article>

            <article className="panel shared-session-summary-card">
              <span className="shared-session-summary-card__label">Tip feeds on this PC</span>
              <strong className="shared-session-summary-card__value">
                {streamElementsStatus === 'connected' || streamlabsStatus === 'connected' ? 'Ready to contribute' : 'Optional later'}
              </strong>
              <p className="shared-session-summary-card__detail">
                StreamElements and Streamlabs stay tip-only in shared mode. Twitch remains the source for follows, subs, cheers, and gift bombs.
              </p>
            </article>
          </section>
        </>
      ) : (
        <>
          <section className="panel shared-session-session-card">
            <div className="shared-session-session-card__header">
              <div>
                <div className="shared-session-session-card__badges">
                  <span className="mini-chip">Invite code {session.inviteCode}</span>
                  <span className="mini-chip">{session.participants.length} / 6 creators joined</span>
                  <span className={`status-chip ${session.status === 'active' ? 'status-chip--connected' : 'status-chip--pending'}`}>
                    {session.status === 'active' ? 'Shared room active' : 'Waiting for collaborators'}
                  </span>
                  {localRole ? <span className="mini-chip">{localRole === 'host' ? 'Host controls only' : 'Guest view'}</span> : null}
                </div>
                <h2 className="panel-title">{session.title}</h2>
                <p className="panel-copy">
                  This room is live. Use this page to confirm creator presence, linked Twitch accounts, provider health, and the shared timer snapshot before Twitch and tip ingestion are added in later phases.
                </p>
              </div>
              <div className="shared-session-session-card__actions">
                <button
                  type="button"
                  className="btn btn--ghost"
                  onClick={() => void navigator.clipboard.writeText(session.inviteCode)}
                >
                  Copy invite code
                </button>
                {isHost ? (
                  <button type="button" className="btn btn--danger" onClick={endSharedSession}>
                    End session
                  </button>
                ) : (
                  <button type="button" className="btn btn--danger" onClick={leaveSession}>
                    Leave session
                  </button>
                )}
              </div>
            </div>
          </section>

          <section className="panel shared-session-timer-panel">
            <div className="panel-header">
              <div>
                <h2 className="panel-title">Shared Timer</h2>
                <p className="panel-copy">
                  This timer snapshot now comes from the shared-session service. Only the host can start, pause, reset, add time, remove time, or set the exact shared timer value in this phase.
                </p>
              </div>
              <div className="shared-session-session-card__badges">
                <span className={`status-chip ${sharedTimer?.timerStatus === 'running' ? 'status-chip--connected' : 'status-chip--idle'}`}>
                  {sharedTimer?.timerStatus ?? 'idle'}
                </span>
                <span className="mini-chip">{sharedTimer ? formatDurationClock(sharedTimer.uptimeSeconds) : '00:00:00'} uptime</span>
              </div>
            </div>

            {sharedTimer ? (
              <div className="shared-session-timer-grid">
                <div className="shared-session-timer-stage">
                  <TimerWidget
                    theme="app"
                    surface="dashboard"
                    timerSeconds={sharedTimer.timerRemainingSeconds}
                    uptimeSeconds={sharedTimer.uptimeSeconds}
                    timerStatus={sharedTimer.timerStatus}
                    trendPoints={[session.timerState.timerSessionBaseRemainingSeconds, sharedTimer.timerRemainingSeconds]}
                    rules={[]}
                    showTrend={false}
                  />
                </div>

                <div className="shared-session-timer-controls">
                  <div className="shared-session-callout">
                    <strong>Host controls</strong>
                    <p>
                      {isHost
                        ? 'These controls write to the shared-session service and every connected desktop app will receive the same timer snapshot.'
                        : 'Only the host can change the shared timer right now. Guest desktops stay read-only until later permission work lands.'}
                    </p>
                    <div className="shared-session-control-row">
                      <button type="button" className="btn btn--primary" onClick={runButtonAction} disabled={!isHost}>
                        {runButtonLabel}
                      </button>
                      <button type="button" className="btn btn--ghost" onClick={resetSharedTimer} disabled={!isHost}>
                        Reset
                      </button>
                    </div>
                  </div>

                  <div className="shared-session-callout">
                    <strong>Quick adjust</strong>
                    <p>Use the same operator shortcuts here before shared Twitch and tip events are wired in.</p>
                    <div className="shared-session-control-row">
                      <button type="button" className="btn btn--accent" onClick={() => adjustSharedTimer(300, 'Shared session host add 5 min')} disabled={!isHost}>
                        +5 min
                      </button>
                      <button type="button" className="btn btn--ghost" onClick={() => adjustSharedTimer(60, 'Shared session host add 1 min')} disabled={!isHost}>
                        +1 min
                      </button>
                      <button type="button" className="btn btn--ghost" onClick={() => adjustSharedTimer(-120, 'Shared session host remove 2 min')} disabled={!isHost}>
                        -2 min
                      </button>
                    </div>
                  </div>

                  <div className="shared-session-callout">
                    <strong>Set exact timer</strong>
                    <p>Use `HH:MM:SS` to set the shared timer directly when you need to recover or start from a specific value.</p>
                    <div className="shared-session-set-row">
                      <input
                        className="rule-field__input"
                        value={setTimerDraft}
                        onChange={(event) => setSetTimerDraft(normalizeDurationDraft(event.target.value))}
                        placeholder="06:00:00"
                        disabled={!isHost}
                      />
                      <button type="button" className="btn btn--accent" onClick={applyExactTimer} disabled={!isHost}>
                        Set timer
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            ) : null}
          </section>

          <section className="panel shared-session-wheel-panel">
            <div className="panel-header">
              <div>
                <h2 className="panel-title">Shared Wheel</h2>
                <p className="panel-copy">
                  Shared gift bombs can trigger one server-owned wheel spin for the whole room. Every connected desktop sees the same spin and result, and timeout outcomes are applied by the creator whose channel triggered the wheel.
                </p>
              </div>
            </div>

            {session.wheelSpin.status !== 'idle' ? (
              <div className="shared-session-wheel-stage">
                <WheelLiveSurface
                  variant="shell"
                  wheelSegments={session.wheelSegments}
                  wheelSpin={session.wheelSpin}
                  wheelTextScale={localWheelTextScale}
                />
                {ownsSharedWheelTimeout && sharedWheelSegment ? (
                  <div className="shared-session-wheel-action">
                    <strong>Timeout action needed on this PC</strong>
                    <p>
                      This wheel result belongs to your linked broadcaster session, so this desktop is responsible for the timeout call before the shared wheel can finish.
                    </p>
                    <button
                      type="button"
                      className="btn btn--accent"
                      onClick={() => void applySharedTimeoutResult()}
                      disabled={sharedWheelActionPending}
                    >
                      {sharedWheelActionPending ? 'Applying shared timeout…' : 'Apply shared timeout'}
                    </button>
                  </div>
                ) : session.wheelSpin.status === 'ready' && sharedWheelSegment?.outcomeType === 'timeout' ? (
                  <div className="shared-session-wheel-action">
                    <strong>Waiting on the source creator</strong>
                    <p>
                      This timeout result belongs to the creator whose channel triggered the wheel. Their desktop needs to apply it so the shared wheel can finish cleanly.
                    </p>
                  </div>
                ) : null}
              </div>
            ) : (
              <div className="shared-session-empty-state">
                <strong>No shared wheel spin yet</strong>
                <p>When a qualifying shared Twitch gift bomb arrives, the service will pick one shared wheel result and every connected desktop will see the same spin here.</p>
              </div>
            )}
          </section>

          <section className="shared-session-summary-grid">
            <article className="panel shared-session-summary-card">
              <span className="shared-session-summary-card__label">Your role</span>
              <strong className="shared-session-summary-card__value">{localRole === 'host' ? 'Host' : 'Guest'}</strong>
              <p className="shared-session-summary-card__detail">
                {localRole === 'host'
                  ? 'This PC owns the room and will later own the shared timer controls and moderation outcomes.'
                  : 'This PC contributes its own streamer events and stays read-only for shared controls in the first release.'}
              </p>
            </article>

            <article className="panel shared-session-summary-card">
              <span className="shared-session-summary-card__label">Local presence</span>
              <strong className="shared-session-summary-card__value">
                {localParticipant ? getParticipantPresenceLabel(localParticipant) : 'Connecting'}
              </strong>
              <p className="shared-session-summary-card__detail">
                {localParticipant ? getRuntimeStateLabel(localParticipant.runtimeState) : 'Waiting for the room snapshot from the shared service.'}
              </p>
            </article>
          </section>

          <section className="panel">
            <div className="panel-header">
              <div>
                <h2 className="panel-title">Participants</h2>
                <p className="panel-copy">Each participant card shows who is in the room, which broadcaster account is linked, and whether that PC is still online. The scaffold is already structured for up to six creators.</p>
              </div>
            </div>

            <div className="shared-session-participant-grid">
              {participantCards.map((participant) => (
                <article
                  key={participant.id}
                  className={`shared-session-participant-card shared-session-participant-card--${getParticipantTone(participant)}`}
                >
                  <div className="shared-session-participant-card__header">
                    <div>
                      <span className="shared-session-participant-card__role">
                        {participant.role === 'host' ? 'Host' : 'Guest'}
                        {participant.id === localParticipantId ? ' · This PC' : ''}
                      </span>
                      <strong className="shared-session-participant-card__name">{participant.displayName}</strong>
                    </div>
                    <span className={`status-chip ${participant.connectionStatus === 'connected' ? 'status-chip--connected' : 'status-chip--critical'}`}>
                      {getParticipantPresenceLabel(participant)}
                    </span>
                  </div>

                  <div className="shared-session-participant-card__body">
                    <div className="shared-session-detail-row">
                      <span>Broadcaster</span>
                      <strong>
                        {participant.twitchIdentity ? `@${participant.twitchIdentity.login}` : 'Not linked yet'}
                      </strong>
                    </div>
                    <div className="shared-session-detail-row">
                      <span>Twitch state</span>
                      <strong>{participant.runtimeState.twitchStatus === 'connected' ? 'Connected' : participant.runtimeState.twitchStatus === 'needs-attention' ? 'Needs attention' : 'Not linked'}</strong>
                    </div>
                    <div className="shared-session-detail-row">
                      <span>StreamElements</span>
                      <strong>{participant.runtimeState.streamElementsStatus}</strong>
                    </div>
                    <div className="shared-session-detail-row">
                      <span>Streamlabs</span>
                      <strong>{participant.runtimeState.streamlabsStatus}</strong>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          </section>

          <section className="panel">
            <div className="panel-header">
              <div>
                <h2 className="panel-title">Shared Activity</h2>
                <p className="panel-copy">
                  Shared Twitch events are applied once on the service, then labeled here with the creator who triggered them so both desktops can audit the same runtime history.
                </p>
              </div>
            </div>

            {session.recentActivity.length > 0 ? (
              <div className="shared-session-activity-list">
                {session.recentActivity.map((entry) => (
                  <article key={entry.id} className="shared-session-activity-card">
                    <div className="shared-session-activity-card__header">
                      <div className="shared-session-activity-card__title-group">
                        <span className="shared-session-activity-card__kicker">
                          {entry.sourceParticipantLabel} · {getActivityProviderLabel(entry)}
                        </span>
                        <strong>{entry.title}</strong>
                      </div>
                      <div className="shared-session-activity-card__meta">
                        <span className="mini-chip">{getActivityDeltaLabel(entry)}</span>
                        <span className="shared-session-activity-card__time">{formatActivityTime(entry.occurredAt)}</span>
                      </div>
                    </div>
                    <p>{entry.summary}</p>
                  </article>
                ))}
              </div>
            ) : (
              <div className="shared-session-empty-state">
                <strong>No shared Twitch events yet</strong>
                <p>When one of the linked creators receives a qualifying Twitch event, the shared timer and this activity timeline will update for everyone in the room.</p>
              </div>
            )}
          </section>
        </>
      )}

      {createOpen ? (
        <div className="shared-session-modal-backdrop" role="presentation" onClick={() => setCreateOpen(false)}>
          <div className="shared-session-modal" role="dialog" aria-modal="true" onClick={(event) => event.stopPropagation()}>
            <div className="shared-session-modal__header">
              <div>
                <h2 className="panel-title">Create shared session</h2>
                <p className="panel-copy">Create the room on this PC, then send the invite code to the other streamer.</p>
              </div>
              <button type="button" className="btn btn--ghost" onClick={() => setCreateOpen(false)}>
                Close
              </button>
            </div>

            <div className="settings-grid settings-grid--single">
              <label className="rule-field">
                <span className="rule-field__label">Session title</span>
                <span className="rule-field__hint">Use a short label the whole collaboration will recognize during setup.</span>
                <input className="rule-field__input" value={sessionTitle} onChange={(event) => setSessionTitle(event.target.value)} placeholder="Shared Subathon" />
              </label>
              <label className="rule-field">
                <span className="rule-field__label">Your participant label</span>
                <span className="rule-field__hint">Shown on the participant card inside the shared room.</span>
                <input className="rule-field__input" value={displayName} onChange={(event) => setDisplayName(event.target.value)} placeholder={twitchSession?.login ?? 'Host streamer'} />
              </label>
            </div>

            <div className="shared-session-modal__actions">
              <button type="button" className="btn btn--ghost" onClick={() => setCreateOpen(false)}>
                Cancel
              </button>
              <button type="button" className="btn btn--primary" onClick={() => void handleCreate()} disabled={status === 'creating' || status === 'connecting'}>
                {status === 'creating' || status === 'connecting' ? 'Creating…' : 'Create session'}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {joinOpen ? (
        <div className="shared-session-modal-backdrop" role="presentation" onClick={() => setJoinOpen(false)}>
          <div className="shared-session-modal" role="dialog" aria-modal="true" onClick={(event) => event.stopPropagation()}>
            <div className="shared-session-modal__header">
              <div>
                <h2 className="panel-title">Join shared session</h2>
                <p className="panel-copy">Enter the invite code from the host app, then confirm the Twitch account on this PC is the streamer you want attached to the room.</p>
              </div>
              <button type="button" className="btn btn--ghost" onClick={() => setJoinOpen(false)}>
                Close
              </button>
            </div>

            <div className="settings-grid settings-grid--single">
              <label className="rule-field">
                <span className="rule-field__label">Invite code</span>
                <span className="rule-field__hint">Codes are short and uppercase to make voice sharing easier during setup.</span>
                <input className="rule-field__input" value={joinCode} onChange={(event) => setJoinCode(event.target.value.toUpperCase())} placeholder="ABC123" />
              </label>
              <label className="rule-field">
                <span className="rule-field__label">Your participant label</span>
                <span className="rule-field__hint">Shown on the participant card once you join the room.</span>
                <input className="rule-field__input" value={displayName} onChange={(event) => setDisplayName(event.target.value)} placeholder={twitchSession?.login ?? 'Guest streamer'} />
              </label>
            </div>

            <div className="shared-session-modal__actions">
              <button type="button" className="btn btn--ghost" onClick={() => setJoinOpen(false)}>
                Cancel
              </button>
              <button type="button" className="btn btn--accent" onClick={() => void handleJoin()} disabled={status === 'joining' || status === 'connecting' || joinCode.trim().length < 4}>
                {status === 'joining' || status === 'connecting' ? 'Joining…' : 'Join session'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}

function normalizeDurationDraft(value: string) {
  return value.replace(/[^\d:]/g, '').slice(0, 8)
}

function parseDurationDraft(value: string) {
  const parts = value
    .split(':')
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => Math.max(0, Number.parseInt(part, 10) || 0))

  if (parts.length === 0) {
    return 0
  }

  if (parts.length === 1) {
    return parts[0] * 60
  }

  if (parts.length === 2) {
    const [minutes, seconds] = parts
    return minutes * 60 + Math.min(seconds, 59)
  }

  const [hours, minutes, seconds] = parts.slice(-3)
  return hours * 3600 + Math.min(minutes, 59) * 60 + Math.min(seconds, 59)
}

function formatDurationDraft(totalSeconds: number) {
  const safeTotal = Math.max(0, Math.floor(totalSeconds))
  const hours = Math.floor(safeTotal / 3600)
  const minutes = Math.floor((safeTotal % 3600) / 60)
  const seconds = safeTotal % 60

  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
}
