export type TipProviderKind = 'streamelements' | 'streamlabs'
export type TipProviderStatus = 'idle' | 'connecting' | 'connected' | 'error'
export type StreamElementsTokenType = 'apikey' | 'jwt' | 'oauth2'

export interface StreamElementsTipConnection {
  token: string
  tokenType: StreamElementsTokenType
}

export interface StreamlabsTipConnection {
  accessToken: string
}

export interface TipProviderSnapshot {
  version: 1
  streamelements: StreamElementsTipConnection | null
  streamlabs: StreamlabsTipConnection | null
}

export interface TipProviderNotification {
  id: string
  provider: TipProviderKind
  title: string
  detail: string
  occurredAt: number
}
