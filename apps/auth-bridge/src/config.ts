export interface AuthBridgeConfig {
  host: string
  port: number
  streamlabsClientId: string | null
  streamlabsClientSecret: string | null
  streamlabsAllowedRedirectHosts: string[]
  streamlabsScopes: string[]
}

function parsePort(value: string | undefined, fallback: number) {
  const parsed = Number.parseInt(value ?? '', 10)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback
}

function parseCsv(value: string | undefined, fallback: string[]) {
  const next = (value ?? '')
    .split(',')
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0)

  return next.length > 0 ? next : fallback
}

function trimEnv(value: string | undefined) {
  const next = value?.trim()
  return next && next.length > 0 ? next : null
}

export function loadAuthBridgeConfig(env: Record<string, string | undefined> = Bun.env): AuthBridgeConfig {
  return {
    host: env.AUTH_BRIDGE_HOST?.trim() || '127.0.0.1',
    port: parsePort(env.AUTH_BRIDGE_PORT, 8788),
    streamlabsClientId: trimEnv(env.STREAMLABS_CLIENT_ID),
    streamlabsClientSecret: trimEnv(env.STREAMLABS_CLIENT_SECRET),
    streamlabsAllowedRedirectHosts: parseCsv(env.STREAMLABS_ALLOWED_REDIRECT_HOSTS, ['127.0.0.1', 'localhost']),
    streamlabsScopes: parseCsv(env.STREAMLABS_SCOPES, ['donations.read']),
  }
}

export function hasStreamlabsBridgeConfig(config: AuthBridgeConfig) {
  return Boolean(config.streamlabsClientId && config.streamlabsClientSecret)
}
