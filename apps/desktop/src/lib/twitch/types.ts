export type TwitchAuthStatus =
  | 'idle'
  | 'bootstrapping'
  | 'authorizing'
  | 'refreshing'
  | 'connected'
  | 'reconnect-required'
  | 'error'

export interface TwitchTokenSet {
  accessToken: string
  refreshToken: string
  expiresAt: number
}

export interface TwitchValidatedSession {
  clientId: string
  login: string
  userId: string
  scopes: string[]
  expiresIn: number
  validatedAt: number
}

export interface TwitchDeviceCodeFlow {
  deviceCode: string
  userCode: string
  verificationUri: string
  intervalSeconds: number
  expiresAt: number
  startedAt: number
}

export interface TwitchTokenExchange {
  accessToken: string
  refreshToken: string
  expiresAt: number
  scopes: string[]
  tokenType: string
}

export type TwitchDevicePollResult =
  | { kind: 'pending' }
  | { kind: 'slow_down' }
  | { kind: 'expired' }
  | { kind: 'denied' }
  | { kind: 'success'; tokens: TwitchTokenExchange }
