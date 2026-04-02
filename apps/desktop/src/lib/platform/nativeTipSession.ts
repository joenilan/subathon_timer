import { invoke } from '@tauri-apps/api/core'
import type { StreamElementsTokenType, TipProviderSnapshot } from '../tips/types'

const BROWSER_NATIVE_TIP_SESSION_KEY = 'fdgt.tip-providers.native'

function isNativeRuntime() {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window
}

function normalizeStreamlabsConnection(value: unknown) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null
  }

  const record = value as Record<string, unknown>
  const accessToken = typeof record.accessToken === 'string' ? record.accessToken : ''

  if (!accessToken) {
    return null
  }

  return {
    accessToken,
    refreshToken: typeof record.refreshToken === 'string' ? record.refreshToken : null,
    tokenType: typeof record.tokenType === 'string' ? record.tokenType : null,
  }
}

function normalizeStreamElementsConnection(value: unknown) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null
  }

  const record = value as Record<string, unknown>
  const token = typeof record.token === 'string' ? record.token : ''
  const tokenType = typeof record.tokenType === 'string' ? record.tokenType : ''

  if (!token || !tokenType) {
    return null
  }

  return {
    token,
    tokenType: tokenType as StreamElementsTokenType,
  }
}

function normalizeStreamlabsAppConfig(value: unknown) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null
  }

  const record = value as Record<string, unknown>
  const clientId = typeof record.clientId === 'string' ? record.clientId : ''
  const clientSecret = typeof record.clientSecret === 'string' ? record.clientSecret : ''
  const redirectUri = typeof record.redirectUri === 'string' ? record.redirectUri : ''

  if (!clientId || !clientSecret || !redirectUri) {
    return null
  }

  return {
    clientId,
    clientSecret,
    redirectUri,
  }
}

function parseBrowserSnapshot(raw: string | null) {
  if (!raw) {
    return null
  }

  try {
    const parsed = JSON.parse(raw) as Record<string, unknown> | null
    if (!parsed || typeof parsed !== 'object') {
      return null
    }

    if (parsed.version === 2) {
      return {
        version: 2,
        streamelements: normalizeStreamElementsConnection(parsed.streamelements),
        streamlabsApp: normalizeStreamlabsAppConfig(parsed.streamlabsApp),
        streamlabs: normalizeStreamlabsConnection(parsed.streamlabs),
      } satisfies TipProviderSnapshot
    }

    if (parsed.version === 1) {
      return {
        version: 2,
        streamelements: normalizeStreamElementsConnection(parsed.streamelements),
        streamlabsApp: null,
        streamlabs: normalizeStreamlabsConnection(parsed.streamlabs),
      } satisfies TipProviderSnapshot
    }

    return null
  } catch {
    return null
  }
}

export async function loadNativeTipProviderSnapshot() {
  if (!isNativeRuntime()) {
    return parseBrowserSnapshot(window.localStorage.getItem(BROWSER_NATIVE_TIP_SESSION_KEY))
  }

  const snapshot = await invoke<Record<string, unknown> | null>('load_native_tip_provider_session')
  return parseBrowserSnapshot(snapshot ? JSON.stringify(snapshot) : null)
}

export async function saveNativeTipProviderSnapshot(snapshot: TipProviderSnapshot) {
  if (!isNativeRuntime()) {
    window.localStorage.setItem(BROWSER_NATIVE_TIP_SESSION_KEY, JSON.stringify(snapshot))
    return
  }

  await invoke('save_native_tip_provider_session', { snapshot })
}

export async function clearNativeTipProviderSnapshot() {
  if (!isNativeRuntime()) {
    window.localStorage.removeItem(BROWSER_NATIVE_TIP_SESSION_KEY)
    return
  }

  await invoke('clear_native_tip_provider_session')
}

export function buildNativeTipProviderSnapshot(input: {
  streamelements: TipProviderSnapshot['streamelements']
  streamlabsApp: TipProviderSnapshot['streamlabsApp']
  streamlabs: TipProviderSnapshot['streamlabs']
}): TipProviderSnapshot {
  return {
    version: 2,
    streamelements: input.streamelements,
    streamlabsApp: input.streamlabsApp,
    streamlabs: input.streamlabs,
  }
}
