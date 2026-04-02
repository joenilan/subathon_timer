const STREAMLABS_AUTHORIZE_URL = 'https://streamlabs.com/api/v2.0/authorize'
const STREAMLABS_TOKEN_URL = 'https://streamlabs.com/api/v2.0/token'
const STREAMLABS_CALLBACK_PATH = '/auth/streamlabs/callback'

export interface StreamlabsStartRequest {
  redirectUri: string
}

export interface StreamlabsExchangeRequest {
  code: string
  state: string
  redirectUri: string
}

export interface PendingStreamlabsAuth {
  redirectUri: string
  createdAt: number
}

export interface StreamlabsTokenResponse {
  accessToken: string
  refreshToken: string | null
  tokenType: string | null
  scope: string | null
  expiresIn: number | null
  createdAt: number
}

interface StreamlabsTokenPayload {
  access_token?: string
  refresh_token?: string
  token_type?: string
  scope?: string
  expires_in?: number
  error?: string
  message?: string
}

function trim(value: string) {
  return value.trim()
}

export function generateStreamlabsState() {
  return crypto.randomUUID().replaceAll('-', '')
}

export function isAllowedStreamlabsRedirectUri(redirectUri: string, allowedHosts: string[]) {
  try {
    const parsed = new URL(redirectUri)

    return (
      parsed.protocol === 'http:' &&
      allowedHosts.includes(parsed.hostname) &&
      parsed.pathname === STREAMLABS_CALLBACK_PATH
    )
  } catch {
    return false
  }
}

export function buildStreamlabsAuthorizeUrl(input: {
  clientId: string
  redirectUri: string
  scopes: string[]
  state: string
}) {
  const url = new URL(STREAMLABS_AUTHORIZE_URL)
  url.searchParams.set('client_id', trim(input.clientId))
  url.searchParams.set('redirect_uri', trim(input.redirectUri))
  url.searchParams.set('response_type', 'code')
  url.searchParams.set('state', trim(input.state))

  if (input.scopes.length > 0) {
    url.searchParams.set('scope', input.scopes.join(' '))
  }

  return url.toString()
}

export async function exchangeStreamlabsAuthorizationCode(input: {
  clientId: string
  clientSecret: string
  redirectUri: string
  code: string
}) {
  const response = await fetch(STREAMLABS_TOKEN_URL, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-requested-with': 'XMLHttpRequest',
    },
    body: JSON.stringify({
      grant_type: 'authorization_code',
      client_id: trim(input.clientId),
      client_secret: trim(input.clientSecret),
      redirect_uri: trim(input.redirectUri),
      code: trim(input.code),
    }),
  })

  const payload = (await response.json()) as StreamlabsTokenPayload

  if (!response.ok || !payload.access_token) {
    throw new Error(
      payload.message?.trim() ||
        payload.error?.trim() ||
        `Streamlabs token exchange failed (${response.status}).`,
    )
  }

  return {
    accessToken: payload.access_token,
    refreshToken: payload.refresh_token?.trim() || null,
    tokenType: payload.token_type?.trim() || null,
    scope: payload.scope?.trim() || null,
    expiresIn: typeof payload.expires_in === 'number' ? payload.expires_in : null,
    createdAt: Date.now(),
  } satisfies StreamlabsTokenResponse
}

export async function refreshStreamlabsAccessToken(input: {
  clientId: string
  clientSecret: string
  refreshToken: string
}) {
  const response = await fetch(STREAMLABS_TOKEN_URL, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-requested-with': 'XMLHttpRequest',
    },
    body: JSON.stringify({
      grant_type: 'refresh_token',
      client_id: trim(input.clientId),
      client_secret: trim(input.clientSecret),
      refresh_token: trim(input.refreshToken),
    }),
  })

  const payload = (await response.json()) as StreamlabsTokenPayload

  if (!response.ok || !payload.access_token) {
    throw new Error(
      payload.message?.trim() ||
        payload.error?.trim() ||
        `Streamlabs token refresh failed (${response.status}).`,
    )
  }

  return {
    accessToken: payload.access_token,
    refreshToken: payload.refresh_token?.trim() || trim(input.refreshToken),
    tokenType: payload.token_type?.trim() || null,
    scope: payload.scope?.trim() || null,
    expiresIn: typeof payload.expires_in === 'number' ? payload.expires_in : null,
    createdAt: Date.now(),
  } satisfies StreamlabsTokenResponse
}
