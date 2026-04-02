import type { StreamlabsTipConnection } from './types'

const DEFAULT_TIP_AUTH_BRIDGE_URL = 'http://127.0.0.1:8788'

export interface StreamlabsBridgeStartResult {
  authorizeUrl: string
  state: string
  expiresInSeconds: number
}

interface TipAuthBridgeHealthResponse {
  ok?: boolean
  providers?: {
    streamlabs?: boolean
    streamelements?: boolean
  }
  error?: string
}

export interface TipAuthBridgeHealth {
  baseUrl: string
  ok: boolean
  streamlabsEnabled: boolean
  streamelementsEnabled: boolean
}

export function getTipAuthBridgeBaseUrl() {
  const configured = import.meta.env.VITE_TIP_AUTH_BRIDGE_URL?.trim()
  return configured && configured.length > 0 ? configured : DEFAULT_TIP_AUTH_BRIDGE_URL
}

async function readJson<T>(response: Response) {
  return (await response.json()) as T
}

function buildAuthBridgeFetchError(baseUrl: string, action: string, error: unknown) {
  const detail =
    error instanceof Error && error.message.trim().length > 0
      ? ` ${error.message.trim()}`
      : ''

  return new Error(
    `Unable to ${action} because the Streamlabs auth bridge is not reachable at ${baseUrl}.${detail} Start apps/auth-bridge or set VITE_TIP_AUTH_BRIDGE_URL to your deployed bridge URL.`,
  )
}

async function fetchTipAuthBridge(path: string, init: RequestInit, action: string) {
  const baseUrl = getTipAuthBridgeBaseUrl()

  try {
    return await fetch(`${baseUrl}${path}`, init)
  } catch (error) {
    throw buildAuthBridgeFetchError(baseUrl, action, error)
  }
}

export async function getTipAuthBridgeHealth() {
  const response = await fetchTipAuthBridge(
    '/health',
    {
      method: 'GET',
    },
    'check Streamlabs auth availability',
  )

  const payload = await readJson<TipAuthBridgeHealthResponse>(response)
  const baseUrl = getTipAuthBridgeBaseUrl()

  if (!response.ok || payload.ok !== true) {
    throw new Error(
      payload.error?.trim() || `The Streamlabs auth bridge health check failed at ${baseUrl}.`,
    )
  }

  return {
    baseUrl,
    ok: true,
    streamlabsEnabled: payload.providers?.streamlabs === true,
    streamelementsEnabled: payload.providers?.streamelements === true,
  } satisfies TipAuthBridgeHealth
}

export async function startStreamlabsBridgeOAuth(redirectUri: string) {
  const response = await fetchTipAuthBridge(
    '/api/providers/streamlabs/auth/start',
    {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        redirectUri,
      }),
    },
    'start Streamlabs authorization',
  )

  const payload = await readJson<{ authorizeUrl?: string; state?: string; expiresInSeconds?: number; error?: string }>(response)

  if (!response.ok || !payload.authorizeUrl) {
    throw new Error(payload.error?.trim() || `Streamlabs auth bridge start failed (${response.status}).`)
  }

  return {
    authorizeUrl: payload.authorizeUrl,
    state: payload.state ?? '',
    expiresInSeconds: typeof payload.expiresInSeconds === 'number' ? payload.expiresInSeconds : 0,
  } satisfies StreamlabsBridgeStartResult
}

export async function exchangeStreamlabsBridgeOAuth(input: {
  code: string
  state: string
  redirectUri: string
}) {
  const response = await fetchTipAuthBridge(
    '/api/providers/streamlabs/auth/exchange',
    {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify(input),
    },
    'finish Streamlabs authorization',
  )

  const payload = await readJson<
    | ({
        accessToken: string
        refreshToken: string | null
        tokenType: string | null
      } & Record<string, unknown>)
    | { error?: string }
  >(response)

  if (!response.ok || !('accessToken' in payload) || typeof payload.accessToken !== 'string') {
    const error = 'error' in payload && typeof payload.error === 'string' ? payload.error : null
    throw new Error(error?.trim() || `Streamlabs auth bridge exchange failed (${response.status}).`)
  }

  return {
    accessToken: payload.accessToken,
    refreshToken: typeof payload.refreshToken === 'string' ? payload.refreshToken : null,
    tokenType: typeof payload.tokenType === 'string' ? payload.tokenType : null,
  } satisfies StreamlabsTipConnection
}

export async function refreshStreamlabsBridgeOAuth(refreshToken: string) {
  const response = await fetchTipAuthBridge(
    '/api/providers/streamlabs/auth/refresh',
    {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        refreshToken,
      }),
    },
    'refresh the Streamlabs access token',
  )

  const payload = await readJson<
    | ({
        accessToken: string
        refreshToken: string | null
        tokenType: string | null
      } & Record<string, unknown>)
    | { error?: string }
  >(response)

  if (!response.ok || !('accessToken' in payload) || typeof payload.accessToken !== 'string') {
    const error = 'error' in payload && typeof payload.error === 'string' ? payload.error : null
    throw new Error(error?.trim() || `Streamlabs auth bridge refresh failed (${response.status}).`)
  }

  return {
    accessToken: payload.accessToken,
    refreshToken: typeof payload.refreshToken === 'string' ? payload.refreshToken : null,
    tokenType: typeof payload.tokenType === 'string' ? payload.tokenType : null,
  } satisfies StreamlabsTipConnection
}
