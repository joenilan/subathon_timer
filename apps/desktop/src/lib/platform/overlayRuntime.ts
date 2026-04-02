import { invoke } from '@tauri-apps/api/core'
import { formatSignedDuration } from '../timer/engine'
import { buildTimerRuleDisplay } from '../timer/ruleDefinitions'
import type { TimerRuleConfig, TimerWidgetTheme } from '../timer/types'
import type { TimerActivityEntry, TimerStatus } from '../../state/useAppStore'
import type { OverlayTransform } from './overlayTransform'

interface BootstrapState {
  overlayBaseUrl: string | null
  overlayPreviewBaseUrl: string | null
  overlayLanBaseUrl: string | null
  overlayLanAccessEnabled: boolean
}

interface SyncOverlayPayload {
  timerSeconds: number
  uptimeSeconds: number
  timerStatus: TimerStatus
  timerTheme: TimerWidgetTheme
  graphPoints: number[]
  timerOverlayTransform: OverlayTransform
  reasonOverlayTransform: OverlayTransform
  incentiveRules: Array<{
    label: string
    value: string
    markerShape: 'square' | 'diamond' | 'pill'
    markerTone: 'blue' | 'mint' | 'green' | 'cyan' | 'lime'
  }>
  overlayPreview: {
    eyebrow: string
    title: string
    summary: string
    delta: string
    tone: string
  }
}

export async function getOverlayBootstrapState() {
  if (!('__TAURI_INTERNALS__' in window)) {
    return {
      overlayBaseUrl: null,
      overlayPreviewBaseUrl: null,
      overlayLanBaseUrl: null,
      overlayLanAccessEnabled: false,
    } satisfies BootstrapState
  }

  return invoke<BootstrapState>('get_bootstrap_state')
}

export async function setOverlayNetworkMode(lanEnabled: boolean) {
  if (!('__TAURI_INTERNALS__' in window)) {
    return {
      overlayBaseUrl: null,
      overlayPreviewBaseUrl: null,
      overlayLanBaseUrl: null,
      overlayLanAccessEnabled: lanEnabled,
    } satisfies BootstrapState
  }

  return invoke<BootstrapState>('set_overlay_network_mode', { lanEnabled })
}

export async function syncOverlayRuntime(payload: SyncOverlayPayload) {
  if (!('__TAURI_INTERNALS__' in window)) {
    return
  }

  await invoke('sync_overlay_state', { payload })
}

export function buildOverlayRules(ruleConfig: TimerRuleConfig) {
  return buildTimerRuleDisplay(ruleConfig).map(({ label, value, markerShape, markerTone }) => ({
    label,
    value,
    markerShape,
    markerTone,
  }))
}

export function buildOverlayPreview(activity: TimerActivityEntry | null) {
  if (!activity) {
    return {
      eyebrow: 'Recent event',
      title: 'Waiting for activity',
      summary: 'The next Twitch or manual timer event will appear here.',
      delta: '+00:00',
      tone: 'neutral',
    }
  }

  return {
    eyebrow:
      activity.source === 'manual'
        ? 'Manual change'
        : activity.source === 'streamelements'
          ? 'StreamElements tip'
          : activity.source === 'streamlabs'
            ? 'Streamlabs tip'
            : 'Twitch event',
    title: activity.title,
    summary: activity.summary,
    delta: formatSignedDuration(activity.deltaSeconds),
    tone: activity.deltaSeconds < 0 ? 'negative' : 'positive',
  }
}
