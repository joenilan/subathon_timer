import { getCurrentWindow, LogicalSize } from '@tauri-apps/api/window'

export async function applyWindowSizing(
    pathname: string,
    _element: HTMLElement | null,
    sidebarCollapsed: boolean,
    dashMode: 'minimal' | 'live',
    _showTrend: boolean,
    _showActivity: boolean,
) {
    if (!('__TAURI_INTERNALS__' in window)) return

    const appWindow = getCurrentWindow()

    // Base constants
    const SIDEBAR_W_EXPANDED = 164
    const SIDEBAR_W_COLLAPSED = 46
    const MIN_CONTENT_W = 562
    const useCompactDashboardShell = pathname === '/' && dashMode === 'minimal'
    const effectiveSidebarCollapsed = sidebarCollapsed || useCompactDashboardShell
    const sidebarWidth = effectiveSidebarCollapsed ? SIDEBAR_W_COLLAPSED : SIDEBAR_W_EXPANDED

    // Default dimensions
    let width = 720
    let height = 580
    let minWidth = MIN_CONTENT_W + sidebarWidth
    let minHeight = 360

    if (pathname === '/') {
        const dashHasTrend = dashMode === 'live'
        const dashHasActivity = dashMode === 'live'
        const DASH_W = 840
        width = DASH_W + sidebarWidth
        minWidth = MIN_CONTENT_W + sidebarWidth

        if (dashHasTrend && dashHasActivity) {
            height = 640
            minHeight = 520
        } else {
            height = 640
            minHeight = 520
        }
    } else if (pathname === '/wheel') {
        width = 1040 + sidebarWidth
        height = 860
        minWidth = MIN_CONTENT_W + sidebarWidth
        minHeight = 700
    } else if (pathname === '/connections' || pathname === '/overlays' || pathname === '/rules') {
        width = 900 + sidebarWidth
        height = 680
        minWidth = MIN_CONTENT_W + sidebarWidth
        minHeight = 520
    } else if (pathname === '/settings') {
        width = 760 + sidebarWidth
        height = 560
        minWidth = MIN_CONTENT_W + sidebarWidth
        minHeight = 420
    }

    if (effectiveSidebarCollapsed) {
        width = minWidth
    }

    try {
        await appWindow.setMinSize(new LogicalSize(minWidth, minHeight))
        await appWindow.setSize(new LogicalSize(width, height))
    } catch (err) {
        console.warn("Window resize failed or not supported in this environment", err)
    }
}
