import { useLocation } from 'react-router-dom'
import { useShallow } from 'zustand/react/shallow'
import { WheelLiveSurface } from '../components/WheelLiveSurface'
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

  return (
    <div className={`overlay overlay--wheel${isStudioPreview ? ' overlay--wheel-studio' : ''}`}>
      <div ref={canvasRef} className="overlay__canvas overlay__canvas--wheel" style={canvasStyle}>
        <WheelLiveSurface
          isStudioPreview={isStudioPreview}
          variant="overlay"
          wheelSegments={wheelSegments}
          wheelSpin={wheelSpin}
          wheelTextScale={wheelTextScale}
        />
      </div>
    </div>
  )
}
