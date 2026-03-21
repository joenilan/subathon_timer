import { useState } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { TimerWidget } from '../components/TimerWidget'
import { buildTimerRuleDisplay } from '../lib/timer/ruleDefinitions'
import { formatSignedDuration } from '../lib/timer/engine'
import { useAppStore } from '../state/useAppStore'
import { selectDashboardPageState } from '../state/selectors'

function EditIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M3 17.25V21h3.75L17.8 9.94l-3.75-3.75L3 17.25zm14.71-9.04a1.003 1.003 0 0 0 0-1.42l-2.5-2.5a1.003 1.003 0 0 0-1.42 0l-1.96 1.96 3.75 3.75 2.13-1.79z"
        fill="currentColor"
      />
    </svg>
  )
}

function normalizeAdjustInput(value: string) {
  return value.replace(/[^\d:]/g, '').slice(0, 8)
}

function formatAdjustDuration(totalSeconds: number) {
  const safeTotal = Math.max(0, Math.floor(totalSeconds))
  const hours = Math.floor(safeTotal / 3600)
  const minutes = Math.floor((safeTotal % 3600) / 60)
  const seconds = safeTotal % 60

  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
  }

  return `${String(Math.floor(safeTotal / 60)).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
}

function parseAdjustDuration(value: string) {
  const parts = value
    .split(':')
    .map((part) => part.trim())
    .filter(Boolean)

  if (parts.length === 0) {
    return 0
  }

  const numericParts = parts.map((part) => Math.max(0, Number.parseInt(part, 10) || 0))

  if (numericParts.length === 1) {
    return numericParts[0] * 60
  }

  if (numericParts.length === 2) {
    const [minutes, seconds] = numericParts
    return minutes * 60 + Math.min(seconds, 59)
  }

  const [hours, minutes, seconds] = numericParts.slice(-3)
  return hours * 3600 + Math.min(minutes, 59) * 60 + Math.min(seconds, 59)
}

function formatRelativeTimestamp(timestamp: number) {
  const deltaSeconds = Math.max(0, Math.floor((Date.now() - timestamp) / 1000))

  if (deltaSeconds < 60) {
    return 'Just now'
  }

  if (deltaSeconds < 3600) {
    return `${Math.floor(deltaSeconds / 60)}m ago`
  }

  return `${Math.floor(deltaSeconds / 3600)}h ago`
}

export function DashboardPage() {
  const [customAdjustSeconds, setCustomAdjustSeconds] = useState(60)
  const [adjustDraft, setAdjustDraft] = useState('01:00')
  const [isEditingAdjust, setIsEditingAdjust] = useState(false)
  const {
    setSidebarCollapsed,
    dashMode,
    setDashMode,
    timerWidgetTheme,
    timerStatus,
    timerRemainingSeconds,
    uptimeSeconds,
    lastAppliedDeltaSeconds,
    trendPoints,
    activity,
    ruleConfig,
    startTimer,
    pauseTimer,
    resetTimer,
    adjustTimer,
    setTimerSeconds,
    setRuleValue,
  } = useAppStore(useShallow(selectDashboardPageState))
  const dashboardRules = buildTimerRuleDisplay(ruleConfig)
  const runButtonLabel =
    timerStatus === 'running'
      ? 'Pause'
      : timerStatus === 'paused' && uptimeSeconds > 0 && timerRemainingSeconds > 0
        ? 'Resume'
        : 'Start'
  const runButtonClass = timerStatus === 'running' ? 'btn btn--ghost btn--compact' : 'btn btn--primary btn--compact'
  const isMinimalMode = dashMode === 'minimal'

  const applyCustomAdjust = (direction: 1 | -1) => {
    if (customAdjustSeconds <= 0) {
      return
    }

    adjustTimer(direction * customAdjustSeconds, direction > 0 ? 'Manual add' : 'Manual remove')
  }

  const openAdjustEditor = () => {
    setAdjustDraft(formatAdjustDuration(customAdjustSeconds))
    setIsEditingAdjust(true)
  }

  const closeAdjustEditor = () => {
    setAdjustDraft(formatAdjustDuration(customAdjustSeconds))
    setIsEditingAdjust(false)
  }

  const saveAdjustEditor = () => {
    const nextSeconds = parseAdjustDuration(adjustDraft)
    setCustomAdjustSeconds(nextSeconds)
    setAdjustDraft(formatAdjustDuration(nextSeconds))
    setIsEditingAdjust(false)
  }

  return (
    <div className="page-container dashboard-page">
      <div className="dash-mode-bar">
        <span className="dash-mode-title">Live</span>

        <div className="dash-mode-actions">
          <div className="dash-mode-selector">
            <button
              className={`mode-chip${dashMode === 'minimal' ? ' active' : ''}`}
              onClick={() => {
                setSidebarCollapsed(true)
                setDashMode('minimal')
              }}
            >
              Minimal
            </button>
            <button
              className={`mode-chip${dashMode === 'live' ? ' active' : ''}`}
              onClick={() => {
                setDashMode('live')
                setSidebarCollapsed(false)
              }}
            >
              Live
            </button>
          </div>
        </div>
      </div>

      <div className={`dashboard-stage${!isMinimalMode ? ' dashboard-stage--with-activity' : ''}`}>
        <div className="dashboard-main">
          <TimerWidget
            theme={timerWidgetTheme}
            surface="dashboard"
            timerSeconds={timerRemainingSeconds}
            uptimeSeconds={uptimeSeconds}
            timerStatus={timerStatus}
            trendPoints={trendPoints}
            rules={dashboardRules}
            lastDeltaSeconds={lastAppliedDeltaSeconds}
            activityCount={activity.length}
            showTrend={!isMinimalMode}
            onCommitTimerSeconds={(value) => setTimerSeconds(value, 'Dashboard edit')}
            onCommitRuleSeconds={setRuleValue}
          />

          <div className="dash-controls">
            <div className="dash-controls-panel">
              <div className="dash-control-block">
                <span className="ctrl-label ctrl-label--block">Run</span>
                <div className="dash-control-actions">
                  <button
                    className={runButtonClass}
                    onClick={timerStatus === 'running' ? pauseTimer : startTimer}
                  >
                    {runButtonLabel}
                  </button>
                  <button className="btn btn--ghost btn--compact" onClick={resetTimer}>Reset</button>
                </div>
              </div>

              <div className="dash-control-block">
                <span className="ctrl-label ctrl-label--block">Quick Adjust</span>
                <div className="dash-control-actions">
                  <button className="btn btn--accent btn--compact" onClick={() => adjustTimer(300, 'Manual add')}>
                    +5 min
                  </button>
                  <button className="btn btn--ghost btn--compact" onClick={() => adjustTimer(60, 'Manual add')}>
                    +1 min
                  </button>
                  <button className="btn btn--ghost btn--compact" onClick={() => adjustTimer(-120, 'Manual remove')}>
                    -2 min
                  </button>
                </div>
              </div>

              <div className="dash-control-block dash-control-block--custom">
                <span className="ctrl-label ctrl-label--block">Custom Adjust</span>
                <div className="dash-control-actions">
                  <button className="btn btn--ghost btn--compact" onClick={() => applyCustomAdjust(-1)} disabled={customAdjustSeconds <= 0}>
                    Remove
                  </button>
                  {isEditingAdjust ? (
                    <form
                      className="dash-adjust-editor"
                      onSubmit={(event) => {
                        event.preventDefault()
                        saveAdjustEditor()
                      }}
                    >
                      <input
                        className="dash-adjust-editor__input"
                        value={adjustDraft}
                        inputMode="numeric"
                        onChange={(event) => setAdjustDraft(normalizeAdjustInput(event.target.value))}
                        onKeyDown={(event) => {
                          if (event.key === 'Escape') {
                            event.preventDefault()
                            closeAdjustEditor()
                          }
                        }}
                        aria-label="Custom adjust duration"
                        autoFocus
                      />
                      <button type="submit" className="btn btn--ghost btn--compact">
                        Save
                      </button>
                      <button type="button" className="btn btn--ghost btn--compact" onClick={closeAdjustEditor}>
                        Cancel
                      </button>
                    </form>
                  ) : (
                    <button
                      type="button"
                      className="dash-adjust-chip"
                      onClick={openAdjustEditor}
                      onDoubleClick={openAdjustEditor}
                      title="Edit custom adjust amount"
                    >
                      <strong>{formatAdjustDuration(customAdjustSeconds)}</strong>
                      <EditIcon />
                    </button>
                  )}
                  <button className="btn btn--accent btn--compact" onClick={() => applyCustomAdjust(1)} disabled={customAdjustSeconds <= 0}>
                    Add
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>

        {!isMinimalMode ? (
          <aside className="dashboard-activity">
            <div className="dash-section dash-section--activity">
              <div className="dash-section-header">
                <span className="dash-section-title">Activity</span>
              </div>
              <div className="activity-list">
                {activity.length > 0 ? (
                  activity.map((entry) => (
                    <div key={entry.id} className="activity-row">
                      <div className="activity-text">
                        <strong>{entry.title}</strong>
                        <p>{entry.summary}</p>
                      </div>
                      <div className="activity-meta">
                        <span className={entry.deltaSeconds >= 0 ? 'delta-pos' : 'delta-neg'}>
                          {formatSignedDuration(entry.deltaSeconds)}
                        </span>
                        <span className="ts">{formatRelativeTimestamp(entry.occurredAt)}</span>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="chart-empty">Timer activity will appear here once Twitch events or manual adjustments land.</div>
                )}
              </div>
            </div>
          </aside>
        ) : null}
      </div>
    </div>
  )
}
