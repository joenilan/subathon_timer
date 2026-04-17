import type { AppState } from './useAppStore'
import type { EventSubState } from './useEventSubStore'
import type { SharedSessionState } from './useSharedSessionStore'
import type { TipSessionState } from './useTipSessionStore'
import type { TwitchSessionState } from './useTwitchSessionStore'

export const selectBootstrapRuntimeState = (state: AppState) => ({
  hydrateNativeSnapshot: state.hydrateNativeSnapshot,
  setOverlayBootstrapState: state.setOverlayBootstrapState,
})

export const selectNativeSnapshotInputs = (state: AppState) => ({
  commandPermissions: state.commandPermissions,
  defaultTimerSeconds: state.defaultTimerSeconds,
  lastAppliedDeltaSeconds: state.lastAppliedDeltaSeconds,
  overlayLanAccessEnabled: state.overlayLanAccessEnabled,
  ruleConfig: state.ruleConfig,
  timerEvents: state.timerEvents,
  timerSessionBaseRemainingSeconds: state.timerSessionBaseRemainingSeconds,
  timerSessionBaseUptimeSeconds: state.timerSessionBaseUptimeSeconds,
  timerSessionRunningSince: state.timerSessionRunningSince,
  timerStatus: state.timerStatus,
  wheelSegments: state.wheelSegments,
})

export const selectOverlayRuntimeState = (state: AppState) => ({
  activity: state.activity,
  overlayLanAccessEnabled: state.overlayLanAccessEnabled,
  reasonOverlayTransform: state.reasonOverlayTransform,
  ruleConfig: state.ruleConfig,
  setOverlayBootstrapState: state.setOverlayBootstrapState,
  wheelOverlayTransform: state.wheelOverlayTransform,
  wheelResultDisplaySeconds: state.wheelResultDisplaySeconds,
  wheelSegments: state.wheelSegments,
  wheelSpin: state.wheelSpin,
  wheelTextScale: state.wheelTextScale,
  timerOverlayTransform: state.timerOverlayTransform,
  timerRemainingSeconds: state.timerRemainingSeconds,
  timerStatus: state.timerStatus,
  timerWidgetTheme: state.timerWidgetTheme,
  trendPoints: state.trendPoints,
  uptimeSeconds: state.uptimeSeconds,
})

export const selectSidebarFrameState = (state: AppState) => ({
  dashMode: state.dashMode,
  overlayBaseUrl: state.overlayBaseUrl,
  overlayPreviewBaseUrl: state.overlayPreviewBaseUrl,
  overlayLanBaseUrl: state.overlayLanBaseUrl,
  overlayLanAccessEnabled: state.overlayLanAccessEnabled,
  setSidebarCollapsed: state.setSidebarCollapsed,
  showWheelOverlayInAppShell: state.showWheelOverlayInAppShell,
  showActivity: state.showActivity,
  showTrend: state.showTrend,
  sidebarCollapsed: state.sidebarCollapsed,
  wheelSegments: state.wheelSegments,
  wheelSpin: state.wheelSpin,
  wheelTextScale: state.wheelTextScale,
})

export const selectDashboardPageState = (state: AppState) => ({
  activity: state.activity,
  adjustTimer: state.adjustTimer,
  dashMode: state.dashMode,
  lastAppliedDeltaSeconds: state.lastAppliedDeltaSeconds,
  pauseTimer: state.pauseTimer,
  resetTimer: state.resetTimer,
  ruleConfig: state.ruleConfig,
  setDashMode: state.setDashMode,
  setRuleValue: state.setRuleValue,
  setSidebarCollapsed: state.setSidebarCollapsed,
  setTimerSeconds: state.setTimerSeconds,
  startTimer: state.startTimer,
  timerRemainingSeconds: state.timerRemainingSeconds,
  timerStatus: state.timerStatus,
  timerWidgetTheme: state.timerWidgetTheme,
  trendPoints: state.trendPoints,
  uptimeSeconds: state.uptimeSeconds,
})

export const selectOverlaysPageState = (state: AppState) => ({
  overlayBaseUrl: state.overlayBaseUrl,
  overlayPreviewBaseUrl: state.overlayPreviewBaseUrl,
  overlayLanBaseUrl: state.overlayLanBaseUrl,
  overlayLanAccessEnabled: state.overlayLanAccessEnabled,
  reasonOverlayTransform: state.reasonOverlayTransform,
  resetOverlayTransform: state.resetOverlayTransform,
  setOverlayLanAccessEnabled: state.setOverlayLanAccessEnabled,
  setOverlayTransform: state.setOverlayTransform,
  setTimerWidgetTheme: state.setTimerWidgetTheme,
  timerOverlayTransform: state.timerOverlayTransform,
  timerWidgetTheme: state.timerWidgetTheme,
  wheelOverlayTransform: state.wheelOverlayTransform,
})

export const selectTimerOverlayState = (state: AppState) => ({
  ruleConfig: state.ruleConfig,
  timerOverlayTransform: state.timerOverlayTransform,
  timerRemainingSeconds: state.timerRemainingSeconds,
  timerStatus: state.timerStatus,
  timerWidgetTheme: state.timerWidgetTheme,
  trendPoints: state.trendPoints,
  uptimeSeconds: state.uptimeSeconds,
})

export const selectReasonOverlayState = (state: AppState) => ({
  latestActivity: state.activity[0] ?? null,
  reasonOverlayTransform: state.reasonOverlayTransform,
  timerWidgetTheme: state.timerWidgetTheme,
})

export const selectWheelOverlayState = (state: AppState) => ({
  wheelOverlayTransform: state.wheelOverlayTransform,
  wheelSegments: state.wheelSegments,
  wheelSpin: state.wheelSpin,
  wheelTextScale: state.wheelTextScale,
})

export const selectSettingsPageState = (state: AppState) => ({
  announceWheelResultsInChat: state.announceWheelResultsInChat,
  applyImportedLegacyConfig: state.applyImportedLegacyConfig,
  commandPermissions: state.commandPermissions,
  defaultTimerSeconds: state.defaultTimerSeconds,
  setAnnounceWheelResultsInChat: state.setAnnounceWheelResultsInChat,
  setCommandPermission: state.setCommandPermission,
  setDefaultTimerSeconds: state.setDefaultTimerSeconds,
  setShowWheelOverlayInAppShell: state.setShowWheelOverlayInAppShell,
  setWheelResultDisplaySeconds: state.setWheelResultDisplaySeconds,
  setTimerWidgetTheme: state.setTimerWidgetTheme,
  showWheelOverlayInAppShell: state.showWheelOverlayInAppShell,
  timerWidgetTheme: state.timerWidgetTheme,
  wheelResultDisplaySeconds: state.wheelResultDisplaySeconds,
})

export const selectWheelPageState = (state: AppState) => ({
  addWheelSegment: state.addWheelSegment,
  applyWheelResult: state.applyWheelResult,
  removeWheelSegment: state.removeWheelSegment,
  setWheelTextScale: state.setWheelTextScale,
  spinWheel: state.spinWheel,
  triggerGiftBombTest: state.triggerGiftBombTest,
  updateWheelSegment: state.updateWheelSegment,
  wheelSegments: state.wheelSegments,
  wheelSpin: state.wheelSpin,
  wheelTextScale: state.wheelTextScale,
})

export const selectTwitchSidebarState = (state: TwitchSessionState) => ({
  deviceFlow: state.deviceFlow,
  openVerificationUri: state.openVerificationUri,
  startDeviceAuth: state.startDeviceAuth,
  status: state.status,
  tokens: state.tokens,
  session: state.session,
  validateSession: state.validateSession,
})

export const selectConnectionsTwitchState = (state: TwitchSessionState) => ({
  clearError: state.clearError,
  deviceFlow: state.deviceFlow,
  disconnect: state.disconnect,
  lastError: state.lastError,
  openVerificationUri: state.openVerificationUri,
  refreshSession: state.refreshSession,
  session: state.session,
  startDeviceAuth: state.startDeviceAuth,
  status: state.status,
  tokens: state.tokens,
  validateSession: state.validateSession,
})

export const selectTwitchLifecycleState = (state: TwitchSessionState) => ({
  authStatus: state.status,
  deviceFlow: state.deviceFlow,
  isBootstrapped: state.isBootstrapped,
  pollDeviceAuth: state.pollDeviceAuth,
  refreshSession: state.refreshSession,
  tokens: state.tokens,
  validateSession: state.validateSession,
})

export const selectEventSubLifecycleState = (state: EventSubState) => ({
  connectEventSub: state.connect,
  disconnectEventSub: state.disconnect,
  normalizedEvents: state.normalizedEvents,
})

export const selectConnectionsEventSubState = (state: EventSubState) => ({
  eventSubError: state.lastError,
  eventSubLastMessageAt: state.lastMessageAt,
  eventSubNotifications: state.recentNotifications,
  eventSubSession: state.session,
  eventSubStatus: state.status,
  eventSubSubscriptions: state.subscriptions,
})

export const selectTipLifecycleState = (state: TipSessionState) => ({
  bootstrap: state.bootstrap,
  normalizedEvents: state.normalizedEvents,
})

export const selectConnectionsTipState = (state: TipSessionState) => ({
  clearTipError: state.clearError,
  connectStreamElements: state.connectStreamElements,
  connectStreamlabs: state.connectStreamlabs,
  disconnectTipProvider: state.disconnectProvider,
  recentTipNotifications: state.recentNotifications,
  streamElementsConnection: state.streamelementsConnection,
  streamElementsLastError: state.streamelementsLastError,
  streamElementsLastEventAt: state.streamelementsLastEventAt,
  streamElementsStatus: state.streamelementsStatus,
  streamlabsConnection: state.streamlabsConnection,
  streamlabsLastError: state.streamlabsLastError,
  streamlabsLastEventAt: state.streamlabsLastEventAt,
  streamlabsStatus: state.streamlabsStatus,
})

export const selectRulesTipState = (state: TipSessionState) => ({
  streamElementsStatus: state.streamelementsStatus,
  streamlabsStatus: state.streamlabsStatus,
})

export const selectSharedSessionPageState = (state: SharedSessionState) => ({
  adjustSharedTimer: state.adjustSharedTimer,
  checkHealth: state.checkHealth,
  clearError: state.clearError,
  createSession: state.createSession,
  joinSession: state.joinSession,
  lastError: state.lastError,
  leaveSession: state.leaveSession,
  localParticipantId: state.localParticipantId,
  localRole: state.localRole,
  pauseSharedTimer: state.pauseSharedTimer,
  resetSharedTimer: state.resetSharedTimer,
  serviceHealth: state.serviceHealth,
  serviceMessage: state.serviceMessage,
  serviceUrl: state.serviceUrl,
  session: state.session,
  setSharedTimer: state.setSharedTimer,
  startSharedTimer: state.startSharedTimer,
  status: state.status,
  syncParticipantStatus: state.syncParticipantStatus,
})

export const selectSharedSessionIngressState = (state: SharedSessionState) => ({
  session: state.session,
  status: state.status,
  submitSharedTipEvent: state.submitSharedTipEvent,
  submitSharedTwitchEvent: state.submitSharedTwitchEvent,
})
