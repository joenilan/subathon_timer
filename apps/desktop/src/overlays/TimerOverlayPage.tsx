import { useLocation } from 'react-router-dom'
import { useShallow } from 'zustand/react/shallow'
import { TimerWidget } from '../components/TimerWidget'
import { defaultOverlayTransforms } from '../lib/platform/overlayTransform'
import { buildOverlayRules } from '../lib/platform/overlayRuntime'
import { useViewportBoundOverlayTransform } from '../lib/platform/useViewportBoundOverlayTransform'
import { useAppStore } from '../state/useAppStore'
import { selectTimerOverlayState } from '../state/selectors'

export function TimerOverlayPage() {
  const location = useLocation()
  const {
    timerRemainingSeconds,
    uptimeSeconds,
    timerStatus,
    trendPoints,
    ruleConfig,
    timerWidgetTheme,
    timerOverlayTransform,
  } = useAppStore(useShallow(selectTimerOverlayState))
  const hasTrend = trendPoints.length > 1
  const isStudioPreview = new URLSearchParams(location.search).get('studio') === '1'
  const activeTransform = isStudioPreview ? defaultOverlayTransforms.timer : timerOverlayTransform
  const { canvasRef, canvasStyle } = useViewportBoundOverlayTransform(activeTransform, 'center')

  return (
    <div className="overlay overlay--timer">
      <div ref={canvasRef} className="overlay__canvas overlay__canvas--timer" style={canvasStyle}>
        <TimerWidget
          theme={timerWidgetTheme}
          surface="overlay"
          timerSeconds={timerRemainingSeconds}
          uptimeSeconds={uptimeSeconds}
          timerStatus={timerStatus}
          trendPoints={trendPoints}
          rules={buildOverlayRules(ruleConfig)}
          showTrend={hasTrend}
        />
      </div>
    </div>
  )
}
