import { useLocation } from 'react-router-dom'
import { useShallow } from 'zustand/react/shallow'
import { ReasonWidget } from '../components/ReasonWidget'
import { defaultOverlayTransforms } from '../lib/platform/overlayTransform'
import { useViewportBoundOverlayTransform } from '../lib/platform/useViewportBoundOverlayTransform'
import { useAppStore } from '../state/useAppStore'
import { selectReasonOverlayState } from '../state/selectors'

export function ReasonOverlayPage() {
  const location = useLocation()
  const { latestActivity, timerWidgetTheme, reasonOverlayTransform } = useAppStore(useShallow(selectReasonOverlayState))
  const isStudioPreview = new URLSearchParams(location.search).get('studio') === '1'
  const activeTransform = isStudioPreview ? defaultOverlayTransforms.reason : reasonOverlayTransform
  const { canvasRef, canvasStyle } = useViewportBoundOverlayTransform(activeTransform, 'center')

  return (
    <div className="overlay overlay--reason">
      <div ref={canvasRef} className="overlay__canvas overlay__canvas--reason" style={canvasStyle}>
        <ReasonWidget theme={timerWidgetTheme} activity={latestActivity} />
      </div>
    </div>
  )
}
