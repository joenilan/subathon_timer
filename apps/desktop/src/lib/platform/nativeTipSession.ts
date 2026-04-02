import { invoke } from '@tauri-apps/api/core'
import type { TipProviderSnapshot } from '../tips/types'

const BROWSER_NATIVE_TIP_SESSION_KEY = 'fdgt.tip-providers.native'

function isNativeRuntime() {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window
}

function parseBrowserSnapshot(raw: string | null) {
  if (!raw) {
    return null
  }

  try {
    const parsed = JSON.parse(raw) as TipProviderSnapshot
    return parsed?.version === 1 ? parsed : null
  } catch {
    return null
  }
}

export async function loadNativeTipProviderSnapshot() {
  if (!isNativeRuntime()) {
    return parseBrowserSnapshot(window.localStorage.getItem(BROWSER_NATIVE_TIP_SESSION_KEY))
  }

  const snapshot = await invoke<TipProviderSnapshot | null>('load_native_tip_provider_session')
  return snapshot?.version === 1 ? snapshot : null
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
  streamlabs: TipProviderSnapshot['streamlabs']
}): TipProviderSnapshot {
  return {
    version: 1,
    streamelements: input.streamelements,
    streamlabs: input.streamlabs,
  }
}
