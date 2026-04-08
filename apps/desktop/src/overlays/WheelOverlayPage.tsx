import { useLocation } from 'react-router-dom'
import { useShallow } from 'zustand/react/shallow'
import { WheelDisplay } from '../components/WheelDisplay'
import { defaultOverlayTransforms } from '../lib/platform/overlayTransform'
import { useViewportBoundOverlayTransform } from '../lib/platform/useViewportBoundOverlayTransform'
import { useAppStore } from '../state/useAppStore'
import { selectWheelOverlayState } from '../state/selectors'

export function WheelOverlayPage() {
  const location = useLocation()
  const { wheelOverlayTransform, wheelSegments, wheelSpin, wheelTextScale } = useAppStore(useShallow(selectWheelOverlayState))
  const isStudioPreview = new URLSearchParams(location.search).get('studio') === '1'
  const activeTransform = isStudioPreview ? defaultOverlayTransforms.wheel : wheelOverlayTransform
  const { canvasRef, canvasStyle } = useViewportBoundOverlayTransform(activeTransform, 'center')
  const previewSpin = isStudioPreview && wheelSegments[0]
    ? {
        status: 'ready' as const,
        activeSegmentId: wheelSegments[0].id,
        resultTitle: wheelSegments[0].label,
        resultSummary: 'Studio preview stays visible so you can place and scale the wheel overlay before the next gifted sub spin.',
        requiresModeration: wheelSegments[0].moderationRequired,
        autoApply: false,
      }
    : wheelSpin
  const displaySpin = isStudioPreview ? previewSpin : wheelSpin

  if (displaySpin.status === 'idle' || !displaySpin.activeSegmentId) {
    return <div className="overlay overlay--wheel overlay--wheel-empty" />
  }

  return (
    <div className="overlay overlay--wheel">
      <div ref={canvasRef} className="overlay__canvas overlay__canvas--wheel" style={canvasStyle}>
        <div className="wheel-overlay-card">
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
        </div>
      </div>
    </div>
  )
}
