import { useEffect, useMemo, useState } from 'react'
import { openUrl } from '@tauri-apps/plugin-opener'
import { useShallow } from 'zustand/react/shallow'
import { TWITCH_SCOPE_LABELS, TWITCH_SCOPES } from '../lib/twitch/constants'
import type { TipProviderStatus } from '../lib/tips/types'
import { useTwitchSessionStore } from '../state/useTwitchSessionStore'
import { useEventSubStore } from '../state/useEventSubStore'
import { useTipSessionStore } from '../state/useTipSessionStore'
import { selectConnectionsEventSubState, selectConnectionsTipState, selectConnectionsTwitchState } from '../state/selectors'

const STREAMELEMENTS_CHANNELS_URL = 'https://streamelements.com/dashboard/account/channels'
const STREAMELEMENTS_TOKEN_HELP_URL =
  'https://support.streamelements.com/hc/en-us/articles/10474949304466-How-to-Locate-Your-Account-ID-and-JWT-Token'
const STREAMLABS_API_SETTINGS_URL =
  'https://streamlabs.com/login?r=https%3A%2F%2Fstreamlabs.com%2Fdashboard%23%2Fsettings%2Fapi-settings'
const STREAMLABS_TOKENS_HELP_URL = 'https://support.streamlabs.com/hc/en-us/articles/115000090014-Alerts-Widget-Troubleshooting'

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

function getProviderConnectionSummary(
  providerLabel: string,
  status: TipProviderStatus,
  lastEventAt: number | null,
) {
  switch (status) {
    case 'connected':
      return {
        tone: 'connected',
        title: `${providerLabel} connected`,
        detail: lastEventAt
          ? `Live tip feed is connected. Last tip seen ${formatTimestamp(lastEventAt)}.`
          : 'Live tip feed is connected and waiting for the first new tip.',
      }
    case 'connecting':
      return {
        tone: 'pending',
        title: `Connecting ${providerLabel}...`,
        detail: 'The app is trying to open the live tip feed right now.',
      }
    case 'error':
      return null
    default:
      return {
        tone: 'idle',
        title: `${providerLabel} not connected`,
        detail: 'Paste the token, then click Connect.',
      }
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
  }, [streamElementsConnection])

  useEffect(() => {
    setStreamlabsToken(streamlabsConnection?.token ?? '')
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
  const streamElementsSummary = useMemo(
    () => getProviderConnectionSummary('StreamElements', streamElementsStatus, streamElementsLastEventAt),
    [streamElementsLastEventAt, streamElementsStatus],
  )
  const streamElementsConnectLabel = useMemo(() => {
    if (streamElementsStatus === 'connecting') {
      return 'Connecting...'
    }

    return streamElementsConnection ? 'Reconnect StreamElements' : 'Connect StreamElements'
  }, [streamElementsConnection, streamElementsStatus])
  const streamlabsStatusTone = useMemo(() => getProviderStatusTone(streamlabsStatus), [streamlabsStatus])
  const streamlabsStatusLabel = useMemo(() => getProviderStatusLabel(streamlabsStatus), [streamlabsStatus])
  const streamlabsSummary = useMemo(
    () => getProviderConnectionSummary('Streamlabs', streamlabsStatus, streamlabsLastEventAt),
    [streamlabsLastEventAt, streamlabsStatus],
  )
  const streamlabsConnectLabel = useMemo(() => {
    if (streamlabsStatus === 'connecting') {
      return 'Connecting...'
    }

    return streamlabsConnection ? 'Reconnect Streamlabs' : 'Connect Streamlabs'
  }, [streamlabsConnection, streamlabsStatus])

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
      tokenType: 'jwt',
    })
  }

  const handleConnectStreamlabs = async () => {
    await connectStreamlabs({
      token: streamlabsToken,
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
            <p className="panel-copy">Connect StreamElements or Streamlabs here, then enable the shared <strong>Tips / donations</strong> rule on the Rules page.</p>
          </div>
        </div>

        <div className="connections-grid connections-grid--tips">
          <section className="panel connections-panel connections-panel--provider">
            <div className="panel-header">
              <div>
                <h3 className="panel-title">StreamElements</h3>
                <p className="panel-copy">Click the button, turn on <strong>Show Secrets</strong>, copy the JWT token, paste it here, connect.</p>
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
                  <span className="fact-label">Connection type</span>
                  <strong>JWT token</strong>
                </div>
                <div className="fact">
                  <span className="fact-label">Last tip</span>
                  <strong>{formatTimestamp(streamElementsLastEventAt)}</strong>
                </div>
              </div>

              <div className="scope-list connections-list quick-setup-list quick-setup-list--streamelements">
                <div className="panel-subtitle">Quick setup</div>
                <div className="quick-setup-step">
                  <div className="quick-setup-step__header">
                    <span className="quick-setup-step__badge">1</span>
                    <code className="quick-setup-step__title">Open channel secrets</code>
                  </div>
                  <p>Click <strong>Get StreamElements Token</strong>. It opens the exact page where your channel JWT lives.</p>
                </div>
                <div className="quick-setup-step">
                  <div className="quick-setup-step__header">
                    <span className="quick-setup-step__badge">2</span>
                    <code className="quick-setup-step__title">Turn on Show Secrets</code>
                  </div>
                  <p>The JWT token appears on that same page as soon as secrets are visible.</p>
                </div>
                <div className="quick-setup-step">
                  <div className="quick-setup-step__header">
                    <span className="quick-setup-step__badge">3</span>
                    <code className="quick-setup-step__title">Paste JWT and connect</code>
                  </div>
                  <p>Paste the JWT below and connect. No client ID, client secret, or developer app needed.</p>
                </div>
              </div>

              <div className="provider-helper-actions">
                <div className="panel-subtitle">Open the token page</div>
                <div className="action-row provider-helper-actions__row">
                  <button className="btn btn--ghost" onClick={() => void openExternalUrl(STREAMELEMENTS_CHANNELS_URL)}>
                    Get StreamElements Token
                  </button>
                  <button className="btn btn--ghost" onClick={() => void openExternalUrl(STREAMELEMENTS_TOKEN_HELP_URL)}>
                    Need Help?
                  </button>
                </div>
              </div>

              <div className="provider-field-grid">
                <label className="rule-field rule-field--compact">
                  <span className="rule-field__label">Paste JWT token here</span>
                  <input
                    className="rule-field__input"
                    type="password"
                    spellCheck={false}
                    autoComplete="off"
                    placeholder="Paste StreamElements JWT token"
                    value={streamElementsToken}
                    onChange={(event) => setStreamElementsToken(event.target.value)}
                  />
                  <span className="rule-field__hint">The token is private. It stays local on this PC when you run the desktop app.</span>
                </label>
              </div>

              <div className="action-row">
                <button className="btn btn--primary" onClick={() => void handleConnectStreamElements()}>
                  {streamElementsConnectLabel}
                </button>
                {streamElementsConnection ? (
                  <button className="btn btn--ghost" onClick={() => void disconnectTipProvider('streamelements')}>
                    Disconnect
                  </button>
                ) : null}
              </div>

              {streamElementsSummary ? (
                <div className={`connection-banner connection-banner--${streamElementsSummary.tone}`}>
                  <strong>{streamElementsSummary.title}</strong>
                  <p>{streamElementsSummary.detail}</p>
                </div>
              ) : null}

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
                <p className="panel-copy">Click the button, open the <strong>API Settings</strong> page, reveal <strong>Your Socket API Token</strong>, paste it here, connect.</p>
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

              <div className="fact-grid">
                <div className="fact">
                  <span className="fact-label">Connection type</span>
                  <strong>Socket API Token</strong>
                </div>
                <div className="fact">
                  <span className="fact-label">Last tip</span>
                  <strong>{formatTimestamp(streamlabsLastEventAt)}</strong>
                </div>
              </div>

              <div className="scope-list connections-list quick-setup-list quick-setup-list--streamlabs">
                <div className="panel-subtitle">Quick setup</div>
                <div className="quick-setup-step">
                  <div className="quick-setup-step__header">
                    <span className="quick-setup-step__badge">1</span>
                    <code className="quick-setup-step__title">Open API Settings</code>
                  </div>
                  <p>Click <strong>Get Streamlabs Token</strong>. It opens Streamlabs on the exact settings screen you need.</p>
                </div>
                <div className="quick-setup-step">
                  <div className="quick-setup-step__header">
                    <span className="quick-setup-step__badge">2</span>
                    <code className="quick-setup-step__title">Reveal the Socket API Token</code>
                  </div>
                  <p>Click the <strong>API Settings</strong> tab if needed, then reveal <strong>Your Socket API Token</strong>.</p>
                </div>
                <div className="quick-setup-step">
                  <div className="quick-setup-step__header">
                    <span className="quick-setup-step__badge">3</span>
                    <code className="quick-setup-step__title">Paste token and connect</code>
                  </div>
                  <p>Use the Socket API Token below. Do not use the API Access Token, client ID, client secret, or a developer app.</p>
                </div>
              </div>

              <div className="provider-helper-actions">
                <div className="panel-subtitle">Open the token page</div>
                <div className="action-row provider-helper-actions__row">
                  <button className="btn btn--ghost" onClick={() => void openExternalUrl(STREAMLABS_API_SETTINGS_URL)}>
                    Get Streamlabs Token
                  </button>
                  <button className="btn btn--ghost" onClick={() => void openExternalUrl(STREAMLABS_TOKENS_HELP_URL)}>
                    Need Help?
                  </button>
                </div>
              </div>

              <div className="provider-field-grid">
                <label className="rule-field rule-field--compact">
                  <span className="rule-field__label">Paste Socket API Token here</span>
                  <input
                    className="rule-field__input"
                    type="password"
                    spellCheck={false}
                    autoComplete="off"
                    placeholder="Paste Streamlabs Socket API Token"
                    value={streamlabsToken}
                    onChange={(event) => setStreamlabsToken(event.target.value)}
                  />
                  <span className="rule-field__hint">Paste the exact value Streamlabs labels &quot;Your Socket API Token&quot;, not the API Access Token. It stays local on this PC when you run the desktop app.</span>
                </label>
              </div>

              <div className="action-row">
                <button className="btn btn--primary" onClick={() => void handleConnectStreamlabs()}>
                  {streamlabsConnectLabel}
                </button>
                {streamlabsConnection ? (
                  <button className="btn btn--ghost" onClick={() => void disconnectTipProvider('streamlabs')}>
                    Disconnect
                  </button>
                ) : null}
              </div>

              {streamlabsSummary ? (
                <div className={`connection-banner connection-banner--${streamlabsSummary.tone}`}>
                  <strong>{streamlabsSummary.title}</strong>
                  <p>{streamlabsSummary.detail}</p>
                </div>
              ) : null}

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
