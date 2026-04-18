import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
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
    case 'online': return 'connected'
    case 'checking': return 'pending'
    case 'offline': return 'critical'
    default: return 'idle'
  }
}

function getTwitchHealthLabel(state: SharedParticipantRuntimeState) {
  if (state.twitchStatus === 'connected') return 'Twitch connected'
  if (state.twitchStatus === 'needs-attention') return 'Twitch needs attention'
  return 'Twitch not linked'
}

function getParticipantPresenceLabel(participant: SharedSessionParticipant) {
  return participant.connectionStatus === 'connected' ? 'Live' : 'Disconnected'
}

function formatActivityTime(occurredAt: string) {
  const date = new Date(occurredAt)
  return Number.isNaN(date.valueOf())
    ? 'Just now'
    : new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' }).format(date)
}

function getActivityDeltaLabel(entry: SharedSessionActivityEntry) {
  if (entry.deltaSeconds === 0) return 'No change'
  return `${entry.deltaSeconds > 0 ? '+' : '-'}${formatDurationClock(Math.abs(entry.deltaSeconds))}`
}

function getActivityProviderLabel(entry: SharedSessionActivityEntry) {
  switch (entry.provider) {
    case 'streamelements': return 'StreamElements'
    case 'streamlabs': return 'Streamlabs'
    default: return 'Twitch'
  }
}

function getParticipantInitials(name: string) {
  return name.slice(0, 2).toUpperCase()
}

function getRuntimeStatusColor(status: string): string | undefined {
  if (status === 'connected') return 'var(--green)'
  if (status === 'needs-attention') return 'var(--yellow)'
  return undefined
}

export function SharedSessionPage() {
  const navigate = useNavigate()
  const [createOpen, setCreateOpen] = useState(false)
  const [joinOpen, setJoinOpen] = useState(false)
  const [sessionTitle, setSessionTitle] = useState('')
  const [joinCode, setJoinCode] = useState('')
  const [setTimerDraft, setSetTimerDraft] = useState('06:00:00')
  const [codeCopied, setCodeCopied] = useState(false)
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
  const setSharedSessionEnabled = useAppStore((state) => state.setSharedSessionEnabled)

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(timer)
  }, [])

  useEffect(() => {
    void checkHealth()
  }, [checkHealth])

  useEffect(() => {
    if (status !== 'connected') return
    syncParticipantStatus({
      twitchStatus: twitchStatus === 'connected' ? 'connected' : twitchSession ? 'needs-attention' : 'not-linked',
      twitchLogin: twitchSession?.login ?? null,
      streamElementsStatus,
      streamlabsStatus,
    })
  }, [status, syncParticipantStatus, streamElementsStatus, streamlabsStatus, twitchSession, twitchStatus])

  const serviceTone = getServiceTone(serviceHealth)
  const localIdentity = useMemo(
    () => twitchSession
      ? { userId: twitchSession.userId, login: twitchSession.login, displayName: twitchSession.login }
      : null,
    [twitchSession],
  )
  const participantCards = session?.participants ?? []
  const sharedWheelSegment = session?.wheelSegments.find((s) => s.id === session.wheelSpin.activeSegmentId) ?? null
  const sharedTimer = useMemo(() => {
    if (!session) return null
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
    session?.wheelSpin.status === 'ready' &&
    session.wheelSpin.sourceParticipantId === localParticipantId &&
    sharedWheelSegment?.outcomeType === 'timeout'
  const runButtonLabel =
    sharedTimer?.timerStatus === 'running' ? 'Pause' :
    sharedTimer?.timerStatus === 'paused' && sharedTimer.timerRemainingSeconds > 0 ? 'Resume' : 'Start'
  const runButtonAction = sharedTimer?.timerStatus === 'running' ? pauseSharedTimer : startSharedTimer

  const handleCreate = async () => {
    await createSession({
      title: sessionTitle.trim(),
      twitchIdentity: localIdentity,
      ruleConfig: localRuleConfig,
      wheelSegments: localWheelSegments,
    })
    setCreateOpen(false)
    setSessionTitle('')
  }

  const handleJoin = async () => {
    await joinSession({
      inviteCode: joinCode.trim().toUpperCase(),
      twitchIdentity: localIdentity,
    })
    setJoinOpen(false)
    setJoinCode('')
  }

  const copyInviteCode = async () => {
    if (!session) return
    await navigator.clipboard.writeText(session.inviteCode)
    setCodeCopied(true)
    setTimeout(() => setCodeCopied(false), 2000)
  }

  const applyExactTimer = () => {
    const nextSeconds = parseDurationDraft(setTimerDraft)
    setSharedTimer(nextSeconds, 'Shared session host set timer')
    setSetTimerDraft(formatDurationDraft(nextSeconds))
  }

  const applySharedTimeoutResult = async () => {
    if (!session || !ownsSharedWheelTimeout || !sharedWheelSegment || !twitchSession || !twitchTokens) return
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
        const candidates = chatters.filter((c) => c.userId !== twitchSession.userId)
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
          <p className="page-desc">Run one shared subathon timer across up to six creator desktops, each contributing their own Twitch and tip events.</p>
        </div>
      </section>

      {/* Server health strip */}
      <div className={`shared-session-status-bar shared-session-status-bar--${serviceTone}`}>
        <div className="shared-session-status-bar__left">
          <span className={`shared-session-status-bar__dot shared-session-status-bar__dot--${serviceTone}`} />
          <span className="shared-session-status-bar__text">
            {serviceHealth === 'online' ? 'Session server reachable'
              : serviceHealth === 'checking' ? 'Checking session server…'
              : serviceHealth === 'offline' ? 'Session server unavailable'
              : 'Session server not checked'}
          </span>
          <span className="shared-session-status-bar__url">{serviceMessage ?? serviceUrl}</span>
        </div>
        <div className="shared-session-status-bar__right">
          <button type="button" className="btn-link" onClick={() => void checkHealth()}>Check again</button>
          <span aria-hidden="true" className="shared-session-status-bar__sep">·</span>
          <button
            type="button"
            className="btn-link btn-link--muted"
            onClick={() => { setSharedSessionEnabled(false); void navigate('/settings') }}
          >
            Disable
          </button>
        </div>
      </div>

      {/* Reconnecting banner */}
      {status === 'reconnecting' ? (
        <section className="panel shared-session-alert shared-session-alert--warning">
          <div>
            <strong>Reconnecting…</strong>
            <p>Lost connection to the session server. Attempting to reconnect automatically.</p>
          </div>
        </section>
      ) : null}

      {/* Error banners */}
      {lastError && status === 'error' && session ? (
        <section className="panel shared-session-alert shared-session-alert--critical">
          <div>
            <strong>Connection lost</strong>
            <p>{lastError}</p>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button type="button" className="btn btn--primary" onClick={() => void rejoinSession()}>Reconnect</button>
            <button type="button" className="btn btn--ghost" onClick={leaveSession}>Leave session</button>
          </div>
        </section>
      ) : lastError ? (
        <section className="panel shared-session-alert shared-session-alert--critical">
          <div>
            <strong>Error</strong>
            <p>{lastError}</p>
          </div>
          <button type="button" className="btn btn--ghost" onClick={clearError}>Dismiss</button>
        </section>
      ) : null}

      {/* ---- No session: landing ---- */}
      {!session ? (
        <>
          <section className="panel shared-session-landing">
            <div className="shared-session-landing__actions">
              <div className="shared-session-action-card">
                <div className="shared-session-action-card__body">
                  <strong className="shared-session-action-card__title">Host</strong>
                  <p className="shared-session-action-card__desc">Create the room on this PC. Your timer rules and wheel segments carry over automatically. Share the invite code once the room is open.</p>
                </div>
                <button
                  type="button"
                  className="btn btn--primary"
                  onClick={() => setCreateOpen(true)}
                  disabled={!twitchSession}
                >
                  Create session
                </button>
                {!twitchSession ? (
                  <p className="shared-session-action-card__warn">Connect Twitch first to identify your broadcaster account in the room.</p>
                ) : null}
              </div>

              <div className="shared-session-action-card shared-session-action-card--join">
                <div className="shared-session-action-card__body">
                  <strong className="shared-session-action-card__title">Join</strong>
                  <p className="shared-session-action-card__desc">Enter the six-character code from the host's app to connect this PC to their room. Your Twitch account is confirmed automatically.</p>
                </div>
                <button
                  type="button"
                  className="btn btn--accent"
                  onClick={() => setJoinOpen(true)}
                  disabled={!twitchSession}
                >
                  Join session
                </button>
                {!twitchSession ? (
                  <p className="shared-session-action-card__warn">Connect Twitch first to identify your broadcaster account in the room.</p>
                ) : null}
              </div>
            </div>

            <div className="shared-session-landing__status">
              <div className="shared-session-readiness-row">
                <div className={`health-dot ${twitchSession ? 'connected' : 'action-required'}`} />
                <span className="shared-session-readiness-row__label">Twitch</span>
                <strong className="shared-session-readiness-row__value">
                  {twitchSession ? `@${twitchSession.login}` : 'Not connected'}
                </strong>
              </div>
              <div className="shared-session-readiness-row">
                <div className={`health-dot ${streamElementsStatus === 'connected' || streamlabsStatus === 'connected' ? 'connected' : 'degraded'}`} />
                <span className="shared-session-readiness-row__label">Tip feeds</span>
                <strong className="shared-session-readiness-row__value">
                  {streamElementsStatus === 'connected' || streamlabsStatus === 'connected' ? 'Ready' : 'Optional'}
                </strong>
              </div>
            </div>
          </section>
        </>
      ) : (
        /* ---- Active session ---- */
        <>
          {/* Session header bar */}
          <section className="panel shared-session-bar">
            <div className="shared-session-bar__left">
              <div className="shared-session-bar__badges">
                <span className={`status-chip ${session.status === 'active' ? 'status-chip--connected' : 'status-chip--pending'}`}>
                  {session.status === 'active' ? 'Active' : 'Waiting'}
                </span>
                <span className="mini-chip">{localRole === 'host' ? 'Host' : 'Guest'}</span>
                <span className="mini-chip">{session.participants.length} / 6</span>
              </div>
              <h2 className="shared-session-bar__title">{session.title}</h2>
            </div>

            <div className="shared-session-bar__code" onClick={() => void copyInviteCode()} title="Click to copy invite code">
              <span className="shared-session-bar__code-label">Invite code</span>
              <span className="shared-session-bar__code-value">{session.inviteCode}</span>
              <span className="shared-session-bar__code-copy">{codeCopied ? 'Copied!' : 'Copy'}</span>
            </div>

            <div className="shared-session-bar__actions">
              {isHost ? (
                <button type="button" className="btn btn--danger" onClick={endSharedSession}>End session</button>
              ) : (
                <button type="button" className="btn btn--danger" onClick={leaveSession}>Leave session</button>
              )}
            </div>
          </section>

          {/* Participants */}
          <section className="panel">
            <div className="panel-header">
              <div>
                <h2 className="panel-title">Participants</h2>
                <p className="panel-copy">Each creator's Twitch account, connection status, and tip feed health from their PC.</p>
              </div>
            </div>
            <div className="shared-session-participant-grid">
              {participantCards.map((participant) => (
                <article
                  key={participant.id}
                  className={`shared-session-participant-card shared-session-participant-card--${participant.connectionStatus === 'connected' ? 'connected' : 'critical'}`}
                >
                  <div className="shared-session-participant-card__header">
                    <div className="shared-session-participant-card__identity">
                      <div className="shared-session-participant-card__avatar">
                        {getParticipantInitials(participant.displayName)}
                      </div>
                      <div>
                        <span className="shared-session-participant-card__role">
                          {participant.role === 'host' ? 'Host' : 'Guest'}
                          {participant.id === localParticipantId ? ' · You' : ''}
                        </span>
                        <strong className="shared-session-participant-card__name">{participant.displayName}</strong>
                      </div>
                    </div>
                    <span className={`status-chip ${participant.connectionStatus === 'connected' ? 'status-chip--connected' : 'status-chip--critical'}`}>
                      {getParticipantPresenceLabel(participant)}
                    </span>
                  </div>

                  <div className="shared-session-participant-card__body">
                    <div className="shared-session-detail-row">
                      <span>Twitch</span>
                      <strong style={{ color: participant.twitchIdentity ? 'var(--green)' : undefined }}>
                        {participant.twitchIdentity ? `@${participant.twitchIdentity.login}` : 'Not linked'}
                      </strong>
                    </div>
                    <div className="shared-session-detail-row">
                      <span>Connection</span>
                      <strong style={{ color: getRuntimeStatusColor(participant.runtimeState.twitchStatus) }}>
                        {getTwitchHealthLabel(participant.runtimeState)}
                      </strong>
                    </div>
                    <div className="shared-session-detail-row">
                      <span>StreamElements</span>
                      <strong style={{ textTransform: 'capitalize', color: getRuntimeStatusColor(participant.runtimeState.streamElementsStatus) }}>
                        {participant.runtimeState.streamElementsStatus}
                      </strong>
                    </div>
                    <div className="shared-session-detail-row">
                      <span>Streamlabs</span>
                      <strong style={{ textTransform: 'capitalize', color: getRuntimeStatusColor(participant.runtimeState.streamlabsStatus) }}>
                        {participant.runtimeState.streamlabsStatus}
                      </strong>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          </section>

          {/* Shared Timer */}
          <section className="panel shared-session-timer-panel">
            <div className="panel-header">
              <div>
                <h2 className="panel-title">Shared Timer</h2>
                <p className="panel-copy">
                  {isHost
                    ? 'You control the shared timer. All connected desktops see the same value in real time.'
                    : 'The host controls the shared timer. Your desktop receives live updates.'}
                </p>
              </div>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <span className={`status-chip ${sharedTimer?.timerStatus === 'running' ? 'status-chip--connected' : 'status-chip--idle'}`}>
                  {sharedTimer?.timerStatus ?? 'idle'}
                </span>
                <span className="mini-chip">{sharedTimer ? formatDurationClock(sharedTimer.uptimeSeconds) : '00:00:00'} uptime</span>
              </div>
            </div>

            {sharedTimer ? (
              <div className="shared-session-timer-layout">
                <div className="shared-session-timer-display">
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
                  {!isHost ? (
                    <p className="shared-session-timer-controls__guest-note">Timer controls are host-only. Your events still contribute to the shared timer.</p>
                  ) : null}

                  <div className="shared-session-control-group">
                    <span className="shared-session-control-group__label">Playback</span>
                    <div className="shared-session-control-row">
                      <button type="button" className="btn btn--primary" onClick={runButtonAction} disabled={!isHost}>{runButtonLabel}</button>
                      <button type="button" className="btn btn--ghost" onClick={resetSharedTimer} disabled={!isHost}>Reset</button>
                    </div>
                  </div>

                  <div className="shared-session-control-group">
                    <span className="shared-session-control-group__label">Quick adjust</span>
                    <div className="shared-session-control-row">
                      <button type="button" className="btn btn--accent" onClick={() => adjustSharedTimer(300, 'host +5 min')} disabled={!isHost}>+5 min</button>
                      <button type="button" className="btn btn--ghost" onClick={() => adjustSharedTimer(60, 'host +1 min')} disabled={!isHost}>+1 min</button>
                      <button type="button" className="btn btn--ghost" onClick={() => adjustSharedTimer(-120, 'host -2 min')} disabled={!isHost}>−2 min</button>
                    </div>
                  </div>

                  <div className="shared-session-control-group">
                    <span className="shared-session-control-group__label">Set exact time</span>
                    <div className="shared-session-set-row">
                      <input
                        className="rule-field__input"
                        value={setTimerDraft}
                        onChange={(e) => setSetTimerDraft(normalizeDurationDraft(e.target.value))}
                        placeholder="06:00:00"
                        disabled={!isHost}
                      />
                      <button type="button" className="btn btn--accent" onClick={applyExactTimer} disabled={!isHost}>Set</button>
                    </div>
                  </div>
                </div>
              </div>
            ) : null}
          </section>

          {/* Shared Wheel */}
          <section className="panel shared-session-wheel-panel">
            <div className="panel-header">
              <div>
                <h2 className="panel-title">Shared Wheel</h2>
                <p className="panel-copy">Qualifying gift bombs trigger one shared wheel spin. Every desktop sees the same result, and timeout outcomes are carried out by the creator whose channel triggered it.</p>
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
                    <p>This result was triggered on your channel — apply the timeout to finish the shared wheel spin.</p>
                    <button
                      type="button"
                      className="btn btn--accent"
                      onClick={() => void applySharedTimeoutResult()}
                      disabled={sharedWheelActionPending}
                    >
                      {sharedWheelActionPending ? 'Applying…' : 'Apply timeout'}
                    </button>
                  </div>
                ) : session.wheelSpin.status === 'ready' && sharedWheelSegment?.outcomeType === 'timeout' ? (
                  <div className="shared-session-wheel-action">
                    <strong>Waiting on source creator</strong>
                    <p>The creator whose channel triggered this wheel spin needs to apply the timeout from their desktop.</p>
                  </div>
                ) : null}
              </div>
            ) : (
              <div className="shared-session-empty-state">
                <strong>No active spin</strong>
                <p>When a qualifying gift bomb arrives from any participant's channel, the shared wheel will spin here for everyone in the room.</p>
              </div>
            )}
          </section>

          {/* Shared Activity */}
          <section className="panel">
            <div className="panel-header">
              <div>
                <h2 className="panel-title">Shared Activity</h2>
                <p className="panel-copy">Events from all participants applied to the shared timer, labeled by source creator.</p>
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
                <strong>No activity yet</strong>
                <p>Qualifying Twitch and tip events from any connected creator will appear here once the session is active.</p>
              </div>
            )}
          </section>
        </>
      )}

      {/* Create modal */}
      {createOpen ? (
        <div className="shared-session-modal-backdrop" role="presentation" onClick={() => setCreateOpen(false)}>
          <div className="shared-session-modal" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
            <div className="shared-session-modal__header">
              <div>
                <h2 className="panel-title">Create shared session</h2>
                <p className="panel-copy">Your timer rules and wheel segments are copied into the session automatically.</p>
              </div>
              <button type="button" className="btn btn--ghost" onClick={() => setCreateOpen(false)}>Close</button>
            </div>

            <div className="shared-session-modal__fields">
              <label className="rule-field">
                <span className="rule-field__label">Session title <span style={{ fontWeight: 400, color: 'var(--text-muted)' }}>(optional)</span></span>
                <input
                  className="rule-field__input"
                  value={sessionTitle}
                  onChange={(e) => setSessionTitle(e.target.value)}
                  placeholder={twitchSession ? `${twitchSession.login}'s Shared Subathon` : 'Shared Subathon'}
                  autoFocus
                />
              </label>

              <div className="shared-session-modal__identity">
                <span className="shared-session-modal__identity-label">Hosting as</span>
                <div className="shared-session-modal__identity-row">
                  <div className="shared-session-participant-card__avatar shared-session-participant-card__avatar--sm">
                    {twitchSession ? getParticipantInitials(twitchSession.login) : '?'}
                  </div>
                  <strong className="shared-session-modal__identity-name">
                    {twitchSession ? `@${twitchSession.login}` : 'No Twitch account connected'}
                  </strong>
                </div>
              </div>
            </div>

            <div className="shared-session-modal__actions">
              <button type="button" className="btn btn--ghost" onClick={() => setCreateOpen(false)}>Cancel</button>
              <button
                type="button"
                className="btn btn--primary"
                onClick={() => void handleCreate()}
                disabled={status === 'creating' || status === 'connecting' || !twitchSession}
              >
                {status === 'creating' || status === 'connecting' ? 'Creating…' : 'Create session'}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {/* Join modal */}
      {joinOpen ? (
        <div className="shared-session-modal-backdrop" role="presentation" onClick={() => setJoinOpen(false)}>
          <div className="shared-session-modal" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
            <div className="shared-session-modal__header">
              <div>
                <h2 className="panel-title">Join shared session</h2>
                <p className="panel-copy">Get the invite code from the host's app and enter it below.</p>
              </div>
              <button type="button" className="btn btn--ghost" onClick={() => setJoinOpen(false)}>Close</button>
            </div>

            <div className="shared-session-modal__fields">
              <label className="rule-field">
                <span className="rule-field__label">Invite code</span>
                <input
                  className="rule-field__input shared-session-modal__code-input"
                  value={joinCode}
                  onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                  placeholder="ABC123"
                  maxLength={6}
                  autoFocus
                />
                <span className="rule-field__hint">Six characters, uppercase. Easy to read over voice chat.</span>
              </label>

              <div className="shared-session-modal__identity">
                <span className="shared-session-modal__identity-label">Joining as</span>
                <div className="shared-session-modal__identity-row">
                  <div className="shared-session-participant-card__avatar shared-session-participant-card__avatar--sm">
                    {twitchSession ? getParticipantInitials(twitchSession.login) : '?'}
                  </div>
                  <strong className="shared-session-modal__identity-name">
                    {twitchSession ? `@${twitchSession.login}` : 'No Twitch account connected'}
                  </strong>
                </div>
              </div>
            </div>

            <div className="shared-session-modal__actions">
              <button type="button" className="btn btn--ghost" onClick={() => setJoinOpen(false)}>Cancel</button>
              <button
                type="button"
                className="btn btn--accent"
                onClick={() => void handleJoin()}
                disabled={status === 'joining' || status === 'connecting' || joinCode.trim().length < 4 || !twitchSession}
              >
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

  if (parts.length === 0) return 0
  if (parts.length === 1) return parts[0] * 60
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
