import { formatSignedDuration } from '../lib/timer/engine'
import type { TimerWidgetTheme } from '../lib/timer/types'
import type { TimerActivityEntry } from '../state/useAppStore'

interface ReasonWidgetProps {
  theme: TimerWidgetTheme
  activity: TimerActivityEntry | null
}

export function ReasonWidget({ theme, activity }: ReasonWidgetProps) {
  const toneClass = !activity ? 'neutral' : activity.deltaSeconds < 0 ? 'negative' : activity.deltaSeconds > 0 ? 'positive' : 'neutral'

  return (
    <div className={`reason-widget reason-widget--${theme} reason-widget--${toneClass}`}>
      <div className="reason-widget__eyebrow">{activity ? (activity.source === 'manual' ? 'Manual change' : 'Twitch event') : 'Recent event'}</div>
      <strong className="reason-widget__title">{activity?.title ?? 'Waiting for activity'}</strong>
      <p className="reason-widget__summary">
        {activity?.summary ?? 'Sub, gift, cheer, follow, or manual adjustments will appear here.'}
      </p>
      <div className={`reason-widget__delta ${toneClass}`}>
        {activity ? formatSignedDuration(activity.deltaSeconds) : '+00:00'}
      </div>
    </div>
  )
}
