import { useEffect, useMemo, useState } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { useSharedSessionStore } from '../state/useSharedSessionStore'
import { useTipSessionStore } from '../state/useTipSessionStore'
import { useTwitchSessionStore } from '../state/useTwitchSessionStore'
import type {
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

export function SharedSessionPage() {
  const [createOpen, setCreateOpen] = useState(false)
  const [joinOpen, setJoinOpen] = useState(false)
  const [sessionTitle, setSessionTitle] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [joinCode, setJoinCode] = useState('')
  const {
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
    joinSession,
    leaveSession,
    clearError,
    syncParticipantStatus,
  } = useSharedSessionStore(
    useShallow((state) => ({
      serviceUrl: state.serviceUrl,
      serviceHealth: state.serviceHealth,
      serviceMessage: state.serviceMessage,
      status: state.status,
      session: state.session,
      localParticipantId: state.localParticipantId,
      localRole: state.localRole,
      lastError: state.lastError,
      checkHealth: state.checkHealth,
      createSession: state.createSession,
      joinSession: state.joinSession,
      leaveSession: state.leaveSession,
      clearError: state.clearError,
      syncParticipantStatus: state.syncParticipantStatus,
    })),
  )
  const twitchStatus = useTwitchSessionStore((state) => state.status)
  const twitchSession = useTwitchSessionStore((state) => state.session)
  const streamElementsStatus = useTipSessionStore((state) => state.streamelementsStatus)
  const streamlabsStatus = useTipSessionStore((state) => state.streamlabsStatus)

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

  const handleCreate = async () => {
    await createSession({
      title: sessionTitle.trim(),
      displayName: displayName.trim() || twitchSession?.login || 'Host',
      twitchIdentity: localIdentity,
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

  return (
    <div className="page-container settings-page shared-session-page">
      <section className="page-header rules-header">
        <div>
          <h1 className="page-title">Shared Session</h1>
          <p className="page-desc">
            Link two streamers into one shared subathon room, confirm both broadcaster accounts are present, and keep the shared runtime healthy before shared timer sync goes live.
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

      {lastError ? (
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
              <span className="mini-chip">Phase 1</span>
              <h2 className="panel-title">Create the shared room first, then link the shared timer in the next phase</h2>
              <p className="panel-copy">
                This first shared-session build focuses on room creation, invite flow, broadcaster presence, and provider health. It gives both streamers one place to confirm they are linked before shared timer controls are turned on.
              </p>
            </div>
            <div className="shared-session-hero__grid">
              <div className="shared-session-callout">
                <strong>Host streamer</strong>
                <p>Create the room, share the invite code, and stay responsible for the future shared runtime controls.</p>
                <button type="button" className="btn btn--primary" onClick={() => setCreateOpen(true)}>
                  Create shared session
                </button>
              </div>
              <div className="shared-session-callout">
                <strong>Guest streamer</strong>
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
                  <span className={`status-chip ${session.status === 'active' ? 'status-chip--connected' : 'status-chip--pending'}`}>
                    {session.status === 'active' ? 'Both streamers linked' : 'Waiting for guest'}
                  </span>
                  {localRole ? <span className="mini-chip">{localRole === 'host' ? 'Host controls only' : 'Guest view'}</span> : null}
                </div>
                <h2 className="panel-title">{session.title}</h2>
                <p className="panel-copy">
                  This room is live. Both apps should stay on this page long enough to confirm presence, linked Twitch accounts, and provider health before shared timer sync is enabled in the next phase.
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
                <button type="button" className="btn btn--danger" onClick={leaveSession}>
                  Leave session
                </button>
              </div>
            </div>
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
                <p className="panel-copy">Each participant card must clearly show who is in the room, which broadcaster account is linked, and whether that PC is still online.</p>
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
                <span className="rule-field__hint">Use a short label both streamers will recognize during setup.</span>
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
