import { AuthBridgeConfig, hasStreamlabsBridgeConfig } from './config'
import {
  buildStreamlabsAuthorizeUrl,
  exchangeStreamlabsAuthorizationCode,
  generateStreamlabsState,
  isAllowedStreamlabsRedirectUri,
  refreshStreamlabsAccessToken,
  type PendingStreamlabsAuth,
  type StreamlabsExchangeRequest,
  type StreamlabsStartRequest,
} from './providers/streamlabs'

const STREAMLABS_PENDING_TTL_MS = 5 * 60 * 1000

function jsonResponse(status: number, body: unknown) {
  return Response.json(body, {
    status,
    headers: {
      'access-control-allow-origin': '*',
      'access-control-allow-headers': 'content-type',
      'access-control-allow-methods': 'GET,POST,OPTIONS',
      'cache-control': 'no-store',
    },
  })
}

async function readJson<T>(request: Request) {
  try {
    return (await request.json()) as T
  } catch {
    return null
  }
}

export function createAuthBridgeServer(config: AuthBridgeConfig) {
  const pendingStreamlabsStates = new Map<string, PendingStreamlabsAuth>()

  function cleanupExpiredStreamlabsStates() {
    const cutoff = Date.now() - STREAMLABS_PENDING_TTL_MS

    for (const [state, pending] of pendingStreamlabsStates.entries()) {
      if (pending.createdAt < cutoff) {
        pendingStreamlabsStates.delete(state)
      }
    }
  }

  return {
    async fetch(request: Request) {
      if (request.method === 'OPTIONS') {
        return new Response(null, {
          status: 204,
          headers: {
            'access-control-allow-origin': '*',
            'access-control-allow-headers': 'content-type',
            'access-control-allow-methods': 'GET,POST,OPTIONS',
            'cache-control': 'no-store',
          },
        })
      }

      const url = new URL(request.url)

      if (request.method === 'GET' && url.pathname === '/health') {
        return jsonResponse(200, {
          ok: true,
          providers: {
            streamlabs: hasStreamlabsBridgeConfig(config),
            streamelements: false,
          },
        })
      }

      if (request.method === 'POST' && url.pathname === '/api/providers/streamlabs/auth/start') {
        if (!hasStreamlabsBridgeConfig(config)) {
          return jsonResponse(503, {
            error: 'Streamlabs auth bridge is not configured on this server.',
          })
        }

        const body = await readJson<StreamlabsStartRequest>(request)
        const redirectUri = body?.redirectUri?.trim() ?? ''

        if (!isAllowedStreamlabsRedirectUri(redirectUri, config.streamlabsAllowedRedirectHosts)) {
          return jsonResponse(400, {
            error: 'Streamlabs redirect URI must be the local desktop callback URL.',
          })
        }

        cleanupExpiredStreamlabsStates()

        const state = generateStreamlabsState()
        pendingStreamlabsStates.set(state, {
          redirectUri,
          createdAt: Date.now(),
        })

        return jsonResponse(200, {
          authorizeUrl: buildStreamlabsAuthorizeUrl({
            clientId: config.streamlabsClientId!,
            redirectUri,
            scopes: config.streamlabsScopes,
            state,
          }),
          state,
          expiresInSeconds: STREAMLABS_PENDING_TTL_MS / 1000,
        })
      }

      if (request.method === 'POST' && url.pathname === '/api/providers/streamlabs/auth/exchange') {
        if (!hasStreamlabsBridgeConfig(config)) {
          return jsonResponse(503, {
            error: 'Streamlabs auth bridge is not configured on this server.',
          })
        }

        const body = await readJson<StreamlabsExchangeRequest>(request)
        const code = body?.code?.trim() ?? ''
        const state = body?.state?.trim() ?? ''
        const redirectUri = body?.redirectUri?.trim() ?? ''

        if (!code || !state || !redirectUri) {
          return jsonResponse(400, {
            error: 'Streamlabs auth exchange requires code, state, and redirectUri.',
          })
        }

        const pending = pendingStreamlabsStates.get(state)
        pendingStreamlabsStates.delete(state)

        if (!pending) {
          return jsonResponse(400, {
            error: 'Streamlabs auth state is missing or expired. Start the connection again.',
          })
        }

        if (pending.redirectUri !== redirectUri) {
          return jsonResponse(400, {
            error: 'Streamlabs redirect URI mismatch.',
          })
        }

        if (pending.createdAt < Date.now() - STREAMLABS_PENDING_TTL_MS) {
          return jsonResponse(400, {
            error: 'Streamlabs auth state expired. Start the connection again.',
          })
        }

        try {
          const tokens = await exchangeStreamlabsAuthorizationCode({
            clientId: config.streamlabsClientId!,
            clientSecret: config.streamlabsClientSecret!,
            redirectUri,
            code,
          })

          return jsonResponse(200, tokens)
        } catch (error) {
          return jsonResponse(502, {
            error: error instanceof Error ? error.message : 'Streamlabs token exchange failed.',
          })
        }
      }

      if (request.method === 'POST' && url.pathname === '/api/providers/streamlabs/auth/refresh') {
        if (!hasStreamlabsBridgeConfig(config)) {
          return jsonResponse(503, {
            error: 'Streamlabs auth bridge is not configured on this server.',
          })
        }

        const body = await readJson<{ refreshToken?: string }>(request)
        const refreshToken = body?.refreshToken?.trim() ?? ''

        if (!refreshToken) {
          return jsonResponse(400, {
            error: 'Streamlabs token refresh requires a refreshToken.',
          })
        }

        try {
          const tokens = await refreshStreamlabsAccessToken({
            clientId: config.streamlabsClientId!,
            clientSecret: config.streamlabsClientSecret!,
            refreshToken,
          })

          return jsonResponse(200, tokens)
        } catch (error) {
          return jsonResponse(502, {
            error: error instanceof Error ? error.message : 'Streamlabs token refresh failed.',
          })
        }
      }

      return jsonResponse(404, {
        error: 'Not found.',
      })
    },
  }
}
