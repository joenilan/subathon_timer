import { useEffect, useMemo, useRef, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { useShallow } from 'zustand/react/shallow'
import { WheelDisplay } from '../components/WheelDisplay'
import { defaultOverlayTransforms } from '../lib/platform/overlayTransform'
import { useViewportBoundOverlayTransform } from '../lib/platform/useViewportBoundOverlayTransform'
import type { WheelSpinState } from '../lib/wheel/types'
import { useAppStore } from '../state/useAppStore'
import { selectWheelOverlayState } from '../state/selectors'

const OVERLAY_INTRO_MS = 320
const OVERLAY_OUTRO_MS = 360
type WheelOverlayPhase = 'hidden' | 'entering' | 'visible' | 'exiting'

export function WheelOverlayPage() {
  const location = useLocation()
  const { wheelOverlayTransform, wheelSegments, wheelSpin, wheelTextScale } = useAppStore(useShallow(selectWheelOverlayState))
  const isStudioPreview = new URLSearchParams(location.search).get('studio') === '1'
  const activeTransform = isStudioPreview ? defaultOverlayTransforms.wheel : wheelOverlayTransform
  const { canvasRef, canvasStyle } = useViewportBoundOverlayTransform(activeTransform, 'center')

  const previewSpin = useMemo<WheelSpinState>(
    () =>
      isStudioPreview && wheelSegments[0]
        ? {
            status: 'ready',
            activeSegmentId: wheelSegments[0].id,
            resultTitle: wheelSegments[0].label,
            resultSummary: 'Studio preview stays visible so you can place and scale the wheel overlay before the next gifted sub spin.',
            requiresModeration: wheelSegments[0].moderationRequired,
            autoApply: false,
          }
        : wheelSpin,
    [isStudioPreview, wheelSegments, wheelSpin],
  )

  const sourceSpin = isStudioPreview ? previewSpin : wheelSpin
  const [displaySpin, setDisplaySpin] = useState<WheelSpinState>(sourceSpin)
  const [phase, setPhase] = useState<WheelOverlayPhase>(isStudioPreview ? 'visible' : 'hidden')
  const outroTimerRef = useRef<number | null>(null)

  useEffect(() => {
    if (isStudioPreview) {
      if (outroTimerRef.current !== null) {
        window.clearTimeout(outroTimerRef.current)
        outroTimerRef.current = null
      }

      setDisplaySpin(previewSpin)
      setPhase('visible')
      return
    }

    const hasActiveSpin = sourceSpin.status !== 'idle' && Boolean(sourceSpin.activeSegmentId)
    if (hasActiveSpin) {
      if (outroTimerRef.current !== null) {
        window.clearTimeout(outroTimerRef.current)
        outroTimerRef.current = null
      }

      setDisplaySpin(sourceSpin)

      if (phase === 'hidden' || phase === 'exiting') {
        setPhase('entering')
        const enterTimer = window.setTimeout(() => {
          setPhase('visible')
        }, OVERLAY_INTRO_MS)

        return () => window.clearTimeout(enterTimer)
      }

      if (phase === 'entering') {
        return
      }

      if (phase !== 'visible') {
        setPhase('visible')
      }
      return
    }

    if (phase === 'hidden' || phase === 'exiting') {
      return
    }

    setPhase('exiting')
    outroTimerRef.current = window.setTimeout(() => {
      outroTimerRef.current = null
      setPhase('hidden')
      setDisplaySpin(sourceSpin)
    }, OVERLAY_OUTRO_MS)

    return () => {
      if (outroTimerRef.current !== null) {
        window.clearTimeout(outroTimerRef.current)
        outroTimerRef.current = null
      }
    }
  }, [isStudioPreview, phase, previewSpin, sourceSpin])

  useEffect(() => {
    return () => {
      if (outroTimerRef.current !== null) {
        window.clearTimeout(outroTimerRef.current)
      }
    }
  }, [])

  if (phase === 'hidden' || displaySpin.status === 'idle' || !displaySpin.activeSegmentId) {
    return <div className="overlay overlay--wheel overlay--wheel-empty" />
  }

  const cardClassName = [
    'wheel-overlay-card',
    `wheel-overlay-card--${phase}`,
    displaySpin.status === 'spinning' ? 'wheel-overlay-card--spinning' : 'wheel-overlay-card--result',
    displaySpin.autoApply ? 'wheel-overlay-card--auto-apply' : '',
    isStudioPreview ? 'wheel-overlay-card--studio' : '',
  ]
    .filter(Boolean)
    .join(' ')

  const isResultVisible = displaySpin.status === 'ready'
  const resultBannerText = displaySpin.requiresModeration
    ? 'Reconnect Twitch before timeout outcomes can be applied.'
    : displaySpin.autoApply
      ? 'Applying automatically after the reveal finishes.'
      : 'Waiting for the operator to apply the result.'

  return (
    <div className="overlay overlay--wheel">
      <div ref={canvasRef} className="overlay__canvas overlay__canvas--wheel" style={canvasStyle}>
        <div className={cardClassName}>
          <div className="wheel-overlay-card__header">
            <span className="wheel-overlay-card__eyebrow">
              {displaySpin.status === 'spinning' ? 'Gift bomb wheel' : isStudioPreview ? 'Wheel preview' : 'Wheel result'}
            </span>
            <strong className="wheel-overlay-card__title">
              {displaySpin.status === 'spinning'
                ? 'Spinning now'
                : (displaySpin.resultTitle ?? 'Result ready')}
            </strong>
            <p className="wheel-overlay-card__summary">
              {displaySpin.status === 'spinning'
                ? 'A gifted sub event triggered the wheel.'
                : displaySpin.autoApply
                  ? 'Gifted sub wheel results apply automatically after the reveal finishes.'
                  : (displaySpin.resultSummary ?? 'Waiting for the operator to apply the result.')}
            </p>
          </div>
          <WheelDisplay segments={wheelSegments} spin={displaySpin} textScale={wheelTextScale} />
          <div className={`wheel-overlay-card__result-banner${isResultVisible ? ' is-visible' : ''}`}>
            {resultBannerText}
          </div>
        </div>
      </div>
    </div>
  )
}
