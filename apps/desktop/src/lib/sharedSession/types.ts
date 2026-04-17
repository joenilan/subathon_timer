export type SharedSessionConnectionStatus = 'connected' | 'disconnected'
export type SharedSessionRole = 'host' | 'guest'
export type SharedSessionStatus = 'waiting_for_collaborators' | 'active' | 'ended'
export type SharedSessionServiceHealth = 'unknown' | 'checking' | 'online' | 'offline'

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

export interface SharedSessionSnapshot {
  id: string
  title: string
  inviteCode: string
  status: SharedSessionStatus
  hostParticipantId: string
  participants: SharedSessionParticipant[]
  createdAt: string
  updatedAt: string
}

export interface SharedSessionCreateInput {
  title?: string
  displayName: string
  twitchIdentity: SharedSessionTwitchIdentity | null
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

export interface SharedSessionHelloMessage {
  type: 'hello'
}

export type SharedSessionSocketClientMessage =
  | SharedSessionHelloMessage
  | SharedSessionParticipantStatusMessage

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
