import React, { useEffect, useMemo, useRef, useState } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import { useShallow } from 'zustand/react/shallow'
import { useAppStore } from '../state/useAppStore'
import { useUpdateStore } from '../state/useUpdateStore'
import { applyWindowSizing } from '../lib/platform/windowSizing'
import { useTwitchSessionStore } from '../state/useTwitchSessionStore'
import { useEventSubStore } from '../state/useEventSubStore'
import { TWITCH_SCOPES } from '../lib/twitch/constants'
import { WheelLiveSurface } from './WheelLiveSurface'
import { selectSidebarFrameState, selectTwitchSidebarState } from '../state/selectors'

const icons = {
    menu: <svg viewBox="0 0 24 24"><path d="M3 18h18v-2H3v2zm0-5h18v-2H3v2zm0-7v2h18V6H3z" /></svg>,
    dashboard: <svg viewBox="0 0 24 24"><path d="M3 13h8V3H3v10zm0 8h8v-6H3v6zm10 0h8V11h-8v10zm0-18v6h8V3h-8z" /></svg>,
    overlays: <svg viewBox="0 0 24 24"><path d="M21 3H3c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h18c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm0 16H3V5h18v14zm-10-7h9v6h-9z" /></svg>,
    connections: <svg viewBox="0 0 24 24"><path d="M3.9 12c0-1.71 1.39-3.1 3.1-3.1h4V7H7c-2.76 0-5 2.24-5 5s2.24 5 5 5h4v-1.9H7c-1.71 0-3.1-1.39-3.1-3.1zM8 13h8v-2H8v2zm9-6h-4v1.9h4c1.71 0 3.1 1.39 3.1 3.1s-1.39 3.1-3.1 3.1h-4V17h4c2.76 0 5-2.24 5-5s-2.24-5-5-5z" /></svg>,
    shared: <svg viewBox="0 0 24 24"><path d="M16 11c1.66 0 2.99-1.34 2.99-3S17.66 5 16 5s-3 1.34-3 3 1.34 3 3 3zm-8 0c1.66 0 2.99-1.34 2.99-3S9.66 5 8 5 5 6.34 5 8s1.34 3 3 3zm0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5C15 14.17 10.33 13 8 13zm8 0c-.29 0-.62.02-.97.05 1.16.84 1.97 1.96 1.97 3.45V19h6v-2.5c0-2.33-4.67-3.5-7-3.5z"/></svg>,
    wheel: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><circle cx="12" cy="12" r="10" /><circle cx="12" cy="12" r="3" fill="currentColor" stroke="none" /><line x1="12" y1="2" x2="12" y2="9" /><line x1="12" y1="15" x2="12" y2="22" /><line x1="2" y1="12" x2="9" y2="12" /><line x1="15" y1="12" x2="22" y2="12" /><line x1="4.9" y1="4.9" x2="8.5" y2="8.5" /><line x1="15.5" y1="15.5" x2="19.1" y2="19.1" /><line x1="19.1" y1="4.9" x2="15.5" y2="8.5" /><line x1="8.5" y1="15.5" x2="4.9" y2="19.1" /></svg>,
    rules: <svg viewBox="0 0 24 24"><path d="M3 13h2v-2H3v2zm0 4h2v-2H3v2zm0-8h2V7H3v2zm4 4h14v-2H7v2zm0 4h14v-2H7v2zM7 7v2h14V7H7z" /></svg>,
    settings: <svg viewBox="0 0 24 24"><path d="M19.14,12.94c0.04-0.3,0.06-0.61,0.06-0.94c0-0.32-0.02-0.64-0.06-0.94l2.03-1.58c0.18-0.14,0.23-0.41,0.12-0.61 l-1.92-3.32c-0.12-0.22-0.37-0.29-0.59-0.22l-2.39,0.96c-0.5-0.38-1.03-0.7-1.62-0.94L14.4,2.81c-0.04-0.24-0.24-0.41-0.48-0.41 h-3.84c-0.24,0-0.43,0.17-0.47,0.41L9.25,5.35C8.66,5.59,8.12,5.92,7.63,6.29L5.24,5.33c-0.22-0.08-0.47,0-0.59,0.22L2.73,8.87 C2.62,9.08,2.66,9.34,2.86,9.48l2.03,1.58C4.84,11.36,4.8,11.69,4.8,12s0.02,0.64,0.06,0.94l-2.03,1.58 c-0.18,0.14-0.23,0.41-0.12,0.61l1.92,3.32c0.12,0.22,0.37,0.29,0.59,0.22l2.39-0.96c0.5,0.38,1.03,0.7,1.62,0.94l0.36,2.54 c0.05,0.24,0.24,0.41,0.48,0.41h3.84c0.24,0,0.43-0.17,0.47-0.41l0.36-2.54c0.59-0.24,1.13-0.56,1.62-0.94l2.39,0.96 c0.22,0.08,0.47,0,0.59-0.22l1.92-3.32c0.12-0.22,0.07-0.49-0.12-0.61L19.14,12.94z M12,15.6c-1.98,0-3.6-1.62-3.6-3.6 s1.62-3.6,3.6-3.6s3.6,1.62,3.6,3.6S13.98,15.6,12,15.6z" /></svg>,
    about: <svg viewBox="0 0 24 24"><path d="M11 17h2v-6h-2v6zm0-8h2V7h-2v2zm1 13C6.48 22 2 17.52 2 12S6.48 2 12 2s10 4.48 10 10-4.48 10-10 10zm0-18c-4.41 0-8 3.59-8 8s3.59 8 8 8 8-3.59 8-8-3.59-8-8-8z" /></svg>
}

const baseNavItems = [
    { to: '/', label: 'Dashboard', icon: 'dashboard' },
    { to: '/overlays', label: 'Overlays', icon: 'overlays' },
    { to: '/rules', label: 'Rules', icon: 'rules' },
    { to: '/wheel', label: 'Wheel', icon: 'wheel' },
    { to: '/connections', label: 'Connections', icon: 'connections' },
    { to: '/settings', label: 'Settings', icon: 'settings' },
    { to: '/about', label: 'About', icon: 'about' }
] as const

const sharedSessionNavItem = { to: '/shared-session', label: 'Shared Session', icon: 'shared' } as const

const pageLabels: Record<string, string> = {
    '/': 'Dashboard',
    '/overlays': 'Overlays',
    '/rules': 'Timer Rules',
    '/wheel': 'Spin Wheel',
    '/connections': 'Connections',
    '/shared-session': 'Shared Session',
    '/settings': 'Settings',
    '/about': 'About',
}

export function AppFrame({ children }: { children: React.ReactNode }) {
    const location = useLocation()
    const {
        sidebarCollapsed,
        setSidebarCollapsed,
        dashMode,
        showTrend,
        showActivity,
        showWheelOverlayInAppShell,
        overlayBaseUrl,
        overlayPreviewBaseUrl,
        overlayLanBaseUrl,
        overlayLanAccessEnabled,
        wheelSegments,
        wheelSpin,
        wheelTextScale,
    } = useAppStore(useShallow(selectSidebarFrameState))
    const sharedSessionEnabled = useAppStore((state) => state.sharedSessionEnabled)
    const navItems = sharedSessionEnabled
        ? [...baseNavItems.slice(0, 5), sharedSessionNavItem, ...baseNavItems.slice(5)]
        : baseNavItems
    const {
        twitchStatus,
        twitchTokens,
        twitchSession,
        deviceFlow,
        startDeviceAuth,
        openVerificationUri,
        validateSession,
    } = useTwitchSessionStore(
        useShallow((state) => {
            const selected = selectTwitchSidebarState(state)
            return {
                twitchStatus: selected.status,
                twitchTokens: selected.tokens,
                twitchSession: selected.session,
                deviceFlow: selected.deviceFlow,
                startDeviceAuth: selected.startDeviceAuth,
                openVerificationUri: selected.openVerificationUri,
                validateSession: selected.validateSession,
            }
        }),
    )
    const eventSubStatus = useEventSubStore((state) => state.status)
    const update = useUpdateStore((state) => state.update)
    const updateChecking = useUpdateStore((state) => state.checking)
    const [dismissedVersion, setDismissedVersion] = useState<string | null>(
        () => localStorage.getItem('dismissed-update')
    )
    const showUpdateBanner = !!update && update.version !== dismissedVersion
    const dismissUpdate = () => {
        if (update) {
            localStorage.setItem('dismissed-update', update.version)
            setDismissedVersion(update.version)
        }
    }
    const shellRef = useRef<HTMLDivElement>(null)
    const missingScopes = useMemo(
        () => TWITCH_SCOPES.filter((scope) => !(twitchSession?.scopes ?? []).includes(scope)),
        [twitchSession],
    )
    const hasScopeGap = twitchStatus === 'connected' && missingScopes.length > 0

    useEffect(() => {
        void applyWindowSizing(location.pathname, shellRef.current, sidebarCollapsed, dashMode, showTrend, showActivity)
    }, [location.pathname, sidebarCollapsed, dashMode, showTrend, showActivity])

    useEffect(() => {
        window.localStorage.setItem('fdgt.sidebarCollapsed', sidebarCollapsed ? '1' : '0')
    }, [sidebarCollapsed])

    const twitchHealthClass =
        hasScopeGap
            ? 'action-required'
            : twitchStatus === 'connected'
            ? 'connected'
            : twitchStatus === 'refreshing' || twitchStatus === 'bootstrapping' || twitchStatus === 'authorizing'
                ? 'degraded'
                : 'action-required'

    const eventHealthClass =
        eventSubStatus === 'connected'
            ? 'connected'
            : eventSubStatus === 'connecting' || eventSubStatus === 'subscribing' || eventSubStatus === 'reconnecting'
                ? 'degraded'
                : eventSubStatus === 'error'
                    ? 'action-required'
                    : 'degraded'

    const eventHealthLabel =
        eventSubStatus === 'connected'
            ? 'Live'
            : eventSubStatus === 'subscribing'
                ? 'Subscribing'
                : eventSubStatus === 'connecting' || eventSubStatus === 'reconnecting'
                    ? 'Connecting'
                    : eventSubStatus === 'error'
                        ? 'Error'
                        : 'Idle'

    const isNativeRuntime = '__TAURI_INTERNALS__' in window
    const overlayRuntimeReady = Boolean(overlayPreviewBaseUrl ?? overlayBaseUrl)
    const overlayHasLanIssue = overlayLanAccessEnabled && overlayRuntimeReady && !overlayLanBaseUrl
    const overlayHealthClass =
        overlayRuntimeReady
            ? overlayHasLanIssue
                ? 'action-required'
                : 'connected'
            : isNativeRuntime
                ? 'action-required'
                : 'degraded'
    const overlayHealthLabel = overlayRuntimeReady
        ? overlayLanAccessEnabled
            ? overlayLanBaseUrl
                ? 'LAN'
                : 'LAN issue'
            : 'Local'
        : isNativeRuntime
            ? 'Unavailable'
            : 'Preview'
    const canRetrySidebarSession = twitchStatus === 'error' && Boolean(twitchTokens)
    const canStartSidebarAuth =
        hasScopeGap ||
        twitchStatus === 'idle' || twitchStatus === 'reconnect-required' || (twitchStatus === 'error' && !twitchTokens)
    const canResumeSidebarAuth = twitchStatus === 'authorizing' && deviceFlow
    const sidebarAuthLabel =
        hasScopeGap || twitchStatus === 'reconnect-required' || twitchStatus === 'error'
            ? 'Reconnect Twitch'
            : 'Connect Twitch'
    const twitchStatusValue =
        hasScopeGap
            ? `${missingScopes.length} permission${missingScopes.length === 1 ? '' : 's'} missing`
            : twitchStatus === 'connected'
            ? `@${twitchSession?.login ?? 'connected'}`
            : twitchStatus === 'authorizing'
                ? 'Waiting for approval'
                : twitchStatus === 'refreshing' || twitchStatus === 'bootstrapping'
                    ? 'Checking session…'
                    : twitchStatus === 'error'
                        ? 'Session check failed'
                        : null
    const shouldShowShellWheelOverlay = showWheelOverlayInAppShell && location.pathname !== '/wheel'

    return (
        <div ref={shellRef} className={`shell${sidebarCollapsed ? ' shell--collapsed' : ''}`}>
            <aside className="sidebar">
                <button className="sidebar-toggle" onClick={() => setSidebarCollapsed(!sidebarCollapsed)} aria-label="Toggle Navigation">
                    {icons.menu}
                </button>

                <nav className="sidebar-nav">
                    {navItems.map((item) => {
                        const hasBadge = item.to === '/about' && !!update
                        return (
                            <NavLink
                                key={item.to}
                                to={item.to}
                                end={item.to === '/'}
                                className={({ isActive }) => `nav-item${isActive ? ' nav-item--active' : ''}`}
                            >
                                <span className="nav-icon" style={{ position: 'relative' }}>
                                    {icons[item.icon as keyof typeof icons]}
                                    {hasBadge && (
                                        <span style={{
                                            position: 'absolute', top: '-3px', right: '-3px',
                                            width: '8px', height: '8px',
                                            background: '#facc15', borderRadius: '50%',
                                        }} />
                                    )}
                                </span>
                                {!sidebarCollapsed && <span className="nav-label">{item.label}</span>}
                                {!sidebarCollapsed && hasBadge && (
                                    <span style={{ marginLeft: 'auto', fontSize: '10px', fontWeight: 700, color: '#facc15', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                                        Update
                                    </span>
                                )}
                            </NavLink>
                        )
                    })}
                </nav>

                <div className="sidebar-health">
                    <div className="health-item health-item--twitch">
                        {!sidebarCollapsed && (
                            <>
                                <div className="health-item__meta">
                                    <div className={`health-dot ${twitchHealthClass}`} title={`Twitch ${twitchStatusValue ?? 'Disconnected'}`} />
                                    <span className="health-label">Twitch</span>
                                </div>
                                <div className="health-item__body">
                                    {canStartSidebarAuth ? (
                                        <button
                                            type="button"
                                            className="health-inline-link"
                                            onClick={() => void startDeviceAuth()}
                                            title={sidebarAuthLabel}
                                        >
                                            {sidebarAuthLabel}
                                        </button>
                                    ) : canRetrySidebarSession ? (
                                        <button
                                            type="button"
                                            className="health-inline-link"
                                            onClick={() => void validateSession()}
                                            title="Retry saved Twitch session"
                                        >
                                            Retry Session
                                        </button>
                                    ) : canResumeSidebarAuth ? (
                                        <button
                                            type="button"
                                            className="health-inline-link"
                                            onClick={() => void openVerificationUri()}
                                            title="Open Twitch verification page"
                                        >
                                            Open Twitch
                                        </button>
                                    ) : twitchStatusValue ? (
                                        <span className="health-status">{twitchStatusValue}</span>
                                    ) : null}
                                </div>
                            </>
                        )}
                        {sidebarCollapsed ? (
                            <div className={`health-dot ${twitchHealthClass}`} title={`Twitch ${twitchStatusValue ?? 'Disconnected'}`} />
                        ) : null}
                    </div>
                    <div className="health-item">
                        {!sidebarCollapsed && (
                            <>
                                <div className="health-item__meta">
                                    <div className={`health-dot ${eventHealthClass}`} title={`Events ${eventHealthLabel}`} />
                                    <span className="health-label">Events</span>
                                </div>
                                <div className="health-item__body">
                                    <span className="health-status">{eventHealthLabel}</span>
                                </div>
                            </>
                        )}
                        {sidebarCollapsed ? (
                            <div className={`health-dot ${eventHealthClass}`} title={`Events ${eventHealthLabel}`} />
                        ) : null}
                    </div>
                    <div className="health-item">
                        {!sidebarCollapsed && (
                            <>
                                <div className="health-item__meta">
                                    <div className={`health-dot ${overlayHealthClass}`} title={overlayRuntimeReady ? overlayLanAccessEnabled ? overlayLanBaseUrl ? 'Overlay LAN source ready' : 'Overlay LAN source missing a private network address' : 'Overlay local server ready' : isNativeRuntime ? 'Overlay local server unavailable on port 31847' : 'Overlay preview mode'} />
                                    <span className="health-label">Overlay</span>
                                </div>
                                <div className="health-item__body">
                                    <span className="health-status">{overlayHealthLabel}</span>
                                </div>
                            </>
                        )}
                        {sidebarCollapsed ? (
                            <div className={`health-dot ${overlayHealthClass}`} title={overlayRuntimeReady ? overlayLanAccessEnabled ? overlayLanBaseUrl ? 'Overlay LAN source ready' : 'Overlay LAN source missing a private network address' : 'Overlay local server ready' : isNativeRuntime ? 'Overlay local server unavailable on port 31847' : 'Overlay preview mode'} />
                        ) : null}
                    </div>
                    <div className="health-item">
                        {!sidebarCollapsed && (
                            <>
                                <div className="health-item__meta">
                                    <div
                                        className={`health-dot ${update ? 'action-required' : updateChecking ? 'degraded' : 'connected'}`}
                                        title={update ? `Update v${update.version} available` : updateChecking ? 'Checking for updates' : 'App is up to date'}
                                    />
                                    <span className="health-label">App</span>
                                </div>
                                <div className="health-item__body">
                                    <span className="health-status">
                                        {updateChecking ? 'Checking…' : update ? `v${update.version} ready` : 'Up to date'}
                                    </span>
                                </div>
                            </>
                        )}
                        {sidebarCollapsed && (
                            <div
                                className={`health-dot ${update ? 'action-required' : updateChecking ? 'degraded' : 'connected'}`}
                                title={update ? `Update v${update.version} available` : 'App up to date'}
                            />
                        )}
                    </div>
                </div>
            </aside>

            <main className="workspace">
                <header className="topbar">
                    <strong>{pageLabels[location.pathname] ?? 'Subathon Timer'}</strong>
                </header>
                {showUpdateBanner && (
                    <div style={{
                        display: 'flex', alignItems: 'center', gap: '10px',
                        padding: '8px 16px',
                        background: 'rgba(250,204,21,0.08)',
                        borderBottom: '1px solid rgba(250,204,21,0.2)',
                        fontSize: '13px', flexShrink: 0,
                    }}>
                        <span style={{ color: '#fde047', fontWeight: 600, flex: 1 }}>
                            Subathon Timer v{update!.version} is available
                        </span>
                        <button
                            type="button"
                            onClick={() => void useUpdateStore.getState().installUpdate()}
                            style={{ padding: '4px 12px', background: '#facc15', color: '#000', fontWeight: 700, fontSize: '12px', borderRadius: '6px', border: 'none', cursor: 'pointer' }}
                        >
                            Update &amp; Restart
                        </button>
                        <button
                            type="button"
                            onClick={dismissUpdate}
                            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(253,224,71,0.4)', fontSize: '16px', lineHeight: 1, padding: '0 2px' }}
                            title="Dismiss"
                        >
                            ×
                        </button>
                    </div>
                )}
                <div className="workspace-content">
                    {children}
                </div>
                {shouldShowShellWheelOverlay ? (
                    <div className="app-wheel-overlay" aria-hidden="true">
                        <WheelLiveSurface
                            variant="shell"
                            wheelSegments={wheelSegments}
                            wheelSpin={wheelSpin}
                            wheelTextScale={wheelTextScale}
                        />
                    </div>
                ) : null}
            </main>
        </div>
    )
}
