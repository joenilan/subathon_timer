import { invoke } from '@tauri-apps/api/core'

export const STREAMLABS_DEFAULT_REDIRECT_URI = 'http://127.0.0.1:31847/auth/streamlabs/callback'

export interface NativeStreamlabsOAuthResult {
  status: 'success' | 'error'
  code: string | null
  state: string | null
  error: string | null
}

function isNativeRuntime() {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window
}

export async function consumeNativeStreamlabsOAuthResult() {
  if (!isNativeRuntime()) {
    return null
  }

  return invoke<NativeStreamlabsOAuthResult | null>('consume_streamlabs_oauth_result')
}

export async function cancelNativeStreamlabsOAuth() {
  if (!isNativeRuntime()) {
    return
  }

  await invoke('cancel_streamlabs_oauth')
}
