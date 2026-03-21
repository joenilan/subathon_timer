import { useMemo, useState } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { TWITCH_SCOPE_LABELS, TWITCH_SCOPES } from '../lib/twitch/constants'
import { useTwitchSessionStore } from '../state/useTwitchSessionStore'
import { useEventSubStore } from '../state/useEventSubStore'
import { selectConnectionsEventSubState, selectConnectionsTwitchState } from '../state/selectors'

function formatTimestamp(value: number | null) {
  if (!value) {
    return 'Not yet'
  }

  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(value)
}

function formatRelativeExpiry(value: number | null) {
  if (!value) {
    return 'Unknown'
  }

  const minutes = Math.max(0, Math.round((value - Date.now()) / 60000))

  if (minutes < 1) {
    return 'Under a minute'
  }

  if (minutes < 60) {
    return `${minutes} min`
  }

  const hours = Math.floor(minutes / 60)
  const remainder = minutes % 60
  return remainder === 0 ? `${hours} hr` : `${hours} hr ${remainder} min`
}

export function ConnectionsPage() {
  const [copied, setCopied] = useState(false)
  const {
    status,
    tokens,
    session,
    deviceFlow,
    lastError,
    startDeviceAuth,
    openVerificationUri,
    validateSession,
    refreshSession,
    disconnect,
    clearError,
  } = useTwitchSessionStore(useShallow(selectConnectionsTwitchState))
  const {
    eventSubStatus,
    eventSubSession,
    eventSubSubscriptions,
    eventSubNotifications,
    eventSubLastMessageAt,
    eventSubError,
  } = useEventSubStore(useShallow(selectConnectionsEventSubState))
  const missingScopes = useMemo(
    () => TWITCH_SCOPES.filter((scope) => !(session?.scopes ?? []).includes(scope)),
    [session],
  )
  const hasScopeGap = status === 'connected' && missingScopes.length > 0
  const hasSavedTokens = Boolean(tokens)
  const canRecoverSavedSession = hasSavedTokens && (status === 'error' || status === 'reconnect-required')

  const statusTone = useMemo(() => {
    if (hasScopeGap) {
      return 'critical'
    }

    if (status === 'connected') {
      return 'connected'
    }

    if (status === 'refreshing' || status === 'bootstrapping' || status === 'authorizing') {
      return 'pending'
    }

    if (status === 'reconnect-required' || status === 'error') {
      return 'critical'
    }

    return 'idle'
  }, [hasScopeGap, status])

  const statusLabel = useMemo(() => {
    if (hasScopeGap) {
      return 'Reconnect required'
    }

    switch (status) {
      case 'connected':
        return 'Connected'
      case 'bootstrapping':
        return 'Checking session'
      case 'refreshing':
        return 'Refreshing token'
      case 'authorizing':
        return 'Waiting for Twitch approval'
      case 'reconnect-required':
        return 'Reconnect required'
      case 'error':
        return 'Needs attention'
      default:
        return 'Not connected'
    }
  }, [hasScopeGap, status])

  const connectActionLabel =
    hasScopeGap || status === 'reconnect-required' || status === 'error'
      ? 'Reconnect Twitch'
      : status === 'refreshing' || status === 'bootstrapping'
        ? 'Checking Session…'
        : 'Connect Twitch'

  const eventSubLabel = useMemo(() => {
    switch (eventSubStatus) {
      case 'connected':
        return 'Connected'
      case 'subscribing':
        return 'Creating subscriptions'
      case 'connecting':
        return 'Connecting'
      case 'reconnecting':
        return 'Reconnecting'
      case 'error':
        return 'Error'
      default:
        return 'Idle'
    }
  }, [eventSubStatus])

  const handleCopyCode = async () => {
    if (!deviceFlow) {
      return
    }

    try {
      await navigator.clipboard.writeText(deviceFlow.userCode)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1500)
    } catch {
      setCopied(false)
    }
  }

  return (
    <div className="page-container connections-page">
      <section className="page-header connections-header">
        <div>
          <h1 className="page-title">Connections</h1>
          <p className="page-desc">Connect Twitch here, keep the session healthy, and confirm live events are flowing into the app.</p>
        </div>
        <div className={`status-chip status-chip--${statusTone}`}>{statusLabel}</div>
      </section>

      {lastError && (
        <div className="alert-banner">
          <span>{lastError}</span>
          <button className="btn btn--ghost" onClick={clearError}>Dismiss</button>
        </div>
      )}

      <div className="connections-grid">
        <section className="panel connections-panel connections-panel--session">
          <div className="panel-header">
            <div>
              <h2 className="panel-title">Twitch Session</h2>
              <p className="panel-copy">Link your Twitch account once, then let the desktop app restore and refresh that session automatically.</p>
            </div>
            {session && <div className="meta-kicker">@{session.login}</div>}
          </div>

          <div className="connections-panel__body connections-panel__body--session">
            {status === 'authorizing' && deviceFlow ? (
              <div className="device-flow">
                <div className="device-flow__code">{deviceFlow.userCode}</div>
                <div className="device-flow__actions">
                  <button className="btn btn--primary" onClick={openVerificationUri}>Open Twitch</button>
                  <button className="btn" onClick={handleCopyCode}>{copied ? 'Copied' : 'Copy Code'}</button>
                  <button className="btn btn--ghost" onClick={disconnect}>Cancel</button>
                </div>
                <div className="fact-grid">
                  <div className="fact">
                    <span className="fact-label">Verification URL</span>
                    <strong>{deviceFlow.verificationUri.replace(/^https?:\/\//, '')}</strong>
                  </div>
                  <div className="fact">
                    <span className="fact-label">Code expires in</span>
                    <strong>{formatRelativeExpiry(deviceFlow.expiresAt)}</strong>
                  </div>
                  <div className="fact">
                    <span className="fact-label">Poll cadence</span>
                    <strong>{deviceFlow.intervalSeconds}s</strong>
                  </div>
                </div>
              </div>
            ) : (
              <div className="session-summary">
                {session && missingScopes.length > 0 ? (
                  <div className="alert-banner alert-banner--stacked">
                    <div className="alert-banner__copy">
                      <span>
                        This saved Twitch session is missing {missingScopes.length} required scope{missingScopes.length === 1 ? '' : 's'} for the current app build. Reconnect Twitch before using moderator timer commands, chat replies, or moderation outcomes.
                      </span>
                      <div className="scope-inline-list">
                        {missingScopes.map((scope) => (
                          <code key={scope}>{scope}</code>
                        ))}
                      </div>
                    </div>
                    <button className="btn btn--primary" onClick={() => void startDeviceAuth()}>
                      Reconnect Twitch
                    </button>
                  </div>
                ) : null}
                <div className="fact-grid">
                  <div className="fact">
                    <span className="fact-label">Account</span>
                    <strong>{session ? `@${session.login}` : 'Not connected'}</strong>
                  </div>
                  <div className="fact">
                    <span className="fact-label">User ID</span>
                    <strong>{session?.userId ?? 'Not available'}</strong>
                  </div>
                  <div className="fact">
                    <span className="fact-label">Last validated</span>
                    <strong>{formatTimestamp(session?.validatedAt ?? null)}</strong>
                  </div>
                  <div className="fact">
                    <span className="fact-label">Token expires in</span>
                    <strong>{formatRelativeExpiry(tokens?.expiresAt ?? null)}</strong>
                  </div>
                </div>

                <div className="action-row">
                  {hasScopeGap ? (
                    <>
                      <button className="btn btn--primary" onClick={() => void startDeviceAuth()}>
                        Reconnect Twitch
                      </button>
                      <button className="btn btn--ghost" onClick={disconnect}>Disconnect</button>
                    </>
                  ) : status === 'connected' ? (
                    <>
                      <button className="btn btn--primary" onClick={() => void validateSession()}>Validate Now</button>
                      <button className="btn" onClick={() => void refreshSession()}>Refresh Token</button>
                      <button className="btn btn--ghost" onClick={disconnect}>Disconnect</button>
                    </>
                  ) : canRecoverSavedSession ? (
                    <>
                      <button className="btn btn--primary" onClick={() => void validateSession()}>Retry Session</button>
                      <button className="btn" onClick={() => void refreshSession()}>Refresh Token</button>
                      <button className="btn btn--ghost" onClick={() => void startDeviceAuth()}>Reconnect Twitch</button>
                    </>
                  ) : (
                    <button className="btn btn--primary" onClick={() => void startDeviceAuth()}>
                      {connectActionLabel}
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>
        </section>

        <section className="panel connections-panel connections-panel--access">
          <div className="panel-header">
            <div>
              <h2 className="panel-title">Permissions</h2>
              <p className="panel-copy">These Twitch permissions cover the current desktop features. Expand them only when a feature actually needs more access.</p>
            </div>
          </div>

          <div className="connections-panel__body connections-panel__body--access">
            <div className="scope-list connections-list">
              {TWITCH_SCOPES.map((scope) => (
                <div key={scope} className="scope-row">
                  <code>{scope}</code>
                  <p>{TWITCH_SCOPE_LABELS[scope]}</p>
                </div>
              ))}
            </div>
          </div>
        </section>
      </div>

      <section className="panel connections-panel connections-panel--eventsub">
        <div className="panel-header">
          <div>
            <h2 className="panel-title">EventSub</h2>
            <p className="panel-copy">Once Twitch is connected, the app opens a live event session and keeps the timer subscriptions active in the background.</p>
          </div>
          <div className={`status-chip status-chip--${eventSubStatus === 'connected' ? 'connected' : eventSubStatus === 'error' ? 'critical' : 'pending'}`}>
            {eventSubLabel}
          </div>
        </div>

        <div className="connections-panel__body connections-panel__body--eventsub">
          {eventSubError && (
            <div className="alert-banner">
              <span>{eventSubError}</span>
            </div>
          )}

          <div className="fact-grid fact-grid--triple">
            <div className="fact">
              <span className="fact-label">Session</span>
              <strong>{eventSubSession?.id ?? 'Not established'}</strong>
            </div>
            <div className="fact">
              <span className="fact-label">Subscriptions</span>
              <strong>{eventSubSubscriptions.length}</strong>
            </div>
            <div className="fact">
              <span className="fact-label">Last event</span>
              <strong>{formatTimestamp(eventSubLastMessageAt)}</strong>
            </div>
          </div>

          <div className="eventsub-columns">
            <div className="scope-list connections-list">
              <div className="panel-subtitle">Active subscriptions</div>
              {eventSubSubscriptions.length > 0 ? (
                eventSubSubscriptions.map((subscription) => (
                  <div key={subscription.id} className="scope-row">
                    <code>{subscription.type}</code>
                    <p>{subscription.status} · v{subscription.version}</p>
                  </div>
                ))
              ) : (
                <div className="scope-row">
                  <code>No active subscriptions yet</code>
                  <p>Connect Twitch and give the live event session a moment to finish starting up.</p>
                </div>
              )}
            </div>

            <div className="scope-list connections-list">
              <div className="panel-subtitle">Recent notifications</div>
              {eventSubNotifications.length > 0 ? (
                eventSubNotifications.map((notification) => (
                  <div key={notification.id} className="scope-row">
                    <code>{notification.title}</code>
                    <p>{notification.detail}</p>
                  </div>
                ))
              ) : (
                <div className="scope-row">
                  <code>No Twitch events yet</code>
                  <p>This list will populate as Twitch events arrive.</p>
                </div>
              )}
            </div>
          </div>
        </div>
      </section>
    </div>
  )
}
