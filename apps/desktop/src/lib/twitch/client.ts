import type {
  TwitchDeviceCodeFlow,
  TwitchDevicePollResult,
  TwitchTokenExchange,
  TwitchValidatedSession,
} from './types'

const DEVICE_URL = 'https://id.twitch.tv/oauth2/device'
const TOKEN_URL = 'https://id.twitch.tv/oauth2/token'
const VALIDATE_URL = 'https://id.twitch.tv/oauth2/validate'

export class TwitchUnauthorizedError extends Error {
  constructor(message = 'Twitch rejected the current access token.') {
    super(message)
    this.name = 'TwitchUnauthorizedError'
  }
}

export class TwitchRefreshRejectedError extends Error {
  constructor(message = 'Twitch rejected the saved refresh token.') {
    super(message)
    this.name = 'TwitchRefreshRejectedError'
  }
}

function toFormBody(values: Record<string, string>) {
  const form = new URLSearchParams()

  for (const [key, value] of Object.entries(values)) {
    form.set(key, value)
  }

  return form
}

async function parseJson(response: Response): Promise<Record<string, unknown>> {
  try {
    return (await response.json()) as Record<string, unknown>
  } catch {
    return {}
  }
}

function getErrorMessage(payload: Record<string, unknown>, fallback: string) {
  const message = payload.message
  return typeof message === 'string' && message.trim().length > 0 ? message : fallback
}

function normalizeScopeList(value: unknown) {
  if (Array.isArray(value)) {
    return value.filter((entry): entry is string => typeof entry === 'string')
  }

  if (typeof value === 'string' && value.trim().length > 0) {
    return value.split(' ').filter(Boolean)
  }

  return []
}

function mapTokenExchange(payload: Record<string, unknown>): TwitchTokenExchange {
  const accessToken = typeof payload.access_token === 'string' ? payload.access_token : ''
  const refreshToken = typeof payload.refresh_token === 'string' ? payload.refresh_token : ''
  const expiresIn = typeof payload.expires_in === 'number' ? payload.expires_in : 0
  const tokenType = typeof payload.token_type === 'string' ? payload.token_type : 'bearer'

  if (!accessToken || !refreshToken || expiresIn <= 0) {
    throw new Error('Twitch returned an incomplete token payload.')
  }

  return {
    accessToken,
    refreshToken,
    expiresAt: Date.now() + expiresIn * 1000,
    scopes: normalizeScopeList(payload.scope),
    tokenType,
  }
}

export async function requestDeviceCode(clientId: string, scopes: readonly string[]): Promise<TwitchDeviceCodeFlow> {
  const response = await fetch(DEVICE_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: toFormBody({
      client_id: clientId,
      scopes: scopes.join(' '),
    }),
  })

  const payload = await parseJson(response)

  if (!response.ok) {
    throw new Error(getErrorMessage(payload, 'Unable to start Twitch device authorization.'))
  }

  const deviceCode = typeof payload.device_code === 'string' ? payload.device_code : ''
  const userCode = typeof payload.user_code === 'string' ? payload.user_code : ''
  const verificationUri = typeof payload.verification_uri === 'string' ? payload.verification_uri : ''
  const expiresIn = typeof payload.expires_in === 'number' ? payload.expires_in : 0
  const intervalSeconds = typeof payload.interval === 'number' ? payload.interval : 5

  if (!deviceCode || !userCode || !verificationUri || expiresIn <= 0) {
    throw new Error('Twitch returned an incomplete device authorization payload.')
  }

  return {
    deviceCode,
    userCode,
    verificationUri,
    intervalSeconds,
    expiresAt: Date.now() + expiresIn * 1000,
    startedAt: Date.now(),
  }
}

export async function pollDeviceCode(
  clientId: string,
  deviceCode: string,
  scopes: readonly string[],
): Promise<TwitchDevicePollResult> {
  const response = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: toFormBody({
      client_id: clientId,
      scopes: scopes.join(' '),
      device_code: deviceCode,
      grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
    }),
  })

  const payload = await parseJson(response)

  if (response.ok) {
    return {
      kind: 'success',
      tokens: mapTokenExchange(payload),
    }
  }

  const message = getErrorMessage(payload, '').toLowerCase()

  if (message === 'authorization_pending') {
    return { kind: 'pending' }
  }

  if (message === 'slow_down') {
    return { kind: 'slow_down' }
  }

  if (message === 'access_denied') {
    return { kind: 'denied' }
  }

  if (message === 'expired_token' || message.includes('device code expired')) {
    return { kind: 'expired' }
  }

  throw new Error(getErrorMessage(payload, 'Unable to complete Twitch authorization.'))
}

export async function refreshAccessToken(clientId: string, refreshToken: string): Promise<TwitchTokenExchange> {
  const response = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: toFormBody({
      client_id: clientId,
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
    }),
  })

  const payload = await parseJson(response)

  if (!response.ok) {
    const message = getErrorMessage(payload, 'Unable to refresh the Twitch session.')

    if (response.status === 400 || response.status === 401) {
      throw new TwitchRefreshRejectedError(message)
    }

    throw new Error(message)
  }

  return mapTokenExchange(payload)
}

export async function validateAccessToken(accessToken: string): Promise<TwitchValidatedSession> {
  const response = await fetch(VALIDATE_URL, {
    headers: { Authorization: `OAuth ${accessToken}` },
  })

  if (response.status === 401) {
    throw new TwitchUnauthorizedError()
  }

  const payload = await parseJson(response)

  if (!response.ok) {
    throw new Error(getErrorMessage(payload, 'Unable to validate the Twitch session.'))
  }

  const clientId = typeof payload.client_id === 'string' ? payload.client_id : ''
  const login = typeof payload.login === 'string' ? payload.login : ''
  const userId = typeof payload.user_id === 'string' ? payload.user_id : ''
  const expiresIn = typeof payload.expires_in === 'number' ? payload.expires_in : 0

  if (!clientId || !login || !userId) {
    throw new Error('Twitch returned an incomplete validation payload.')
  }

  return {
    clientId,
    login,
    userId,
    scopes: normalizeScopeList(payload.scopes),
    expiresIn,
    validatedAt: Date.now(),
  }
}
