import type {
  SharedSessionCreateInput,
  SharedSessionHealthResponse,
  SharedSessionJoinInput,
  SharedSessionJoinResponse,
} from './types'

export const DEFAULT_SHARED_SESSION_HTTP_BASE =
  (import.meta.env.VITE_SHARED_SESSION_HTTP_BASE as string | undefined)?.trim() || 'http://127.0.0.1:31947'

function joinUrl(baseUrl: string, path: string) {
  return `${baseUrl.replace(/\/+$/, '')}${path}`
}

async function readJson<T>(response: Response): Promise<T> {
  if (!response.ok) {
    let detail = response.statusText || 'Request failed.'

    try {
      const payload = (await response.json()) as { error?: string }
      if (typeof payload.error === 'string' && payload.error.trim().length > 0) {
        detail = payload.error
      }
    } catch {
      // Ignore parse failures and keep the status text fallback.
    }

    throw new Error(detail)
  }

  return (await response.json()) as T
}

export async function checkSharedSessionHealth(baseUrl: string) {
  const response = await fetch(joinUrl(baseUrl, '/health'))
  return readJson<SharedSessionHealthResponse>(response)
}

export async function createSharedSession(baseUrl: string, input: SharedSessionCreateInput) {
  const response = await fetch(joinUrl(baseUrl, '/sessions'), {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
    },
    body: JSON.stringify(input),
  })

  return readJson<SharedSessionJoinResponse>(response)
}

export async function joinSharedSession(baseUrl: string, input: SharedSessionJoinInput) {
  const response = await fetch(joinUrl(baseUrl, '/sessions/join'), {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
    },
    body: JSON.stringify(input),
  })

  return readJson<SharedSessionJoinResponse>(response)
}

export function buildSharedSessionSocketUrl(baseUrl: string, joinToken: string) {
  const socketBase = baseUrl.replace(/^http/i, 'ws').replace(/\/+$/, '')
  return `${socketBase}/ws?token=${encodeURIComponent(joinToken)}`
}
