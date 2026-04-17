import type { NormalizedTwitchEvent, TimerRuleConfig } from '../timer/types'
import type { WheelSegment, WheelSpinState } from '../wheel/types'

export type SharedSessionConnectionStatus = 'connected' | 'disconnected'
export type SharedSessionRole = 'host' | 'guest'
export type SharedSessionStatus = 'waiting_for_collaborators' | 'active' | 'ended'
export type SharedSessionServiceHealth = 'unknown' | 'checking' | 'online' | 'offline'
export type SharedTimerStatus = 'idle' | 'running' | 'paused' | 'finished'

export type SharedSessionTwitchHealth = 'connected' | 'needs-attention' | 'not-linked'
export type SharedSessionTipHealth = 'connected' | 'connecting' | 'error' | 'idle'

export interface SharedSessionTwitchIdentity {
  userId: string
  login: string
  displayName: string
}

export interface SharedParticipantRuntimeState {
  twitchStatus: SharedSessionTwitchHealth
  twitchLogin: string | null
  streamElementsStatus: SharedSessionTipHealth
  streamlabsStatus: SharedSessionTipHealth
}

export interface SharedSessionParticipant {
  id: string
  role: SharedSessionRole
  displayName: string
  connectionStatus: SharedSessionConnectionStatus
  joinedAt: string
  lastSeenAt: string
  twitchIdentity: SharedSessionTwitchIdentity | null
  runtimeState: SharedParticipantRuntimeState
}

export interface SharedTimerState {
  timerStatus: SharedTimerStatus
  timerSessionBaseRemainingSeconds: number
  timerSessionBaseUptimeSeconds: number
  timerSessionRunningSince: number | null
}

export interface SharedSessionActivityEntry {
  id: string
  sourceParticipantId: string
  sourceParticipantLabel: string
  provider: 'twitch' | 'streamelements' | 'streamlabs'
  eventType: NormalizedTwitchEvent['eventType']
  title: string
  summary: string
  deltaSeconds: number
  occurredAt: string
  remainingSeconds: number
}

export interface SharedSessionWheelSpin extends WheelSpinState {
  sourceParticipantId: string | null
  triggerUserId: string | null
  triggerUserLogin: string | null
  triggerDisplayName: string | null
  giftCount: number | null
}

export interface SharedSessionSnapshot {
  id: string
  title: string
  inviteCode: string
  status: SharedSessionStatus
  hostParticipantId: string
  participants: SharedSessionParticipant[]
  timerState: SharedTimerState
  recentActivity: SharedSessionActivityEntry[]
  wheelSegments: WheelSegment[]
  wheelSpin: SharedSessionWheelSpin
  createdAt: string
  updatedAt: string
}

export interface SharedSessionCreateInput {
  title?: string
  displayName: string
  twitchIdentity: SharedSessionTwitchIdentity | null
  ruleConfig: TimerRuleConfig
  wheelSegments: WheelSegment[]
}

export interface SharedSessionJoinInput {
  inviteCode: string
  displayName: string
  twitchIdentity: SharedSessionTwitchIdentity | null
}

export interface SharedSessionJoinResponse {
  session: SharedSessionSnapshot
  participantId: string
  joinToken: string
}

export interface SharedSessionHealthResponse {
  ok: true
  name: string
  version: string
  activeSessions: number
}

export interface SharedSessionParticipantStatusMessage {
  type: 'participant.status'
  payload: SharedParticipantRuntimeState
}

export interface SharedSessionTimerActionMessage {
  type: 'timer.action'
  payload:
    | { action: 'start' }
    | { action: 'pause' }
    | { action: 'reset' }
    | { action: 'adjust'; deltaSeconds: number; reason: string }
    | { action: 'set'; timerSeconds: number; reason: string }
}

export interface SharedSessionTwitchEventMessage {
  type: 'twitch.event'
  payload: NormalizedTwitchEvent
}

export interface SharedSessionTipEventMessage {
  type: 'tip.event'
  payload: NormalizedTwitchEvent
}

export interface SharedSessionWheelActionMessage {
  type: 'wheel.action'
  payload:
    | {
        action: 'apply-timeout'
        activeSegmentId: string
        targetUserId: string
        targetLabel: string
        targetMention: string
        durationSeconds: number
      }
    | {
        action: 'fail-timeout'
        activeSegmentId: string
        message: string
      }
}

export interface SharedSessionHelloMessage {
  type: 'hello'
}

export type SharedSessionSocketClientMessage =
  | SharedSessionHelloMessage
  | SharedSessionParticipantStatusMessage
  | SharedSessionTimerActionMessage
  | SharedSessionTwitchEventMessage
  | SharedSessionTipEventMessage
  | SharedSessionWheelActionMessage

export interface SharedSessionSnapshotMessage {
  type: 'session.snapshot'
  payload: SharedSessionSnapshot
}

export interface SharedSessionErrorMessage {
  type: 'session.error'
  payload: {
    message: string
  }
}

export type SharedSessionSocketServerMessage =
  | SharedSessionSnapshotMessage
  | SharedSessionErrorMessage
