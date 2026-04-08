import { useMemo } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useShallow } from 'zustand/react/shallow'
import { WheelDisplay } from './WheelDisplay'
import { useAppStore } from '../state/useAppStore'
import { selectWheelOverlayState } from '../state/selectors'

export function WheelSpinOverlay() {
  const location = useLocation()
  const navigate = useNavigate()
  const {
    applyWheelResult,
    wheelSegments,
    wheelSpin,
    wheelTextScale,
  } = useAppStore(useShallow(selectWheelOverlayState))

  const activeSegment = useMemo(
    () => wheelSegments.find((segment) => segment.id === wheelSpin.activeSegmentId) ?? null,
    [wheelSegments, wheelSpin.activeSegmentId],
  )

  if (location.pathname === '/wheel' || wheelSpin.status === 'idle') {
    return null
  }

  const isReady = wheelSpin.status === 'ready'
  const headline = isReady ? (wheelSpin.resultTitle ?? 'Wheel result ready') : 'Gift bomb wheel spin'
  const detail = isReady
    ? (wheelSpin.resultSummary ?? 'Review the result and apply it when you are ready.')
    : 'A gifted-sub event triggered the wheel. The outcome will appear here as soon as the spin finishes.'

  return (
    <div className="wheel-spin-overlay" role="presentation">
      <div className="wheel-spin-overlay__backdrop" />
      <section className="panel wheel-spin-overlay__panel" aria-live="polite" aria-label="Wheel spin in progress">
        <div className="wheel-spin-overlay__copy">
          <div className="wheel-spin-overlay__header">
            <div>
              <span className="wheel-spin-overlay__eyebrow">
                {isReady ? 'Wheel result ready' : 'Automatic wheel spin'}
              </span>
              <h2 className="wheel-spin-overlay__title">{headline}</h2>
            </div>
            <span className={`status-chip status-chip--${isReady ? 'connected' : 'pending'}`}>
              {isReady ? 'Ready' : 'Spinning'}
            </span>
          </div>
          <p className="panel-copy wheel-spin-overlay__detail">{detail}</p>
          {activeSegment ? (
            <p className="wheel-spin-overlay__segment">
              Selected segment: <strong>{activeSegment.label}</strong>
            </p>
          ) : null}
          <div className="wheel-spin-overlay__actions">
            <button
              type="button"
              className="btn"
              onClick={() => navigate('/wheel')}
            >
              Open Wheel
            </button>
            {isReady ? (
              <button
                type="button"
                className="btn btn--primary"
                onClick={() => void applyWheelResult()}
              >
                Apply Result
              </button>
            ) : null}
          </div>
        </div>

        <div className="wheel-spin-overlay__stage">
          <WheelDisplay segments={wheelSegments} spin={wheelSpin} textScale={wheelTextScale} />
        </div>
      </section>
    </div>
  )
}
