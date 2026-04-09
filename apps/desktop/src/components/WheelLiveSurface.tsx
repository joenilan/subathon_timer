import { useEffect, useMemo, useRef, useState } from 'react'
import { WheelDisplay } from './WheelDisplay'
import type { WheelSegment, WheelSpinState } from '../lib/wheel/types'

const OVERLAY_INTRO_MS = 320
const OVERLAY_OUTRO_MS = 360
const OVERLAY_SPIN_REVEAL_MS = 1800

type WheelOverlayPhase = 'hidden' | 'entering' | 'visible' | 'exiting'

interface WheelLiveSurfaceProps {
  isStudioPreview?: boolean
  variant?: 'overlay' | 'shell'
  wheelSegments: WheelSegment[]
  wheelSpin: WheelSpinState
  wheelTextScale: number
}

function getResultCopy(input: {
  autoApply: boolean
  isPlacementPreview: boolean
  isTest: boolean
  requiresModeration: boolean
  status: WheelSpinState['status']
}) {
  if (input.isPlacementPreview) {
    return {
      eyebrow: 'Wheel preview',
      title: 'Overlay placement',
      summary: 'Use the Overlay Studio sliders to place and scale the wheel before the next gifted-sub spin.',
      banner: 'Live gifted-sub spins will appear here on stream.',
    }
  }

  if (input.status === 'spinning') {
    return {
      eyebrow: 'Gift bomb wheel',
      title: 'Spinning now',
      summary: 'The wheel is choosing the next outcome live on stream.',
      banner: '',
    }
  }

  if (input.isTest) {
    return {
      eyebrow: 'Test result',
      title: 'Preview complete',
      summary: 'This test spin announced the winner in chat and stopped before applying anything.',
      banner: input.requiresModeration
        ? 'Reconnect Twitch before timeout outcomes can run live.'
        : 'Preview only. No action was applied.',
    }
  }

  if (input.autoApply) {
    return {
      eyebrow: 'Wheel picked',
      title: 'Winner selected',
      summary: 'Gifted subs triggered this result live and the outcome is moving through its apply flow now.',
      banner: input.requiresModeration
        ? 'Reconnect Twitch before timeout outcomes can run.'
        : 'Chat announcement sent. Applying after the reveal.',
    }
  }

  return {
    eyebrow: 'Wheel picked',
    title: 'Result ready',
    summary: 'The wheel landed on this outcome and is waiting for the streamer to apply it from the Wheel page.',
    banner: input.requiresModeration
      ? 'Reconnect Twitch before timeout outcomes can run.'
      : 'Chat announcement sent. Waiting for manual apply.',
  }
}

export function WheelLiveSurface({
  isStudioPreview = false,
  variant = 'overlay',
  wheelSegments,
  wheelSpin,
  wheelTextScale,
}: WheelLiveSurfaceProps) {
  const previewSpin = useMemo<WheelSpinState>(
    () =>
      isStudioPreview && wheelSegments[0]
        ? {
            status: 'spinning',
            activeSegmentId: wheelSegments[0].id,
            resultTitle: 'Overlay placement',
            resultSummary: 'Use the Overlay Studio sliders to place and scale the wheel before the next gifted-sub spin.',
            requiresModeration: wheelSegments[0].moderationRequired,
            autoApply: false,
            isTest: false,
          }
        : wheelSpin,
    [isStudioPreview, wheelSegments, wheelSpin],
  )

  const sourceSpin = isStudioPreview && wheelSpin.status === 'idle' ? previewSpin : wheelSpin
  const isPlacementPreview = isStudioPreview && wheelSpin.status === 'idle'
  const [displaySpin, setDisplaySpin] = useState<WheelSpinState>(sourceSpin)
  const [phase, setPhase] = useState<WheelOverlayPhase>(isPlacementPreview ? 'visible' : 'hidden')
  const outroTimerRef = useRef<number | null>(null)
  const revealTimerRef = useRef<number | null>(null)
  const activeCycleKeyRef = useRef<string | null>(null)
  const revealUnlockedRef = useRef(false)
  const latestSourceSpinRef = useRef<WheelSpinState>(sourceSpin)

  useEffect(() => {
    latestSourceSpinRef.current = sourceSpin
  }, [sourceSpin])

  useEffect(() => {
    if (isPlacementPreview) {
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
          isTest: sourceSpin.isTest,
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
  }, [isPlacementPreview, phase, previewSpin, sourceSpin])

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
    return null
  }

  const copy = getResultCopy({
    autoApply: displaySpin.autoApply,
    isPlacementPreview,
    isTest: displaySpin.isTest,
    requiresModeration: displaySpin.requiresModeration,
    status: displaySpin.status,
  })

  const resultTitle = displaySpin.status === 'spinning'
    ? copy.title
    : (displaySpin.resultTitle ?? 'Result ready')
  const showWheelVisual = displaySpin.status === 'spinning' || isPlacementPreview
  const isResultVisible = displaySpin.status === 'ready' || isPlacementPreview
  const cardClassName = [
    'wheel-overlay-card',
    `wheel-overlay-card--${phase}`,
    displaySpin.status === 'spinning' ? 'wheel-overlay-card--spinning' : 'wheel-overlay-card--result',
    displaySpin.autoApply ? 'wheel-overlay-card--auto-apply' : '',
    isPlacementPreview ? 'wheel-overlay-card--studio' : '',
    variant === 'shell' ? 'wheel-overlay-card--shell' : '',
  ]
    .filter(Boolean)
    .join(' ')
  const resultScreenClassName = [
    'wheel-overlay-result-screen',
    `wheel-overlay-result-screen--${phase}`,
    displaySpin.isTest ? 'wheel-overlay-result-screen--test' : '',
    variant === 'shell' ? 'wheel-overlay-result-screen--shell' : '',
  ]
    .filter(Boolean)
    .join(' ')

  return showWheelVisual ? (
    <div className={cardClassName}>
      <div className="wheel-overlay-card__header">
        <span className="wheel-overlay-card__eyebrow">{copy.eyebrow}</span>
        <strong className="wheel-overlay-card__title">{resultTitle}</strong>
        <p className="wheel-overlay-card__summary">{copy.summary}</p>
      </div>
      <WheelDisplay segments={wheelSegments} spin={displaySpin} textScale={wheelTextScale} />
      <div className={`wheel-overlay-card__result-banner${isResultVisible ? ' is-visible' : ''}`}>
        {copy.banner}
      </div>
    </div>
  ) : (
    <section className={resultScreenClassName}>
      <span className="wheel-overlay-result-screen__eyebrow">{copy.eyebrow}</span>
      <div className="wheel-overlay-result-screen__main">
        <strong className="wheel-overlay-result-screen__title">{displaySpin.resultTitle ?? 'Result ready'}</strong>
        <p className="wheel-overlay-result-screen__summary">{copy.summary}</p>
      </div>
      <div className="wheel-overlay-result-screen__banner">{copy.banner}</div>
    </section>
  )
}
