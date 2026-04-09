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
const OVERLAY_SPIN_REVEAL_MS = 1800
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
            isTest: false,
          }
        : wheelSpin,
    [isStudioPreview, wheelSegments, wheelSpin],
  )

  const sourceSpin = isStudioPreview ? previewSpin : wheelSpin
  const [displaySpin, setDisplaySpin] = useState<WheelSpinState>(sourceSpin)
  const [phase, setPhase] = useState<WheelOverlayPhase>(isStudioPreview ? 'visible' : 'hidden')
  const outroTimerRef = useRef<number | null>(null)
  const revealTimerRef = useRef<number | null>(null)
  const activeCycleKeyRef = useRef<string | null>(null)
  const revealUnlockedRef = useRef(false)
  const latestSourceSpinRef = useRef<WheelSpinState>(sourceSpin)

  useEffect(() => {
    latestSourceSpinRef.current = sourceSpin
  }, [sourceSpin])

  useEffect(() => {
    if (isStudioPreview) {
      if (outroTimerRef.current !== null) {
        window.clearTimeout(outroTimerRef.current)
        outroTimerRef.current = null
      }
      if (revealTimerRef.current !== null) {
        window.clearTimeout(revealTimerRef.current)
        revealTimerRef.current = null
      }
      activeCycleKeyRef.current = null
      revealUnlockedRef.current = false

      setDisplaySpin(previewSpin)
      setPhase('visible')
      return
    }

    const hasActiveSpin = sourceSpin.status !== 'idle' && Boolean(sourceSpin.activeSegmentId)
    if (hasActiveSpin) {
      const cycleKey = sourceSpin.activeSegmentId

      if (outroTimerRef.current !== null) {
        window.clearTimeout(outroTimerRef.current)
        outroTimerRef.current = null
      }

      if (cycleKey && activeCycleKeyRef.current !== cycleKey) {
        activeCycleKeyRef.current = cycleKey
        revealUnlockedRef.current = false

        if (revealTimerRef.current !== null) {
          window.clearTimeout(revealTimerRef.current)
        }

        setDisplaySpin({
          ...sourceSpin,
          status: 'spinning',
          resultTitle: 'Selecting outcome',
          resultSummary: 'Wheel animation in progress.',
        })

        revealTimerRef.current = window.setTimeout(() => {
          revealTimerRef.current = null
          revealUnlockedRef.current = true
          const latestSpin = latestSourceSpinRef.current
          if (latestSpin.status === 'ready' && latestSpin.activeSegmentId === cycleKey) {
            setDisplaySpin(latestSpin)
          }
        }, OVERLAY_SPIN_REVEAL_MS)
      } else if (revealUnlockedRef.current && sourceSpin.status === 'ready') {
        setDisplaySpin(sourceSpin)
      } else if (!revealUnlockedRef.current) {
        setDisplaySpin((currentSpin) => ({
          ...currentSpin,
          activeSegmentId: sourceSpin.activeSegmentId,
          requiresModeration: sourceSpin.requiresModeration,
          autoApply: sourceSpin.autoApply,
        }))
      }

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
      activeCycleKeyRef.current = null
      revealUnlockedRef.current = false
      return
    }

    activeCycleKeyRef.current = null
    revealUnlockedRef.current = false
    if (revealTimerRef.current !== null) {
      window.clearTimeout(revealTimerRef.current)
      revealTimerRef.current = null
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
      if (revealTimerRef.current !== null) {
        window.clearTimeout(revealTimerRef.current)
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
  const resultEyebrow = displaySpin.status === 'spinning'
    ? 'Gift bomb wheel'
    : isStudioPreview
      ? 'Wheel preview'
      : displaySpin.isTest
        ? 'Test result'
        : 'Wheel picked'
  const resultTitle = displaySpin.status === 'spinning'
    ? 'Spinning now'
    : (displaySpin.resultTitle ?? 'Result ready')
  const resultSummary = displaySpin.status === 'spinning'
    ? 'A gifted sub event triggered the wheel.'
    : displaySpin.isTest
      ? 'Preview only. This test spin announced the pick in chat and stopped before applying anything.'
      : displaySpin.autoApply
        ? 'The wheel picked a live outcome and announced it in chat.'
        : 'The wheel has landed. Review the result and apply it when you are ready.'
  const resultBannerText = displaySpin.requiresModeration
    ? 'Reconnect Twitch before timeout outcomes can be applied.'
    : displaySpin.isTest
      ? 'Chat announcement sent. No action was applied.'
    : displaySpin.autoApply
      ? 'Applying automatically after the reveal finishes.'
      : 'Announced in chat. Waiting for the operator to apply the result.'

  return (
    <div className="overlay overlay--wheel">
      <div ref={canvasRef} className="overlay__canvas overlay__canvas--wheel" style={canvasStyle}>
        <div className={cardClassName}>
          <div className="wheel-overlay-card__header">
            <span className="wheel-overlay-card__eyebrow">
              {resultEyebrow}
            </span>
            <strong className="wheel-overlay-card__title">
              {resultTitle}
            </strong>
            <p className="wheel-overlay-card__summary">
              {resultSummary}
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
