import { useLocation } from 'react-router-dom'
import { useShallow } from 'zustand/react/shallow'
import { GoalsOverlaySurface } from '../components/GoalsOverlaySurface'
import { buildGoalOverlayLadders } from '../lib/goals/overlay'
import { defaultOverlayTransforms } from '../lib/platform/overlayTransform'
import { useViewportBoundOverlayTransform } from '../lib/platform/useViewportBoundOverlayTransform'
import { selectGoalsOverlayState } from '../state/selectors'
import { useAppStore } from '../state/useAppStore'
import { useGoalsStore } from '../state/useGoalsStore'

export function GoalsOverlayPage() {
  const location = useLocation()
  const { goalsOverlayTransform } = useAppStore(useShallow(selectGoalsOverlayState))
  const ladders = useGoalsStore((state) => state.ladders)
  const isStudioPreview = new URLSearchParams(location.search).get('studio') === '1'
  const activeTransform = isStudioPreview ? defaultOverlayTransforms.goals : goalsOverlayTransform
  const { canvasRef, canvasStyle } = useViewportBoundOverlayTransform(activeTransform, 'center')

  return (
    <div className="overlay overlay--goals">
      <div ref={canvasRef} className="overlay__canvas overlay__canvas--goals" style={canvasStyle}>
        <GoalsOverlaySurface ladders={buildGoalOverlayLadders(ladders)} isStudioPreview={isStudioPreview} />
      </div>
    </div>
  )
}
