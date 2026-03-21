export type OverlayKind = 'timer' | 'reason'
export type OverlayAnchor = 'center'

export interface OverlayTransform {
  x: number
  y: number
  scale: number
}

export interface OverlayViewportMetrics {
  overlayWidth: number
  overlayHeight: number
  viewportWidth: number
  viewportHeight: number
  anchor: OverlayAnchor
  paddingLeft?: number
  paddingRight?: number
  paddingTop?: number
  paddingBottom?: number
}

const OVERLAY_OFFSET_LIMIT = 1200
const OVERLAY_SCALE_MIN = 0.4
const OVERLAY_SCALE_MAX = 2.5

export const defaultOverlayTransforms: Record<OverlayKind, OverlayTransform> = {
  timer: {
    x: 0,
    y: 0,
    scale: 1,
  },
  reason: {
    x: 0,
    y: 0,
    scale: 1,
  },
}

export function clampOverlayOffset(value: number) {
  return Math.max(-OVERLAY_OFFSET_LIMIT, Math.min(OVERLAY_OFFSET_LIMIT, Math.round(value)))
}

export function clampOverlayScale(value: number) {
  return Math.max(OVERLAY_SCALE_MIN, Math.min(OVERLAY_SCALE_MAX, Math.round(value * 100) / 100))
}

export function normalizeOverlayTransform(
  value: Partial<OverlayTransform> | null | undefined,
  fallback: OverlayTransform,
): OverlayTransform {
  return {
    x: clampOverlayOffset(value?.x ?? fallback.x),
    y: clampOverlayOffset(value?.y ?? fallback.y),
    scale: clampOverlayScale(value?.scale ?? fallback.scale),
  }
}

function clampWithinRange(value: number, min: number, max: number) {
  if (min > max) {
    return Math.round((min + max) / 2)
  }

  return Math.round(Math.max(min, Math.min(max, value)))
}

function roundViewportScale(value: number) {
  return Math.max(0.1, Math.round(value * 100) / 100)
}

export function clampOverlayTransformToViewport(transform: OverlayTransform, metrics: OverlayViewportMetrics): OverlayTransform {
  const overlayWidth = Math.max(0, metrics.overlayWidth)
  const overlayHeight = Math.max(0, metrics.overlayHeight)
  const viewportWidth = Math.max(0, metrics.viewportWidth)
  const viewportHeight = Math.max(0, metrics.viewportHeight)

  if (!overlayWidth || !overlayHeight || !viewportWidth || !viewportHeight) {
    return transform
  }

  const usableWidth = Math.max(0, viewportWidth - Math.max(0, metrics.paddingLeft ?? 0) - Math.max(0, metrics.paddingRight ?? 0))
  const usableHeight = Math.max(0, viewportHeight - Math.max(0, metrics.paddingTop ?? 0) - Math.max(0, metrics.paddingBottom ?? 0))
  const requestedScale = Math.max(0.1, transform.scale || 1)
  const fitScale = Math.min(requestedScale, usableWidth / overlayWidth, usableHeight / overlayHeight)
  const scale = roundViewportScale(fitScale)
  const maxOffsetX = Math.max(0, (usableWidth - overlayWidth * scale) / 2)
  const maxOffsetY = Math.max(0, (usableHeight - overlayHeight * scale) / 2)

  return {
    x: clampWithinRange(transform.x, -maxOffsetX, maxOffsetX),
    y: clampWithinRange(transform.y, -maxOffsetY, maxOffsetY),
    scale,
  }
}
