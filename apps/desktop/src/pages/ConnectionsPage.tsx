import { useEffect, useMemo, useState } from 'react'
import { openUrl } from '@tauri-apps/plugin-opener'
import { useShallow } from 'zustand/react/shallow'
import { STREAMLABS_DEFAULT_REDIRECT_URI } from '../lib/platform/nativeStreamlabsAuth'
import { TWITCH_SCOPE_LABELS, TWITCH_SCOPES } from '../lib/twitch/constants'
import type { StreamElementsTokenType, TipProviderStatus } from '../lib/tips/types'
import { useTwitchSessionStore } from '../state/useTwitchSessionStore'
import { useEventSubStore } from '../state/useEventSubStore'
import { useTipSessionStore } from '../state/useTipSessionStore'
import { selectConnectionsEventSubState, selectConnectionsTipState, selectConnectionsTwitchState } from '../state/selectors'

const STREAMELEMENTS_DASHBOARD_URL = 'https://streamelements.com/dashboard'
const STREAMELEMENTS_WEBSOCKET_DOCS_URL = 'https://docs.streamelements.com/websockets'
const STREAMELEMENTS_TIP_SETUP_URL = 'https://docs.streamelements.com/chatbot/commands/default/tip'
const STREAMLABS_DASHBOARD_URL = 'https://streamlabs.com/login?r=https%3A%2F%2Fstreamlabs.com%2Fdashboard'
const STREAMLABS_CONNECT_DOCS_URL = 'https://dev.streamlabs.com/docs/connecting-to-an-account'
const STREAMLABS_DONATIONS_DOCS_URL = 'https://dev.streamlabs.com/reference/donations'
const STREAMLABS_SCOPES_URL = 'https://dev.streamlabs.com/docs/scopes'

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

async function openExternalUrl(url: string) {
  try {
    if ('__TAURI_INTERNALS__' in window) {
      await openUrl(url)
      return
    }
  } catch {
    // Fall back to the browser path below.
  }

  window.open(url, '_blank', 'noopener,noreferrer')
}

export function ConnectionsPage() {
  const [copied, setCopied] = useState(false)
  const [streamElementsToken, setStreamElementsToken] = useState('')
  const [streamElementsTokenType, setStreamElementsTokenType] = useState<StreamElementsTokenType>('apikey')
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
    checkStreamlabsBridge,
    clearTipError,
    connectStreamElements,
    disconnectTipProvider,
    recentTipNotifications,
    startStreamlabsOAuth,
    streamElementsConnection,
    streamElementsLastError,
    streamElementsLastEventAt,
    streamElementsStatus,
    streamlabsAuthorizationPending,
    streamlabsBridgeLastError,
    streamlabsBridgeReachable,
    streamlabsBridgeUrl,
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
  const streamlabsStatusTone = useMemo(
    () => (streamlabsAuthorizationPending ? 'pending' : getProviderStatusTone(streamlabsStatus)),
    [streamlabsAuthorizationPending, streamlabsStatus],
  )
  const streamlabsStatusLabel = useMemo(
    () => (streamlabsAuthorizationPending ? 'Waiting for approval' : getProviderStatusLabel(streamlabsStatus)),
    [streamlabsAuthorizationPending, streamlabsStatus],
  )
  const streamlabsBridgeStatusLabel = useMemo(() => {
    if (streamlabsBridgeReachable === true) {
      return 'Reachable'
    }

    if (streamlabsBridgeReachable === false) {
      return 'Unavailable'
    }

    return 'Unchecked'
  }, [streamlabsBridgeReachable])
  const streamlabsOAuthSupported = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window

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
    await startStreamlabsOAuth()
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
            <p className="panel-copy">Streamlabs now uses app-owned authorization so viewers approve your app instead of pasting raw tokens. StreamElements still uses a user-specific token until their OAuth2 application flow is available for this project.</p>
          </div>
        </div>

        <div className="connections-grid connections-grid--tips">
          <section className="panel connections-panel connections-panel--provider">
            <div className="panel-header">
              <div>
                <h3 className="panel-title">StreamElements</h3>
                <p className="panel-copy">Uses the 2026 Astro websocket gateway. Open the dashboard, switch to the right channel, copy the overlay token or API key, then paste it here.</p>
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

              <div className="scope-list connections-list">
                <div className="panel-subtitle">Quick setup</div>
                <div className="scope-row">
                  <code>1. Open StreamElements dashboard</code>
                  <p>Use the dashboard button below, then click your avatar in the top-right corner and switch to the exact channel you stream from before copying any token.</p>
                </div>
                <div className="scope-row">
                  <code>2. Copy the channel token</code>
                  <p>For the Astro websocket, the easiest path is usually the overlay token / API key for that channel. If you pick the wrong linked account, the app can connect but never receive tips.</p>
                </div>
                <div className="scope-row">
                  <code>3. Paste token here and connect</code>
                  <p>Once connected, new tips will appear in the recent list below and can add time through the shared Tips / donations rule.</p>
                </div>
              </div>

              <div className="action-row">
                <button className="btn btn--ghost" onClick={() => void openExternalUrl(STREAMELEMENTS_DASHBOARD_URL)}>
                  Open Dashboard
                </button>
                <button className="btn btn--ghost" onClick={() => void openExternalUrl(STREAMELEMENTS_WEBSOCKET_DOCS_URL)}>
                  Open Astro Docs
                </button>
                <button className="btn btn--ghost" onClick={() => void openExternalUrl(STREAMELEMENTS_TIP_SETUP_URL)}>
                  Open Tip Setup Docs
                </button>
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
                  <span className="rule-field__hint">The Astro docs support `apikey`, `jwt`, and `oauth2`. If you are unsure, start with the overlay token / API key from the correct StreamElements channel.</span>
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
                <p className="panel-copy">Uses the official donations API with app-owned OAuth. Users click Connect Streamlabs, approve your app in the browser, and the desktop app stores only their returned token locally.</p>
              </div>
              <div className={`status-chip status-chip--${streamlabsStatusTone}`}>{streamlabsStatusLabel}</div>
            </div>

            <div className="connections-panel__body">
              {streamlabsLastError ? (
                <div className="alert-banner">
                  <span>{streamlabsLastError}</span>
                  <button className="btn btn--ghost" onClick={() => clearTipError('streamlabs')}>Dismiss</button>
                </div>
              ) : null}

              {streamlabsBridgeLastError ? (
                <div className="alert-banner">
                  <span>{streamlabsBridgeLastError}</span>
                  <button className="btn btn--ghost" onClick={() => void checkStreamlabsBridge()}>
                    Recheck bridge
                  </button>
                </div>
              ) : null}

              <div className="fact-grid">
                <div className="fact">
                  <span className="fact-label">Authorization flow</span>
                  <strong>Approve app in browser</strong>
                </div>
                <div className="fact">
                  <span className="fact-label">Auth bridge</span>
                  <strong>{streamlabsBridgeStatusLabel}</strong>
                </div>
                <div className="fact">
                  <span className="fact-label">Last tip</span>
                  <strong>{formatTimestamp(streamlabsLastEventAt)}</strong>
                </div>
              </div>

              <div className="scope-row">
                <code>Bridge URL</code>
                <p><code>{streamlabsBridgeUrl}</code></p>
              </div>

              <div className="scope-list connections-list">
                <div className="panel-subtitle">Quick setup</div>
                <div className="scope-row">
                  <code>1. Start the auth bridge</code>
                  <p>Run <code>cd apps/auth-bridge && bun run dev</code> locally, or point this build at your deployed bridge with <code>VITE_TIP_AUTH_BRIDGE_URL</code>. The app currently expects <code>{streamlabsBridgeUrl}</code>.</p>
                </div>
                <div className="scope-row">
                  <code>2. Click Connect Streamlabs</code>
                  <p>The app checks the bridge first, then opens the official Streamlabs authorization page for your account.</p>
                </div>
                <div className="scope-row">
                  <code>3. Approve the app in your browser</code>
                  <p>Once approved, the desktop app captures the local callback and exchanges the code through the app-owned auth bridge. Users never see the app secret.</p>
                </div>
                <div className="scope-row">
                  <code>4. Tips start updating the timer</code>
                  <p>After connection, the app polls the Streamlabs donations endpoint and only applies new donation IDs once.</p>
                </div>
              </div>

              <div className="action-row">
                <button className="btn btn--ghost" onClick={() => void openExternalUrl(STREAMLABS_DASHBOARD_URL)}>
                  Open Dashboard
                </button>
                <button className="btn btn--ghost" onClick={() => void openExternalUrl(STREAMLABS_CONNECT_DOCS_URL)}>
                  Open Auth Docs
                </button>
                <button className="btn btn--ghost" onClick={() => void openExternalUrl(STREAMLABS_DONATIONS_DOCS_URL)}>
                  Open Donations Docs
                </button>
                <button className="btn btn--ghost" onClick={() => void openExternalUrl(STREAMLABS_SCOPES_URL)}>
                  Open Scopes
                </button>
                <button className="btn btn--ghost" onClick={() => void checkStreamlabsBridge()}>
                  Check Bridge
                </button>
              </div>

              {!streamlabsOAuthSupported ? (
                <div className="scope-row">
                  <code>Desktop runtime required</code>
                  <p>Streamlabs OAuth uses the local desktop callback at <code>{STREAMLABS_DEFAULT_REDIRECT_URI}</code>, so this connection flow works in <code>bun run tauri:dev</code> and release builds, not browser-only dev mode.</p>
                </div>
              ) : null}

              <div className="action-row">
                <button
                  className="btn btn--primary"
                  disabled={!streamlabsOAuthSupported || streamlabsAuthorizationPending}
                  onClick={() => void handleConnectStreamlabs()}
                >
                  {streamlabsAuthorizationPending
                    ? 'Waiting For Approval…'
                    : streamlabsConnection
                      ? 'Reconnect Streamlabs'
                      : 'Connect Streamlabs'}
                </button>
                {streamlabsConnection || streamlabsAuthorizationPending ? (
                  <button className="btn btn--ghost" onClick={() => void disconnectTipProvider('streamlabs')}>
                    {streamlabsAuthorizationPending ? 'Cancel' : 'Disconnect'}
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
