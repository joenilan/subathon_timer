import React, { useEffect, useMemo, useRef } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import { useShallow } from 'zustand/react/shallow'
import appVersionText from '../../VERSION?raw'
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
    goals: <svg viewBox="0 0 24 24"><path d="M20 4h-2.18C17.4 2.84 16.3 2 15 2c-1.3 0-2.4.84-2.82 2H4c-1.1 0-2 .9-2 2v13c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm-5 0c.55 0 1 .45 1 1s-.45 1-1 1-1-.45-1-1 .45-1 1-1zM8.5 16.8 5.7 14l1.06-1.06 1.74 1.73 3.74-3.74L13.3 12l-4.8 4.8zm7.5-.8h-2v-2h2v2zm3 0h-2v-2h2v2zm0-4h-5v-2h5v2z" /></svg>,
    settings: <svg viewBox="0 0 24 24"><path d="M19.14,12.94c0.04-0.3,0.06-0.61,0.06-0.94c0-0.32-0.02-0.64-0.06-0.94l2.03-1.58c0.18-0.14,0.23-0.41,0.12-0.61 l-1.92-3.32c-0.12-0.22-0.37-0.29-0.59-0.22l-2.39,0.96c-0.5-0.38-1.03-0.7-1.62-0.94L14.4,2.81c-0.04-0.24-0.24-0.41-0.48-0.41 h-3.84c-0.24,0-0.43,0.17-0.47,0.41L9.25,5.35C8.66,5.59,8.12,5.92,7.63,6.29L5.24,5.33c-0.22-0.08-0.47,0-0.59,0.22L2.73,8.87 C2.62,9.08,2.66,9.34,2.86,9.48l2.03,1.58C4.84,11.36,4.8,11.69,4.8,12s0.02,0.64,0.06,0.94l-2.03,1.58 c-0.18,0.14-0.23,0.41-0.12,0.61l1.92,3.32c0.12,0.22,0.37,0.29,0.59,0.22l2.39-0.96c0.5,0.38,1.03,0.7,1.62,0.94l0.36,2.54 c0.05,0.24,0.24,0.41,0.48,0.41h3.84c0.24,0,0.43-0.17,0.47-0.41l0.36-2.54c0.59-0.24,1.13-0.56,1.62-0.94l2.39,0.96 c0.22,0.08,0.47,0,0.59-0.22l1.92-3.32c0.12-0.22,0.07-0.49-0.12-0.61L19.14,12.94z M12,15.6c-1.98,0-3.6-1.62-3.6-3.6 s1.62-3.6,3.6-3.6s3.6,1.62,3.6,3.6S13.98,15.6,12,15.6z" /></svg>,
    about: <svg viewBox="0 0 24 24"><path d="M11 17h2v-6h-2v6zm0-8h2V7h-2v2zm1 13C6.48 22 2 17.52 2 12S6.48 2 12 2s10 4.48 10 10-4.48 10-10 10zm0-18c-4.41 0-8 3.59-8 8s3.59 8 8 8 8-3.59 8-8-3.59-8-8-8z" /></svg>,
    refresh: <svg viewBox="0 0 24 24"><path d="M17.65 6.35C16.2 4.9 14.21 4 12 4c-4.42 0-7.99 3.58-7.99 8s3.57 8 7.99 8c3.73 0 6.84-2.55 7.73-6h-2.08c-.82 2.33-3.04 4-5.65 4-3.31 0-6-2.69-6-6s2.69-6 6-6c1.66 0 3.14.69 4.22 1.78L13 11h7V4l-2.35 2.35z" /></svg>,
    download: <svg viewBox="0 0 24 24"><path d="M5 20h14v-2H5v2zM19 9h-4V3H9v6H5l7 7 7-7z" /></svg>,
}

const appVersion = appVersionText.trim()

const baseNavItems = [
    { to: '/', label: 'Dashboard', icon: 'dashboard' },
    { to: '/overlays', label: 'Overlays', icon: 'overlays' },
    { to: '/rules', label: 'Rules', icon: 'rules' },
    { to: '/goals', label: 'Goals', icon: 'goals' },
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
    '/goals': 'Goals',
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
    const { update, checking: updateChecking, downloading: updateDownloading, checkForUpdate, installUpdate } = useUpdateStore()
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
    const sidebarIdentityLabel = twitchStatus === 'connected'
        ? `@${twitchSession?.login ?? 'connected'}`
        : canStartSidebarAuth
            ? sidebarAuthLabel
            : canRetrySidebarSession
                ? 'Retry session'
                : canResumeSidebarAuth
                    ? 'Open Twitch'
                    : twitchStatusValue ?? 'Not connected'
    const handleSidebarIdentityClick = () => {
        if (canStartSidebarAuth) {
            void startDeviceAuth()
        } else if (canRetrySidebarSession) {
            void validateSession()
        } else if (canResumeSidebarAuth) {
            void openVerificationUri()
        }
    }
    const handleVersionAction = () => {
        if (update) {
            void installUpdate()
            return
        }
        void checkForUpdate()
    }
    const versionActionLabel = update
        ? updateDownloading
            ? 'Installing update'
            : `Install version ${update.version}`
        : updateChecking
            ? 'Checking for updates'
            : 'Check for updates'
    const shouldShowShellWheelOverlay = showWheelOverlayInAppShell && location.pathname !== '/wheel'

    return (
        <div ref={shellRef} className={`shell${sidebarCollapsed ? ' shell--collapsed' : ''}`}>
            <div className="shell__body">
                <aside className="sidebar">
                    <button className="sidebar-toggle" onClick={() => setSidebarCollapsed(!sidebarCollapsed)} aria-label="Toggle Navigation">
                        {icons.menu}
                    </button>

                    <nav className="sidebar-nav">
                        {navItems.map((item) => (
                            <NavLink
                                key={item.to}
                                to={item.to}
                                end={item.to === '/'}
                                className={({ isActive }) => `nav-item${isActive ? ' nav-item--active' : ''}`}
                            >
                                <span className="nav-icon">{icons[item.icon as keyof typeof icons]}</span>
                                {!sidebarCollapsed && <span className="nav-label">{item.label}</span>}
                            </NavLink>
                        ))}
                    </nav>

                    <div className="sidebar-status-panel">
                        <button
                            type="button"
                            className="sidebar-status-panel__identity"
                            onClick={handleSidebarIdentityClick}
                            disabled={twitchStatus === 'connected' && !hasScopeGap}
                            title={twitchStatusValue ?? sidebarIdentityLabel}
                        >
                            <span className={`sidebar-status-panel__dot sidebar-status-panel__dot--${twitchHealthClass}`} />
                            {!sidebarCollapsed ? <span>{sidebarIdentityLabel}</span> : null}
                        </button>

                        {!sidebarCollapsed ? (
                            <>
                                <div className="sidebar-status-panel__row">
                                    <span className={`sidebar-status-panel__dot sidebar-status-panel__dot--${eventHealthClass}`} />
                                    <span>Events {eventHealthLabel}</span>
                                </div>
                                <div className="sidebar-status-panel__row">
                                    <span className={`sidebar-status-panel__dot sidebar-status-panel__dot--${overlayHealthClass}`} />
                                    <span>Overlay {overlayHealthLabel}</span>
                                </div>
                            </>
                        ) : null}

                        <div className="sidebar-status-panel__version">
                            {!sidebarCollapsed ? (
                                <span className={update ? 'sidebar-status-panel__version-label sidebar-status-panel__version-label--update' : 'sidebar-status-panel__version-label'}>
                                    {update ? `v${update.version} available` : `v${appVersion}`}
                                </span>
                            ) : null}
                            <button
                                type="button"
                                className={update ? 'sidebar-status-panel__icon-btn sidebar-status-panel__icon-btn--update' : 'sidebar-status-panel__icon-btn'}
                                onClick={handleVersionAction}
                                disabled={updateChecking || updateDownloading}
                                aria-label={versionActionLabel}
                                title={versionActionLabel}
                            >
                                {update ? icons.download : icons.refresh}
                            </button>
                        </div>
                    </div>
                </aside>

                <main className="workspace">
                <header className="topbar">
                    <strong>{pageLabels[location.pathname] ?? 'Subathon Timer'}</strong>
                </header>
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
        </div>
    )
}
