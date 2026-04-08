import { useShallow } from 'zustand/react/shallow'
import { WheelDisplay } from '../components/WheelDisplay'
import { useAppStore } from '../state/useAppStore'
import { selectWheelOverlayState } from '../state/selectors'

export function WheelOverlayPage() {
  const { wheelSegments, wheelSpin, wheelTextScale } = useAppStore(useShallow(selectWheelOverlayState))

  if (wheelSpin.status === 'idle' || !wheelSpin.activeSegmentId) {
    return <div className="overlay overlay--wheel overlay--wheel-empty" />
  }

  return (
    <div className="overlay overlay--wheel">
      <div className="overlay__canvas overlay__canvas--wheel">
        <div className="wheel-overlay-card">
          <div className="wheel-overlay-card__header">
            <span className="wheel-overlay-card__eyebrow">
              {wheelSpin.status === 'spinning' ? 'Gift bomb wheel' : 'Wheel result'}
            </span>
            <strong className="wheel-overlay-card__title">
              {wheelSpin.status === 'spinning'
                ? 'Spinning now'
                : (wheelSpin.resultTitle ?? 'Result ready')}
            </strong>
            <p className="wheel-overlay-card__summary">
              {wheelSpin.status === 'spinning'
                ? 'A gifted sub event triggered the wheel.'
                : (wheelSpin.resultSummary ?? 'Waiting for the operator to apply the result.')}
            </p>
          </div>
          <WheelDisplay segments={wheelSegments} spin={wheelSpin} textScale={wheelTextScale} />
        </div>
      </div>
    </div>
  )
}
