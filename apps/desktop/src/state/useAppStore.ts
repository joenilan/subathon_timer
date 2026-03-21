import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'
import {
  formatDurationClock,
  formatSignedDuration,
  getDefaultTimerRuleConfig,
  normalizeTimerRuleConfig,
  resolveTimerAdjustment,
} from '../lib/timer/engine'
import type {
  ChatTimerCommandAction,
  NormalizedTwitchEvent,
  TimerCommandPermission,
  TimerCommandPermissionConfig,
  TimerRuleConfig,
  TimerWidgetTheme,
} from '../lib/timer/types'
import type { WheelSegment, WheelSpinState } from '../lib/wheel/types'
import {
  buildWheelSpinSummary,
  clampWheelTextScale,
  createDefaultWheelSegments,
  createWheelSegment,
  DEFAULT_WHEEL_TEXT_SCALE,
  defaultWheelSpin,
  pickWheelSegment,
} from '../lib/wheel/outcomes'
import { getChatters, sendChatMessage, timeoutUser } from '../lib/twitch/helix'
import { TWITCH_CLIENT_ID } from '../lib/twitch/constants'
import {
  applyChatTimerCommand,
  getCommandPermission,
} from '../lib/twitch/chatCommands'
import {
  allowsChatTimerCommand,
  DEFAULT_TIMER_COMMAND_PERMISSIONS,
  normalizeTimerCommandPermissionConfig,
} from '../lib/twitch/timerCommandPermissions'
import { useTwitchSessionStore } from './useTwitchSessionStore'
import {
  clampOverlayOffset,
  clampOverlayScale,
  defaultOverlayTransforms,
  type OverlayKind,
  type OverlayTransform,
} from '../lib/platform/overlayTransform'
import type { NativeAppSnapshot, NativeTimerEventEntry } from '../lib/platform/nativeAppState'
import {
  appendTimerEvent,
  clampTimer,
  deriveTimerDecorations,
  hydrateTimerSessionFromSnapshot,
  normalizeTimerEventHistory,
  resolveRuntimeFromSession,
  resolveTimerStatus,
  type LastTwitchActor,
  type TimerActivityEntry,
  type TimerStatus,
} from '../lib/timer/runtime'

export type DashMode = 'minimal' | 'live'
export type { TimerActivityEntry, TimerStatus } from '../lib/timer/runtime'

export interface AppState {
  sidebarCollapsed: boolean
  dashMode: DashMode
  showTrend: boolean
  showActivity: boolean
  timerWidgetTheme: TimerWidgetTheme
  wheelTextScale: number
  timerOverlayTransform: OverlayTransform
  reasonOverlayTransform: OverlayTransform
  defaultTimerSeconds: number
  commandPermissions: TimerCommandPermissionConfig
  overlayLanAccessEnabled: boolean

  timerStatus: TimerStatus
  timerRemainingSeconds: number
  uptimeSeconds: number
  timerSessionBaseRemainingSeconds: number
  timerSessionBaseUptimeSeconds: number
  timerSessionRunningSince: number | null
  lastAppliedDeltaSeconds: number
  processedEventIds: string[]
  timerEvents: NativeTimerEventEntry[]
  trendPoints: number[]
  activity: TimerActivityEntry[]
  ruleConfig: TimerRuleConfig
  overlayBaseUrl: string | null
  overlayPreviewBaseUrl: string | null
  overlayLanBaseUrl: string | null
  wheelSegments: WheelSegment[]
  wheelSpin: WheelSpinState
  lastTwitchActor: LastTwitchActor | null

  setSidebarCollapsed: (v: boolean | ((prev: boolean) => boolean)) => void
  setDashMode: (mode: DashMode) => void
  setShowTrend: (v: boolean) => void
  setShowActivity: (v: boolean) => void
  setTimerWidgetTheme: (value: TimerWidgetTheme) => void
  setWheelTextScale: (value: number) => void
  setOverlayTransform: (overlay: OverlayKind, patch: Partial<OverlayTransform>) => void
  resetOverlayTransform: (overlay: OverlayKind) => void
  setDefaultTimerSeconds: (value: number) => void
  setCommandPermission: (action: ChatTimerCommandAction, permission: TimerCommandPermission) => void
  setOverlayLanAccessEnabled: (value: boolean) => void
  setTimerSeconds: (value: number, reason: string, options?: { syncDefault?: boolean }) => void
  setRuleValue: <K extends keyof TimerRuleConfig>(key: K, value: TimerRuleConfig[K]) => void
  setOverlayBootstrapState: (value: {
    overlayBaseUrl: string | null
    overlayPreviewBaseUrl: string | null
    overlayLanBaseUrl: string | null
    overlayLanAccessEnabled?: boolean
  }) => void
  applyImportedLegacyConfig: (payload: {
    rules: TimerRuleConfig
    wheelSegments: WheelSegment[]
  }) => void
  hydrateNativeSnapshot: (snapshot: NativeAppSnapshot, now: number) => void
  addWheelSegment: (outcomeType?: WheelSegment['outcomeType']) => string
  updateWheelSegment: (id: string, patch: Partial<WheelSegment>) => void
  removeWheelSegment: (id: string) => void
  spinWheel: () => void
  applyWheelResult: () => Promise<void>

  startTimer: () => void
  pauseTimer: () => void
  resetTimer: () => void
  tick: (now: number) => void
  adjustTimer: (deltaSeconds: number, reason: string) => void
  processTwitchEvent: (event: NormalizedTwitchEvent) => void
}

const INITIAL_TIMER_SECONDS = 6 * 60 * 60
const MAX_PROCESSED_IDS = 100
let wheelSpinTimer: number | null = null

function clearWheelSpinTimer() {
  if (wheelSpinTimer !== null) {
    window.clearTimeout(wheelSpinTimer)
    wheelSpinTimer = null
  }
}

const CHAT_TIMER_HELP_MESSAGE =
  'Timer commands: !timer add <seconds|mm:ss|hh:mm:ss>, !timer remove <seconds|mm:ss|hh:mm:ss>, !timer set <time>, !timer pause, !timer resume, !timer start, !timer reset, !timer help'

async function sendTimerHelpReply(input: {
  accessToken: string
  broadcasterId: string
  senderId: string
  replyParentMessageId: string | null
}) {
  try {
    await sendChatMessage({
      clientId: TWITCH_CLIENT_ID,
      accessToken: input.accessToken,
      broadcasterId: input.broadcasterId,
      senderId: input.senderId,
      message: CHAT_TIMER_HELP_MESSAGE,
      replyParentMessageId: input.replyParentMessageId,
    })
    return
  } catch (error) {
    if (!input.replyParentMessageId) {
      throw error
    }
  }

  await sendChatMessage({
    clientId: TWITCH_CLIENT_ID,
    accessToken: input.accessToken,
    broadcasterId: input.broadcasterId,
    senderId: input.senderId,
    message: CHAT_TIMER_HELP_MESSAGE,
  })
}

export const useAppStore = create<AppState>()(
  persist(
    (set) => ({
      sidebarCollapsed: false,
      dashMode: 'live',
      showTrend: true,
      showActivity: true,
      timerWidgetTheme: 'app',
      wheelTextScale: DEFAULT_WHEEL_TEXT_SCALE,
      timerOverlayTransform: defaultOverlayTransforms.timer,
      reasonOverlayTransform: defaultOverlayTransforms.reason,
      defaultTimerSeconds: INITIAL_TIMER_SECONDS,
      commandPermissions: DEFAULT_TIMER_COMMAND_PERMISSIONS,
      overlayLanAccessEnabled: false,

      timerStatus: 'paused',
      timerRemainingSeconds: INITIAL_TIMER_SECONDS,
      uptimeSeconds: 0,
      timerSessionBaseRemainingSeconds: INITIAL_TIMER_SECONDS,
      timerSessionBaseUptimeSeconds: 0,
      timerSessionRunningSince: null,
      lastAppliedDeltaSeconds: 0,
      processedEventIds: [],
      timerEvents: [],
      trendPoints: [INITIAL_TIMER_SECONDS],
      activity: [],
      ruleConfig: getDefaultTimerRuleConfig(),
      overlayBaseUrl: null,
      overlayPreviewBaseUrl: null,
      overlayLanBaseUrl: null,
      wheelSegments: createDefaultWheelSegments(),
      wheelSpin: defaultWheelSpin,
      lastTwitchActor: null,

      setSidebarCollapsed: (v) =>
        set((state) => ({
          sidebarCollapsed: typeof v === 'function' ? v(state.sidebarCollapsed) : v,
        })),
      setDashMode: (dashMode) => set({ dashMode }),
      setShowTrend: (showTrend) => set({ showTrend }),
      setShowActivity: (showActivity) => set({ showActivity }),
      setTimerWidgetTheme: (timerWidgetTheme) => set({ timerWidgetTheme }),
      setWheelTextScale: (wheelTextScale) => set({ wheelTextScale: clampWheelTextScale(wheelTextScale) }),
      setOverlayTransform: (overlay, patch) =>
        set((state) => {
          const current = overlay === 'timer' ? state.timerOverlayTransform : state.reasonOverlayTransform
          const nextTransform = {
            x: clampOverlayOffset(patch.x ?? current.x),
            y: clampOverlayOffset(patch.y ?? current.y),
            scale: clampOverlayScale(patch.scale ?? current.scale),
          }

          return overlay === 'timer'
            ? { timerOverlayTransform: nextTransform }
            : { reasonOverlayTransform: nextTransform }
        }),
      resetOverlayTransform: (overlay) =>
        set(
          overlay === 'timer'
            ? { timerOverlayTransform: defaultOverlayTransforms.timer }
            : { reasonOverlayTransform: defaultOverlayTransforms.reason },
        ),
      setDefaultTimerSeconds: (defaultTimerSeconds) => set({ defaultTimerSeconds: clampTimer(defaultTimerSeconds) }),
      setCommandPermission: (action, permission) =>
        set((state) => ({
          commandPermissions: {
            ...state.commandPermissions,
            [action]: permission,
          },
        })),
      setOverlayLanAccessEnabled: (overlayLanAccessEnabled) => set({ overlayLanAccessEnabled }),
      setTimerSeconds: (timerRemainingSeconds, reason, options) =>
        set((state) => {
          const now = Date.now()
          const runtime = resolveRuntimeFromSession(state, now)
          const nextRemaining = clampTimer(timerRemainingSeconds)
          const nextDefaultTimerSeconds = options?.syncDefault ? nextRemaining : state.defaultTimerSeconds

          if (nextRemaining === runtime.timerRemainingSeconds && nextDefaultTimerSeconds === state.defaultTimerSeconds) {
            return state
          }

          const deltaSeconds = nextRemaining - runtime.timerRemainingSeconds
          const nextStatus = resolveTimerStatus(runtime.timerStatus, nextRemaining)
          const nextEvent = {
            id: `manual-set-${now}`,
            title: 'Timer updated',
            summary:
              deltaSeconds === 0
                ? `${reason} kept the timer at ${formatDurationClock(nextRemaining)}.`
                : `${reason} set the timer to ${formatDurationClock(nextRemaining)} (${formatSignedDuration(deltaSeconds)}).`,
            deltaSeconds,
            occurredAt: now,
            source: 'manual',
            remainingSeconds: nextRemaining,
          } satisfies NativeTimerEventEntry
          const nextEvents = appendTimerEvent(state.timerEvents, nextEvent)
          const derived = deriveTimerDecorations(nextDefaultTimerSeconds, nextEvents, nextRemaining)

          return {
            defaultTimerSeconds: nextDefaultTimerSeconds,
            timerStatus: nextStatus,
            timerRemainingSeconds: nextRemaining,
            uptimeSeconds: runtime.uptimeSeconds,
            timerSessionBaseRemainingSeconds: nextRemaining,
            timerSessionBaseUptimeSeconds: runtime.uptimeSeconds,
            timerSessionRunningSince: nextStatus === 'running' ? now : null,
            timerEvents: nextEvents,
            ...derived,
          }
        }),
      setRuleValue: (key, value) =>
        set((state) => ({
          ruleConfig: normalizeTimerRuleConfig({
            ...state.ruleConfig,
            [key]: value,
          }),
        })),
      setOverlayBootstrapState: (payload) =>
        set((state) => ({
          overlayBaseUrl: payload.overlayBaseUrl,
          overlayPreviewBaseUrl: payload.overlayPreviewBaseUrl,
          overlayLanBaseUrl: payload.overlayLanBaseUrl,
          overlayLanAccessEnabled: payload.overlayLanAccessEnabled ?? state.overlayLanAccessEnabled,
        })),
      applyImportedLegacyConfig: ({ rules, wheelSegments }) =>
        set({
          ruleConfig: normalizeTimerRuleConfig(rules),
          wheelSegments: wheelSegments.length > 0 ? wheelSegments : createDefaultWheelSegments(),
          wheelSpin: defaultWheelSpin,
        }),
      hydrateNativeSnapshot: (snapshot, now) =>
        set((state) => {
          const timerSession = hydrateTimerSessionFromSnapshot(snapshot, now)
          const nextRemainingSeconds = timerSession.timerRemainingSeconds
          const nextDefaultTimerSeconds = clampTimer(snapshot.settings.defaultTimerSeconds)
          const timerEvents = normalizeTimerEventHistory(snapshot.timerSession.events)
          const derived = deriveTimerDecorations(nextDefaultTimerSeconds, timerEvents, nextRemainingSeconds)

          return {
            defaultTimerSeconds: nextDefaultTimerSeconds,
            commandPermissions: normalizeTimerCommandPermissionConfig(snapshot.settings.commandPermissions),
            overlayLanAccessEnabled: snapshot.settings.overlayLanAccessEnabled,
            timerStatus: timerSession.timerStatus,
            timerRemainingSeconds: nextRemainingSeconds,
            uptimeSeconds: timerSession.uptimeSeconds,
            timerSessionBaseRemainingSeconds: timerSession.timerSessionBaseRemainingSeconds,
            timerSessionBaseUptimeSeconds: timerSession.timerSessionBaseUptimeSeconds,
            timerSessionRunningSince: timerSession.timerSessionRunningSince,
            lastAppliedDeltaSeconds: Math.round(snapshot.timerSession.lastAppliedDeltaSeconds),
            processedEventIds: [],
            timerEvents,
            trendPoints: derived.trendPoints,
            activity: derived.activity,
            ruleConfig: normalizeTimerRuleConfig(snapshot.ruleConfig),
            wheelSegments: snapshot.wheelSegments.length > 0 ? snapshot.wheelSegments : createDefaultWheelSegments(),
            wheelSpin: defaultWheelSpin,
            lastTwitchActor: null,
            overlayBaseUrl: state.overlayBaseUrl,
            overlayPreviewBaseUrl: state.overlayPreviewBaseUrl,
            overlayLanBaseUrl: state.overlayLanBaseUrl,
          }
        }),
      addWheelSegment: (outcomeType = 'time') => {
        const nextSegment = createWheelSegment(outcomeType)
        set((state) => ({
          wheelSegments: [...state.wheelSegments, nextSegment],
        }))
        return nextSegment.id
      },
      updateWheelSegment: (id, patch) =>
        set((state) => ({
          wheelSegments: state.wheelSegments.map((segment) => {
            if (segment.id !== id) {
              return segment
            }

            const next = { ...segment, ...patch }

            if (next.outcomeType === 'time') {
              next.timeoutSeconds = undefined
              next.timeoutTarget = undefined
              next.moderationRequired = false
              if (typeof next.timeDeltaSeconds !== 'number') {
                next.timeDeltaSeconds = 300
              }
            } else if (next.outcomeType === 'timeout') {
              next.timeDeltaSeconds = undefined
              next.moderationRequired = true
              if (typeof next.timeoutSeconds !== 'number') {
                next.timeoutSeconds = 300
              }
              if (!next.timeoutTarget) {
                next.timeoutTarget = 'self'
              }
            } else {
              next.timeDeltaSeconds = undefined
              next.timeoutSeconds = undefined
              next.timeoutTarget = undefined
              next.moderationRequired = false
            }

            return next
          }),
        })),
      removeWheelSegment: (id) =>
        set((state) => {
          const nextSegments = state.wheelSegments.filter((segment) => segment.id !== id)
          return {
            wheelSegments: nextSegments.length > 0 ? nextSegments : [createWheelSegment('time')],
            wheelSpin: state.wheelSpin.activeSegmentId === id ? defaultWheelSpin : state.wheelSpin,
          }
        }),
      spinWheel: () => {
        const state = useAppStore.getState()
        if (state.wheelSpin.status === 'spinning') {
          return
        }

        const selectedSegment = pickWheelSegment(state.wheelSegments)
        if (!selectedSegment) {
          return
        }

        clearWheelSpinTimer()
        set({
          wheelSpin: {
            status: 'spinning',
            activeSegmentId: selectedSegment.id,
            resultTitle: 'Selecting outcome',
            resultSummary: 'Wheel animation in progress.',
            requiresModeration: selectedSegment.moderationRequired,
          },
        })

        wheelSpinTimer = window.setTimeout(() => {
          const currentSegment = useAppStore.getState().wheelSegments.find((segment) => segment.id === selectedSegment.id)
          if (!currentSegment) {
            return
          }

          set({
            wheelSpin: {
              status: 'ready',
              activeSegmentId: currentSegment.id,
              resultTitle: currentSegment.label,
              resultSummary: buildWheelSpinSummary(currentSegment),
              requiresModeration: currentSegment.moderationRequired,
            },
          })
          wheelSpinTimer = null
        }, 1800)
      },
      applyWheelResult: async () => {
        const { wheelSpin, wheelSegments } = useAppStore.getState()
        if (wheelSpin.status !== 'ready' || !wheelSpin.activeSegmentId) {
          return
        }

        const selectedSegment = wheelSegments.find((segment) => segment.id === wheelSpin.activeSegmentId)
        if (!selectedSegment) {
          set({ wheelSpin: defaultWheelSpin })
          return
        }

        if (selectedSegment.outcomeType === 'time') {
          const deltaSeconds = selectedSegment.timeDeltaSeconds ?? 0
          set((state) => {
            const now = Date.now()
            const runtime = resolveRuntimeFromSession(state, now)
            const nextRemaining = clampTimer(runtime.timerRemainingSeconds + deltaSeconds)
            const nextStatus = resolveTimerStatus(runtime.timerStatus, nextRemaining)
            const nextEvent = {
              id: `wheel-${now}-${selectedSegment.id}`,
              title: 'Wheel outcome applied',
              summary: selectedSegment.outcome,
              deltaSeconds,
              occurredAt: now,
              source: 'manual',
              remainingSeconds: nextRemaining,
            } satisfies NativeTimerEventEntry
            const nextEvents = appendTimerEvent(state.timerEvents, nextEvent)
            const derived = deriveTimerDecorations(state.defaultTimerSeconds, nextEvents, nextRemaining)

            return {
              timerStatus: nextStatus,
              timerRemainingSeconds: nextRemaining,
              uptimeSeconds: runtime.uptimeSeconds,
              timerSessionBaseRemainingSeconds: nextRemaining,
              timerSessionBaseUptimeSeconds: runtime.uptimeSeconds,
              timerSessionRunningSince: nextStatus === 'running' ? now : null,
              timerEvents: nextEvents,
              lastAppliedDeltaSeconds: deltaSeconds,
              trendPoints: derived.trendPoints,
              activity: derived.activity,
              wheelSpin: defaultWheelSpin,
            }
          })
          return
        }

        if (selectedSegment.outcomeType === 'custom') {
          set((state) => {
            const now = Date.now()
            const runtime = resolveRuntimeFromSession(state, now)
            const nextEvents = appendTimerEvent(state.timerEvents, {
              id: `wheel-${now}-${selectedSegment.id}`,
              title: 'Wheel custom outcome',
              summary: selectedSegment.label,
              deltaSeconds: 0,
              occurredAt: now,
              source: 'manual',
              remainingSeconds: runtime.timerRemainingSeconds,
            })
            const derived = deriveTimerDecorations(state.defaultTimerSeconds, nextEvents, runtime.timerRemainingSeconds)

            return {
              wheelSpin: defaultWheelSpin,
              timerStatus: runtime.timerStatus,
              timerRemainingSeconds: runtime.timerRemainingSeconds,
              uptimeSeconds: runtime.uptimeSeconds,
              timerSessionBaseRemainingSeconds: runtime.timerSessionBaseRemainingSeconds,
              timerSessionBaseUptimeSeconds: runtime.timerSessionBaseUptimeSeconds,
              timerSessionRunningSince: runtime.timerSessionRunningSince,
              timerEvents: nextEvents,
              trendPoints: derived.trendPoints,
              activity: derived.activity,
            }
          })
          return
        }

        const twitchState = useTwitchSessionStore.getState()
        const session = twitchState.session
        const tokens = twitchState.tokens

        if (!session || !tokens) {
          set((state) => {
            const now = Date.now()
            const runtime = resolveRuntimeFromSession(state, now)
            const nextEvents = appendTimerEvent(state.timerEvents, {
              id: `wheel-${now}-${selectedSegment.id}`,
              title: 'Wheel moderation blocked',
              summary: 'Reconnect Twitch before applying timeout outcomes.',
              deltaSeconds: 0,
              occurredAt: now,
              source: 'manual',
              remainingSeconds: runtime.timerRemainingSeconds,
            })
            const derived = deriveTimerDecorations(state.defaultTimerSeconds, nextEvents, runtime.timerRemainingSeconds)

            return {
              wheelSpin: defaultWheelSpin,
              timerStatus: runtime.timerStatus,
              timerRemainingSeconds: runtime.timerRemainingSeconds,
              uptimeSeconds: runtime.uptimeSeconds,
              timerSessionBaseRemainingSeconds: runtime.timerSessionBaseRemainingSeconds,
              timerSessionBaseUptimeSeconds: runtime.timerSessionBaseUptimeSeconds,
              timerSessionRunningSince: runtime.timerSessionRunningSince,
              timerEvents: nextEvents,
              trendPoints: derived.trendPoints,
              activity: derived.activity,
            }
          })
          return
        }

        if (!session.scopes.includes('moderator:manage:banned_users')) {
          set((state) => {
            const now = Date.now()
            const runtime = resolveRuntimeFromSession(state, now)
            const nextEvents = appendTimerEvent(state.timerEvents, {
              id: `wheel-${now}-${selectedSegment.id}`,
              title: 'Wheel moderation blocked',
              summary: 'Reconnect Twitch to grant moderator:manage:banned_users before applying timeout outcomes.',
              deltaSeconds: 0,
              occurredAt: now,
              source: 'manual',
              remainingSeconds: runtime.timerRemainingSeconds,
            })
            const derived = deriveTimerDecorations(state.defaultTimerSeconds, nextEvents, runtime.timerRemainingSeconds)

            return {
              wheelSpin: defaultWheelSpin,
              timerStatus: runtime.timerStatus,
              timerRemainingSeconds: runtime.timerRemainingSeconds,
              uptimeSeconds: runtime.uptimeSeconds,
              timerSessionBaseRemainingSeconds: runtime.timerSessionBaseRemainingSeconds,
              timerSessionBaseUptimeSeconds: runtime.timerSessionBaseUptimeSeconds,
              timerSessionRunningSince: runtime.timerSessionRunningSince,
              timerEvents: nextEvents,
              trendPoints: derived.trendPoints,
              activity: derived.activity,
            }
          })
          return
        }

        try {
          let targetUserId: string | null = null
          let targetLabel = 'selected target'

          if (selectedSegment.timeoutTarget === 'self') {
            const actor = useAppStore.getState().lastTwitchActor

            if (!actor?.userId) {
              throw new Error('No recent Twitch actor is available for a self-timeout outcome.')
            }

            targetUserId = actor.userId
            targetLabel = actor.displayName ?? actor.userLogin ?? 'recent Twitch actor'
          } else {
            if (!session.scopes.includes('moderator:read:chatters')) {
              throw new Error('Reconnect Twitch to grant moderator:read:chatters before using random timeout outcomes.')
            }

            const chatters = await getChatters({
              clientId: TWITCH_CLIENT_ID,
              accessToken: tokens.accessToken,
              broadcasterId: session.userId,
              moderatorId: session.userId,
            })

            const candidates = chatters.filter((chatter) => chatter.userId !== session.userId)

            if (candidates.length === 0) {
              throw new Error('No eligible chatters are available for a random timeout outcome.')
            }

            const selectedChatter = candidates[Math.floor(Math.random() * candidates.length)]
            targetUserId = selectedChatter.userId
            targetLabel = selectedChatter.userName
          }

          await timeoutUser({
            clientId: TWITCH_CLIENT_ID,
            accessToken: tokens.accessToken,
            broadcasterId: session.userId,
            moderatorId: session.userId,
            userId: targetUserId,
            durationSeconds: selectedSegment.timeoutSeconds ?? 300,
            reason: `Wheel outcome: ${selectedSegment.label}`,
          })

          set((state) => {
            const now = Date.now()
            const runtime = resolveRuntimeFromSession(state, now)
            const nextEvents = appendTimerEvent(state.timerEvents, {
              id: `wheel-${now}-${selectedSegment.id}`,
              title: 'Wheel moderation applied',
              summary: `${targetLabel} was timed out for ${selectedSegment.timeoutSeconds ?? 0}s via the wheel.`,
              deltaSeconds: 0,
              occurredAt: now,
              source: 'manual',
              remainingSeconds: runtime.timerRemainingSeconds,
            })
            const derived = deriveTimerDecorations(state.defaultTimerSeconds, nextEvents, runtime.timerRemainingSeconds)

            return {
              wheelSpin: defaultWheelSpin,
              timerStatus: runtime.timerStatus,
              timerRemainingSeconds: runtime.timerRemainingSeconds,
              uptimeSeconds: runtime.uptimeSeconds,
              timerSessionBaseRemainingSeconds: runtime.timerSessionBaseRemainingSeconds,
              timerSessionBaseUptimeSeconds: runtime.timerSessionBaseUptimeSeconds,
              timerSessionRunningSince: runtime.timerSessionRunningSince,
              timerEvents: nextEvents,
              trendPoints: derived.trendPoints,
              activity: derived.activity,
            }
          })
        } catch (error) {
          set((state) => {
            const now = Date.now()
            const runtime = resolveRuntimeFromSession(state, now)
            const nextEvents = appendTimerEvent(state.timerEvents, {
              id: `wheel-${now}-${selectedSegment.id}`,
              title: 'Wheel moderation failed',
              summary: error instanceof Error ? error.message : 'Timeout outcome failed.',
              deltaSeconds: 0,
              occurredAt: now,
              source: 'manual',
              remainingSeconds: runtime.timerRemainingSeconds,
            })
            const derived = deriveTimerDecorations(state.defaultTimerSeconds, nextEvents, runtime.timerRemainingSeconds)

            return {
              wheelSpin: defaultWheelSpin,
              timerStatus: runtime.timerStatus,
              timerRemainingSeconds: runtime.timerRemainingSeconds,
              uptimeSeconds: runtime.uptimeSeconds,
              timerSessionBaseRemainingSeconds: runtime.timerSessionBaseRemainingSeconds,
              timerSessionBaseUptimeSeconds: runtime.timerSessionBaseUptimeSeconds,
              timerSessionRunningSince: runtime.timerSessionRunningSince,
              timerEvents: nextEvents,
              trendPoints: derived.trendPoints,
              activity: derived.activity,
            }
          })
        }
      },

      startTimer: () =>
        set((state) => {
          const now = Date.now()
          const runtime = resolveRuntimeFromSession(state, now)
          const nextStatus: TimerStatus = runtime.timerRemainingSeconds > 0 ? 'running' : 'finished'
          const derived = deriveTimerDecorations(state.defaultTimerSeconds, state.timerEvents, runtime.timerRemainingSeconds)

          return {
            timerStatus: nextStatus,
            timerRemainingSeconds: runtime.timerRemainingSeconds,
            uptimeSeconds: runtime.uptimeSeconds,
            timerSessionBaseRemainingSeconds: runtime.timerRemainingSeconds,
            timerSessionBaseUptimeSeconds: runtime.uptimeSeconds,
            timerSessionRunningSince: nextStatus === 'running' ? now : null,
            ...derived,
          }
        }),

      pauseTimer: () =>
        set((state) => {
          const now = Date.now()
          const runtime = resolveRuntimeFromSession(state, now)
          const nextStatus: TimerStatus = runtime.timerStatus === 'finished' ? 'finished' : 'paused'
          const derived = deriveTimerDecorations(state.defaultTimerSeconds, state.timerEvents, runtime.timerRemainingSeconds)

          return {
            timerStatus: nextStatus,
            timerRemainingSeconds: runtime.timerRemainingSeconds,
            uptimeSeconds: runtime.uptimeSeconds,
            timerSessionBaseRemainingSeconds: runtime.timerRemainingSeconds,
            timerSessionBaseUptimeSeconds: runtime.uptimeSeconds,
            timerSessionRunningSince: null,
            ...derived,
          }
        }),

      resetTimer: () =>
        set((state) => ({
          timerStatus: 'paused',
          timerRemainingSeconds: state.defaultTimerSeconds,
          uptimeSeconds: 0,
          timerSessionBaseRemainingSeconds: state.defaultTimerSeconds,
          timerSessionBaseUptimeSeconds: 0,
          timerSessionRunningSince: null,
          lastAppliedDeltaSeconds: 0,
          timerEvents: [],
          trendPoints: [state.defaultTimerSeconds],
          activity: [],
        })),

      tick: (now) =>
        set((state) => {
          if (state.timerStatus !== 'running' || state.timerSessionRunningSince === null) {
            return state
          }

          const runtime = resolveRuntimeFromSession(state, now)

          if (
            runtime.timerStatus === state.timerStatus
            && runtime.timerRemainingSeconds === state.timerRemainingSeconds
            && runtime.uptimeSeconds === state.uptimeSeconds
          ) {
            return state
          }

          const derived = deriveTimerDecorations(state.defaultTimerSeconds, state.timerEvents, runtime.timerRemainingSeconds)

          return {
            timerStatus: runtime.timerStatus,
            timerRemainingSeconds: runtime.timerRemainingSeconds,
            uptimeSeconds: runtime.uptimeSeconds,
            timerSessionBaseRemainingSeconds: runtime.timerSessionBaseRemainingSeconds,
            timerSessionBaseUptimeSeconds: runtime.timerSessionBaseUptimeSeconds,
            timerSessionRunningSince: runtime.timerSessionRunningSince,
            ...derived,
          }
        }),

      adjustTimer: (deltaSeconds, reason) =>
        set((state) => {
          const now = Date.now()
          const runtime = resolveRuntimeFromSession(state, now)
          const nextRemaining = clampTimer(runtime.timerRemainingSeconds + deltaSeconds)
          const nextStatus = resolveTimerStatus(runtime.timerStatus, nextRemaining)
          const nextEvent = {
            id: `manual-${now}-${Math.abs(deltaSeconds)}`,
            title: 'Manual adjustment',
            summary: `${reason} ${formatSignedDuration(deltaSeconds)}`,
            deltaSeconds,
            occurredAt: now,
            source: 'manual',
            remainingSeconds: nextRemaining,
          } satisfies NativeTimerEventEntry
          const nextEvents = appendTimerEvent(state.timerEvents, nextEvent)
          const derived = deriveTimerDecorations(state.defaultTimerSeconds, nextEvents, nextRemaining)

          return {
            timerStatus: nextStatus,
            timerRemainingSeconds: nextRemaining,
            uptimeSeconds: runtime.uptimeSeconds,
            timerSessionBaseRemainingSeconds: nextRemaining,
            timerSessionBaseUptimeSeconds: runtime.uptimeSeconds,
            timerSessionRunningSince: nextStatus === 'running' ? now : null,
            timerEvents: nextEvents,
            lastAppliedDeltaSeconds: deltaSeconds,
            trendPoints: derived.trendPoints,
            activity: derived.activity,
          }
        }),

      processTwitchEvent: (event) =>
        set((state) => {
          if (state.processedEventIds.includes(event.id)) {
            return state
          }

          const processedEventIds = [event.id, ...state.processedEventIds].slice(0, MAX_PROCESSED_IDS)

          if (event.eventType === 'chat_command') {
            const command = event.command
            if (!command || (!command.isBroadcaster && !command.isModerator)) {
              return { processedEventIds }
            }

            if (!allowsChatTimerCommand(command, getCommandPermission(state.commandPermissions, command.action))) {
              return {
                processedEventIds,
              }
            }

            const now = Date.now()
            const lastTwitchActor = {
              userId: event.userId,
              userLogin: event.userLogin,
              displayName: event.displayName,
            } satisfies LastTwitchActor

            if (command.action === 'help') {
              const { session, tokens } = useTwitchSessionStore.getState()
              const replyParentMessageId =
                typeof event.rawPayload.message_id === 'string' && event.rawPayload.message_id.length > 0
                  ? event.rawPayload.message_id
                  : null

              if (!session?.userId || !tokens?.accessToken) {
                useTwitchSessionStore.setState({
                  lastError: 'Reconnect Twitch before using !timer help chat replies.',
                })
              } else if (!session.scopes.includes('user:write:chat')) {
                useTwitchSessionStore.setState({
                  lastError: 'Reconnect Twitch to grant user:write:chat before using !timer help.',
                })
              } else {
                void sendTimerHelpReply({
                  accessToken: tokens.accessToken,
                  broadcasterId: session.userId,
                  senderId: session.userId,
                  replyParentMessageId,
                }).catch((error) => {
                  useTwitchSessionStore.setState({
                    lastError:
                      error instanceof Error && error.message.trim().length > 0
                        ? error.message
                        : 'Unable to send the !timer help reply to Twitch chat.',
                  })
                })
              }

              return {
                processedEventIds,
                lastTwitchActor,
              }
            }

            const commandResult = applyChatTimerCommand({
              state,
              event: {
                id: event.id,
                userId: event.userId,
                userLogin: event.userLogin,
                displayName: event.displayName,
                command,
              },
              processedEventIds,
              now,
            })

            if (commandResult.kind === 'ignored') {
              return { processedEventIds: commandResult.processedEventIds }
            }

            if (commandResult.kind === 'applied') {
              return commandResult.mutation
            }

            return {
              processedEventIds: commandResult.processedEventIds,
              lastTwitchActor: commandResult.lastTwitchActor,
            }
          }

          const result = resolveTimerAdjustment(event, state.ruleConfig)

          if (!result) {
            return {
              processedEventIds,
            }
          }

          const now = Date.now()
          const runtime = resolveRuntimeFromSession(state, now)
          const nextRemaining = clampTimer(runtime.timerRemainingSeconds + result.deltaSeconds)
          const nextStatus = resolveTimerStatus(runtime.timerStatus, nextRemaining)
          const nextEvent = {
            id: event.id,
            title: result.title,
            summary: result.summary,
            deltaSeconds: result.deltaSeconds,
            occurredAt: now,
            source: 'twitch-eventsub',
            remainingSeconds: nextRemaining,
          } satisfies NativeTimerEventEntry
          const nextEvents = appendTimerEvent(state.timerEvents, nextEvent)
          const derived = deriveTimerDecorations(state.defaultTimerSeconds, nextEvents, nextRemaining)

          return {
            processedEventIds,
            timerStatus: nextStatus,
            timerRemainingSeconds: nextRemaining,
            uptimeSeconds: runtime.uptimeSeconds,
            timerSessionBaseRemainingSeconds: nextRemaining,
            timerSessionBaseUptimeSeconds: runtime.uptimeSeconds,
            timerSessionRunningSince: nextStatus === 'running' ? now : null,
            timerEvents: nextEvents,
            lastAppliedDeltaSeconds: result.deltaSeconds,
            trendPoints: derived.trendPoints,
            lastTwitchActor: {
              userId: event.userId,
              userLogin: event.userLogin,
              displayName: event.displayName,
            },
            activity: derived.activity,
          }
        }),
    }),
    {
      name: 'fdgt.app.state',
      version: 11,
      storage: createJSONStorage(() => window.localStorage),
      migrate: (persistedState, persistedVersion) => {
        const nextState = persistedState as Partial<AppState> | undefined
        const normalizedRuleConfig = normalizeTimerRuleConfig(nextState?.ruleConfig)

        if ((persistedVersion ?? 0) < 6) {
          normalizedRuleConfig.advancedSubEventOverridesEnabled = false
          normalizedRuleConfig.subscriptionUseCustomValues = false
          normalizedRuleConfig.resubscriptionUseCustomValues = false
          normalizedRuleConfig.giftSubscriptionUseCustomValues = false
          normalizedRuleConfig.giftBombUseCustomValues = false
        }

        const nextDashMode = nextState?.dashMode === 'minimal' ? 'minimal' : 'live'

        return {
          ...nextState,
          sidebarCollapsed: nextDashMode === 'minimal' ? true : (nextState?.sidebarCollapsed ?? false),
          dashMode: nextDashMode,
          timerWidgetTheme: nextState?.timerWidgetTheme === 'original' ? 'app' : (nextState?.timerWidgetTheme ?? 'app'),
          wheelTextScale: clampWheelTextScale(nextState?.wheelTextScale ?? DEFAULT_WHEEL_TEXT_SCALE),
          commandPermissions: normalizeTimerCommandPermissionConfig(nextState?.commandPermissions),
          overlayBaseUrl: null,
          overlayPreviewBaseUrl: null,
          overlayLanBaseUrl: null,
          processedEventIds: [],
          ruleConfig: normalizedRuleConfig,
          wheelSpin: defaultWheelSpin,
          lastTwitchActor: null,
        }
      },
      partialize: (state) => ({
        sidebarCollapsed: state.sidebarCollapsed,
        dashMode: state.dashMode,
        showTrend: state.showTrend,
        showActivity: state.showActivity,
        timerWidgetTheme: state.timerWidgetTheme,
        wheelTextScale: state.wheelTextScale,
        timerOverlayTransform: state.timerOverlayTransform,
        reasonOverlayTransform: state.reasonOverlayTransform,
      }),
    },
  ),
)
