import { useEffect, useMemo, useState } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { TWITCH_SCOPE_LABELS, TWITCH_SCOPES } from '../lib/twitch/constants'
import type { StreamElementsTokenType, TipProviderStatus } from '../lib/tips/types'
import { useTwitchSessionStore } from '../state/useTwitchSessionStore'
import { useEventSubStore } from '../state/useEventSubStore'
import { useTipSessionStore } from '../state/useTipSessionStore'
import { selectConnectionsEventSubState, selectConnectionsTipState, selectConnectionsTwitchState } from '../state/selectors'

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

function getProviderStatusTone(status: TipProviderStatus) {
  switch (status) {
    case 'connected':
      return 'connected'
    case 'connecting':
      return 'pending'
    case 'error':
      return 'critical'
    default:
      return 'idle'
  }
}

function getProviderStatusLabel(status: TipProviderStatus) {
  switch (status) {
    case 'connected':
      return 'Connected'
    case 'connecting':
      return 'Connecting'
    case 'error':
      return 'Needs attention'
    default:
      return 'Not connected'
  }
}

export function ConnectionsPage() {
  const [copied, setCopied] = useState(false)
  const [streamElementsToken, setStreamElementsToken] = useState('')
  const [streamElementsTokenType, setStreamElementsTokenType] = useState<StreamElementsTokenType>('apikey')
  const [streamlabsToken, setStreamlabsToken] = useState('')
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
  const {
    clearTipError,
    connectStreamElements,
    connectStreamlabs,
    disconnectTipProvider,
    recentTipNotifications,
    streamElementsConnection,
    streamElementsLastError,
    streamElementsLastEventAt,
    streamElementsStatus,
    streamlabsConnection,
    streamlabsLastError,
    streamlabsLastEventAt,
    streamlabsStatus,
  } = useTipSessionStore(useShallow(selectConnectionsTipState))
  const missingScopes = useMemo(
    () => TWITCH_SCOPES.filter((scope) => !(session?.scopes ?? []).includes(scope)),
    [session],
  )
  const hasScopeGap = status === 'connected' && missingScopes.length > 0
  const hasSavedTokens = Boolean(tokens)
  const canRecoverSavedSession = hasSavedTokens && (status === 'error' || status === 'reconnect-required')
  const streamElementsNotifications = useMemo(
    () => recentTipNotifications.filter((notification) => notification.provider === 'streamelements').slice(0, 4),
    [recentTipNotifications],
  )
  const streamlabsNotifications = useMemo(
    () => recentTipNotifications.filter((notification) => notification.provider === 'streamlabs').slice(0, 4),
    [recentTipNotifications],
  )

  useEffect(() => {
    setStreamElementsToken(streamElementsConnection?.token ?? '')
    setStreamElementsTokenType(streamElementsConnection?.tokenType ?? 'apikey')
  }, [streamElementsConnection])

  useEffect(() => {
    setStreamlabsToken(streamlabsConnection?.accessToken ?? '')
  }, [streamlabsConnection])

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

  const streamElementsStatusLabel = useMemo(
    () => getProviderStatusLabel(streamElementsStatus),
    [streamElementsStatus],
  )
  const streamlabsStatusLabel = useMemo(
    () => getProviderStatusLabel(streamlabsStatus),
    [streamlabsStatus],
  )

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

  const handleConnectStreamElements = async () => {
    await connectStreamElements({
      token: streamElementsToken,
      tokenType: streamElementsTokenType,
    })
  }

  const handleConnectStreamlabs = async () => {
    await connectStreamlabs({
      accessToken: streamlabsToken,
    })
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

      <section className="panel connections-panel">
        <div className="panel-header">
          <div>
            <h2 className="panel-title">Tips & donations</h2>
            <p className="panel-copy">Connect StreamElements and Streamlabs tip feeds here. Both providers feed the same tip rule on the Rules page, so you only configure the timer math once.</p>
          </div>
        </div>

        <div className="connections-grid connections-grid--tips">
          <section className="panel connections-panel connections-panel--provider">
            <div className="panel-header">
              <div>
                <h3 className="panel-title">StreamElements</h3>
                <p className="panel-copy">Uses the 2026 Astro websocket gateway. Paste a channel token from the correct StreamElements dashboard account, then the app subscribes to `channel.tips`.</p>
              </div>
              <div className={`status-chip status-chip--${getProviderStatusTone(streamElementsStatus)}`}>{streamElementsStatusLabel}</div>
            </div>

            <div className="connections-panel__body">
              {streamElementsLastError ? (
                <div className="alert-banner">
                  <span>{streamElementsLastError}</span>
                  <button className="btn btn--ghost" onClick={() => clearTipError('streamelements')}>Dismiss</button>
                </div>
              ) : null}

              <div className="fact-grid">
                <div className="fact">
                  <span className="fact-label">Token type</span>
                  <strong>{streamElementsConnection?.tokenType ?? 'Not set'}</strong>
                </div>
                <div className="fact">
                  <span className="fact-label">Last tip</span>
                  <strong>{formatTimestamp(streamElementsLastEventAt)}</strong>
                </div>
              </div>

              <div className="provider-field-grid">
                <label className="rule-field rule-field--compact">
                  <span className="rule-field__label">Token type</span>
                  <select
                    className="rule-field__input"
                    value={streamElementsTokenType}
                    onChange={(event) => setStreamElementsTokenType(event.target.value as StreamElementsTokenType)}
                  >
                    <option value="apikey">Overlay token / API key</option>
                    <option value="jwt">JWT</option>
                    <option value="oauth2">OAuth2 token</option>
                  </select>
                  <span className="rule-field__hint">The Astro docs support `apikey`, `jwt`, and `oauth2`. The easiest path is the dashboard overlay token for the correct channel.</span>
                </label>

                <label className="rule-field rule-field--compact">
                  <span className="rule-field__label">Websocket token</span>
                  <input
                    className="rule-field__input"
                    type="password"
                    spellCheck={false}
                    autoComplete="off"
                    placeholder="Paste StreamElements token"
                    value={streamElementsToken}
                    onChange={(event) => setStreamElementsToken(event.target.value)}
                  />
                  <span className="rule-field__hint">The token is stored locally in the native secure session store when you run under Tauri.</span>
                </label>
              </div>

              <div className="action-row">
                <button className="btn btn--primary" onClick={() => void handleConnectStreamElements()}>
                  {streamElementsConnection ? 'Reconnect StreamElements' : 'Connect StreamElements'}
                </button>
                {streamElementsConnection ? (
                  <button className="btn btn--ghost" onClick={() => void disconnectTipProvider('streamelements')}>
                    Disconnect
                  </button>
                ) : null}
              </div>

              <div className="scope-list connections-list">
                <div className="panel-subtitle">Recent StreamElements tips</div>
                {streamElementsNotifications.length > 0 ? (
                  streamElementsNotifications.map((notification) => (
                    <div key={notification.id} className="scope-row">
                      <code>{notification.title}</code>
                      <p>{notification.detail}</p>
                    </div>
                  ))
                ) : (
                  <div className="scope-row">
                    <code>No tips yet</code>
                    <p>Once StreamElements tip events arrive, they will show up here before they hit the timer activity feed.</p>
                  </div>
                )}
              </div>
            </div>
          </section>

          <section className="panel connections-panel connections-panel--provider">
            <div className="panel-header">
              <div>
                <h3 className="panel-title">Streamlabs</h3>
                <p className="panel-copy">Uses the official donations API with polling. Paste an OAuth access token that includes `donations.read`, and the app will poll for new donations without pulling in the legacy Socket.IO client Streamlabs still documents.</p>
              </div>
              <div className={`status-chip status-chip--${getProviderStatusTone(streamlabsStatus)}`}>{streamlabsStatusLabel}</div>
            </div>

            <div className="connections-panel__body">
              {streamlabsLastError ? (
                <div className="alert-banner">
                  <span>{streamlabsLastError}</span>
                  <button className="btn btn--ghost" onClick={() => clearTipError('streamlabs')}>Dismiss</button>
                </div>
              ) : null}

              <div className="fact-grid">
                <div className="fact">
                  <span className="fact-label">Auth mode</span>
                  <strong>{streamlabsConnection ? 'Access token' : 'Not set'}</strong>
                </div>
                <div className="fact">
                  <span className="fact-label">Last tip</span>
                  <strong>{formatTimestamp(streamlabsLastEventAt)}</strong>
                </div>
              </div>

              <div className="provider-field-grid">
                <label className="rule-field rule-field--compact">
                  <span className="rule-field__label">Access token</span>
                  <input
                    className="rule-field__input"
                    type="password"
                    spellCheck={false}
                    autoComplete="off"
                    placeholder="Paste Streamlabs access token"
                    value={streamlabsToken}
                    onChange={(event) => setStreamlabsToken(event.target.value)}
                  />
                  <span className="rule-field__hint">Use a Streamlabs OAuth access token with `donations.read`. The app polls `GET /donations` and only applies newly seen donation IDs.</span>
                </label>
              </div>

              <div className="action-row">
                <button className="btn btn--primary" onClick={() => void handleConnectStreamlabs()}>
                  {streamlabsConnection ? 'Reconnect Streamlabs' : 'Connect Streamlabs'}
                </button>
                {streamlabsConnection ? (
                  <button className="btn btn--ghost" onClick={() => void disconnectTipProvider('streamlabs')}>
                    Disconnect
                  </button>
                ) : null}
              </div>

              <div className="scope-list connections-list">
                <div className="panel-subtitle">Recent Streamlabs tips</div>
                {streamlabsNotifications.length > 0 ? (
                  streamlabsNotifications.map((notification) => (
                    <div key={notification.id} className="scope-row">
                      <code>{notification.title}</code>
                      <p>{notification.detail}</p>
                    </div>
                  ))
                ) : (
                  <div className="scope-row">
                    <code>No tips yet</code>
                    <p>Once Streamlabs donation events arrive, they will show up here before they hit the timer activity feed.</p>
                  </div>
                )}
              </div>
            </div>
          </section>
        </div>
      </section>

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
