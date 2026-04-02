import type { StreamlabsTipConnection } from './types'

const DEFAULT_TIP_AUTH_BRIDGE_URL = 'http://127.0.0.1:8788'

export interface StreamlabsBridgeStartResult {
  authorizeUrl: string
  state: string
  expiresInSeconds: number
}

function getTipAuthBridgeBaseUrl() {
  const configured = import.meta.env.VITE_TIP_AUTH_BRIDGE_URL?.trim()
  return configured && configured.length > 0 ? configured : DEFAULT_TIP_AUTH_BRIDGE_URL
}

async function readJson<T>(response: Response) {
  return (await response.json()) as T
}

export async function startStreamlabsBridgeOAuth(redirectUri: string) {
  const response = await fetch(`${getTipAuthBridgeBaseUrl()}/api/providers/streamlabs/auth/start`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      redirectUri,
    }),
  })

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
  const response = await fetch(`${getTipAuthBridgeBaseUrl()}/api/providers/streamlabs/auth/exchange`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
    },
    body: JSON.stringify(input),
  })

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
  const response = await fetch(`${getTipAuthBridgeBaseUrl()}/api/providers/streamlabs/auth/refresh`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      refreshToken,
    }),
  })

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
