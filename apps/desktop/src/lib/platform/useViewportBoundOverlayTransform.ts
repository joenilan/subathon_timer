import { useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { clampOverlayTransformToViewport, type OverlayAnchor, type OverlayTransform, type OverlayViewportMetrics } from './overlayTransform'

interface OverlayCanvasMetrics {
  overlayWidth: number
  overlayHeight: number
  viewportWidth: number
  viewportHeight: number
  paddingLeft: number
  paddingRight: number
  paddingTop: number
  paddingBottom: number
}

function parsePixels(value: string) {
  const parsed = Number.parseFloat(value)
  return Number.isFinite(parsed) ? parsed : 0
}

function metricsMatch(current: OverlayCanvasMetrics | null, next: OverlayCanvasMetrics) {
  return (
    current?.overlayWidth === next.overlayWidth &&
    current.overlayHeight === next.overlayHeight &&
    current.viewportWidth === next.viewportWidth &&
    current.viewportHeight === next.viewportHeight &&
    current.paddingLeft === next.paddingLeft &&
    current.paddingRight === next.paddingRight &&
    current.paddingTop === next.paddingTop &&
    current.paddingBottom === next.paddingBottom
  )
}

function readCanvasMetrics(element: HTMLDivElement | null): OverlayCanvasMetrics | null {
  if (!element || typeof window === 'undefined') {
    return null
  }

  const parent = element.parentElement
  const parentStyle = parent ? window.getComputedStyle(parent) : null

  return {
    overlayWidth: element.offsetWidth,
    overlayHeight: element.offsetHeight,
    viewportWidth: window.innerWidth,
    viewportHeight: window.innerHeight,
    paddingLeft: parsePixels(parentStyle?.paddingLeft ?? '0'),
    paddingRight: parsePixels(parentStyle?.paddingRight ?? '0'),
    paddingTop: parsePixels(parentStyle?.paddingTop ?? '0'),
    paddingBottom: parsePixels(parentStyle?.paddingBottom ?? '0'),
  }
}

export function useViewportBoundOverlayTransform(transform: OverlayTransform, anchor: OverlayAnchor) {
  const canvasRef = useRef<HTMLDivElement | null>(null)
  const [metrics, setMetrics] = useState<OverlayCanvasMetrics | null>(null)

  useLayoutEffect(() => {
    if (typeof window === 'undefined') {
      return
    }

    const measure = () => {
      const nextMetrics = readCanvasMetrics(canvasRef.current)

      if (!nextMetrics) {
        return
      }

      setMetrics((current) => (metricsMatch(current, nextMetrics) ? current : nextMetrics))
    }

    measure()

    const handleResize = () => measure()
    const observer = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(() => measure()) : null

    if (canvasRef.current) {
      observer?.observe(canvasRef.current)
    }

    if (canvasRef.current?.parentElement) {
      observer?.observe(canvasRef.current.parentElement)
    }

    window.addEventListener('resize', handleResize)

    return () => {
      window.removeEventListener('resize', handleResize)
      observer?.disconnect()
    }
  }, [])

  const clampedTransform = useMemo(() => {
    if (!metrics) {
      return transform
    }

    const viewportMetrics: OverlayViewportMetrics = {
      ...metrics,
      anchor,
    }

    return clampOverlayTransformToViewport(transform, viewportMetrics)
  }, [anchor, metrics, transform])

  const canvasStyle = useMemo(
    () =>
      ({
        '--overlay-offset-x': `${clampedTransform.x}px`,
        '--overlay-offset-y': `${clampedTransform.y}px`,
        '--overlay-scale': String(clampedTransform.scale),
      }) as CSSProperties,
    [clampedTransform.scale, clampedTransform.x, clampedTransform.y],
  )

  return { canvasRef, canvasStyle, clampedTransform }
}
