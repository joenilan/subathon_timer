import { useState } from 'react'
import { TrendChart } from './TrendChart'
import { formatDurationClock, formatSignedDuration } from '../lib/timer/engine'
import type { TimerDisplayRuleKey, TimerRuleMarkerShape, TimerRuleMarkerTone } from '../lib/timer/ruleDefinitions'
import type { TimerWidgetTheme } from '../lib/timer/types'

export interface TimerWidgetRule {
  key?: TimerDisplayRuleKey
  label: string
  value: string
  seconds?: number
  markerShape?: TimerRuleMarkerShape
  markerTone?: TimerRuleMarkerTone
}

interface TimerWidgetProps {
  theme: TimerWidgetTheme
  surface: 'dashboard' | 'overlay'
  timerSeconds: number
  uptimeSeconds: number
  timerStatus: string
  trendPoints: number[]
  rules: TimerWidgetRule[]
  lastDeltaSeconds?: number
  activityCount?: number
  showTrend?: boolean
  onCommitTimerSeconds?: (value: number) => void
  onCommitRuleSeconds?: (key: TimerDisplayRuleKey, value: number) => void
}

type DurationPart = 'hours' | 'minutes' | 'seconds'

interface DurationDraft {
  hours: string
  minutes: string
  seconds: string
}

function createDurationDraft(totalSeconds: number): DurationDraft {
  const safeTotal = Math.max(0, Math.floor(totalSeconds))
  return {
    hours: String(Math.floor(safeTotal / 3600)),
    minutes: String(Math.floor((safeTotal % 3600) / 60)).padStart(2, '0'),
    seconds: String(safeTotal % 60).padStart(2, '0'),
  }
}

function updateDurationDraft(draft: DurationDraft, part: DurationPart, value: string): DurationDraft {
  const digitsOnly = value.replace(/\D/g, '')
  const nextValue = part === 'hours' ? digitsOnly.slice(0, 3) : digitsOnly.slice(0, 2)
  return {
    ...draft,
    [part]: nextValue,
  }
}

function durationDraftToSeconds(draft: DurationDraft) {
  const hours = Math.max(0, Number.parseInt(draft.hours || '0', 10) || 0)
  const minutes = Math.min(59, Math.max(0, Number.parseInt(draft.minutes || '0', 10) || 0))
  const seconds = Math.min(59, Math.max(0, Number.parseInt(draft.seconds || '0', 10) || 0))
  return hours * 3600 + minutes * 60 + seconds
}

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

function DurationEditor({
  draft,
  onChange,
  onSubmit,
  onCancel,
  submitLabel,
}: {
  draft: DurationDraft
  onChange: (part: DurationPart, value: string) => void
  onSubmit: () => void
  onCancel: () => void
  submitLabel: string
}) {
  return (
    <form
      className="timer-widget__inline-editor"
      onSubmit={(event) => {
        event.preventDefault()
        onSubmit()
      }}
      onKeyDown={(event) => {
        if (event.key === 'Escape') {
          event.preventDefault()
          onCancel()
        }
      }}
    >
      <div className="timer-widget__editor-fields">
        {([
          ['hours', 'HH'],
          ['minutes', 'MM'],
          ['seconds', 'SS'],
        ] as const).map(([part, label]) => (
          <label key={part} className="timer-widget__editor-field">
            <span>{label}</span>
            <input
              className="timer-widget__editor-input"
              inputMode="numeric"
              value={draft[part]}
              onChange={(event) => onChange(part, event.target.value)}
            />
          </label>
        ))}
      </div>
      <div className="timer-widget__editor-actions">
        <button type="submit" className="btn btn--primary">
          {submitLabel}
        </button>
        <button type="button" className="btn btn--ghost" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </form>
  )
}

export function TimerWidget({
  theme,
  surface,
  timerSeconds,
  uptimeSeconds,
  timerStatus,
  trendPoints,
  rules,
  lastDeltaSeconds,
  activityCount,
  showTrend = true,
  onCommitTimerSeconds,
  onCommitRuleSeconds,
}: TimerWidgetProps) {
  const deltaClass = lastDeltaSeconds == null ? '' : lastDeltaSeconds >= 0 ? 'delta-pos' : 'delta-neg'
  const statusClass =
    timerStatus === 'running' ? 'status-running' : timerStatus === 'finished' ? 'delta-neg' : 'status-paused'
  const frameClass = `timer-widget__frame${showTrend ? '' : ' timer-widget__frame--compact'}`
  const isLegacyOriginalOverlay = surface === 'overlay' && theme === 'original'
  const isRemadeAppOverlay = surface === 'overlay' && theme === 'app'
  const isEditableSurface = surface === 'dashboard'
  const canEditTimer = isEditableSurface && typeof onCommitTimerSeconds === 'function'
  const canEditRules = isEditableSurface && typeof onCommitRuleSeconds === 'function'
  const [editingTimer, setEditingTimer] = useState(false)
  const [editingRuleKey, setEditingRuleKey] = useState<TimerDisplayRuleKey | null>(null)
  const [timerDraft, setTimerDraft] = useState(() => createDurationDraft(timerSeconds))
  const [ruleDraft, setRuleDraft] = useState('')

  function openTimerEditor() {
    if (!canEditTimer) {
      return
    }

    setTimerDraft(createDurationDraft(timerSeconds))
    setEditingTimer(true)
  }

  function saveTimerEditor() {
    if (!onCommitTimerSeconds) {
      return
    }

    onCommitTimerSeconds(durationDraftToSeconds(timerDraft))
    setEditingTimer(false)
  }

  function openRuleEditor(rule: TimerWidgetRule) {
    if (!canEditRules || !rule.key) {
      return
    }

    setEditingRuleKey(rule.key)
    setRuleDraft(String(rule.seconds ?? 0))
  }

  function saveRuleEditor() {
    if (!editingRuleKey || !onCommitRuleSeconds) {
      return
    }

    onCommitRuleSeconds(editingRuleKey, Math.max(0, Math.round(Number.parseFloat(ruleDraft) || 0)))
    setEditingRuleKey(null)
    setRuleDraft('')
  }

  return (
    <section className={`timer-widget timer-widget--${theme} timer-widget--${surface}`}>
      <div className={frameClass}>
        <div className="timer-widget__header">
          {!isLegacyOriginalOverlay ? <span className="timer-widget__eyebrow">Stream Uptime</span> : null}
          {!isRemadeAppOverlay ? (
            <div className={`timer-widget__meta${isLegacyOriginalOverlay ? ' timer-widget__meta--legacy' : ''}`}>
              <span>Uptime {formatDurationClock(uptimeSeconds)}</span>
              {!isLegacyOriginalOverlay ? <span className={statusClass}>{timerStatus}</span> : null}
              {!isLegacyOriginalOverlay && lastDeltaSeconds != null ? <span className={deltaClass}>{formatSignedDuration(lastDeltaSeconds)}</span> : null}
              {!isLegacyOriginalOverlay && typeof activityCount === 'number' ? <span>{activityCount} events</span> : null}
            </div>
          ) : null}
        </div>

        <div className={`timer-widget__clock-shell${canEditTimer ? ' timer-widget__clock-shell--editable' : ''}`}>
          {canEditTimer && !editingTimer ? (
            <button
              type="button"
              className="timer-widget__edit-button"
              onClick={openTimerEditor}
              aria-label="Edit current timer"
              title="Edit current timer"
            >
              <EditIcon />
            </button>
          ) : null}

          {editingTimer ? (
            <DurationEditor
              draft={timerDraft}
              onChange={(part, value) => setTimerDraft((current) => updateDurationDraft(current, part, value))}
              onSubmit={saveTimerEditor}
              onCancel={() => setEditingTimer(false)}
              submitLabel="Set timer"
            />
          ) : (
            <div
              className="timer-widget__clock"
              onDoubleClick={canEditTimer ? openTimerEditor : undefined}
              onKeyDown={
                canEditTimer
                  ? (event) => {
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault()
                        openTimerEditor()
                      }
                    }
                  : undefined
              }
              role={canEditTimer ? 'button' : undefined}
              tabIndex={canEditTimer ? 0 : undefined}
              title={canEditTimer ? 'Double-click to edit the current timer' : undefined}
            >
              {formatDurationClock(timerSeconds)}
            </div>
          )}
        </div>

        <div className="timer-widget__rules">
          {rules.map((rule) => {
            const isEditingRule = Boolean(rule.key) && editingRuleKey === rule.key
            const toneClass =
              isRemadeAppOverlay && rule.markerTone ? ` timer-widget__rule--tone-${rule.markerTone}` : ''

            return (
            <div
              key={rule.key ?? rule.label}
              className={`timer-widget__rule${rule.key ? ' timer-widget__rule--editable' : ''}${toneClass}`}
            >
              <span className="timer-widget__rule-copy">
                {isRemadeAppOverlay && rule.markerShape ? (
                  <span
                    className={`timer-widget__rule-marker timer-widget__rule-marker--${rule.markerShape}${rule.markerTone ? ` timer-widget__rule-marker--${rule.markerTone}` : ''}`}
                    aria-hidden="true"
                  />
                ) : null}
                <span>{rule.label}</span>
              </span>
              {isEditingRule ? (
                <form
                  className="timer-widget__rule-form"
                  onSubmit={(event) => {
                    event.preventDefault()
                    saveRuleEditor()
                  }}
                >
                  <input
                    className="timer-widget__rule-input"
                    inputMode="numeric"
                    value={ruleDraft}
                    onChange={(event) => setRuleDraft(event.target.value.replace(/\D/g, '').slice(0, 5))}
                    aria-label={`Set ${rule.label} seconds`}
                  />
                  <span className="timer-widget__rule-suffix">s</span>
                  <button type="submit" className="btn btn--ghost">
                    Save
                  </button>
                  <button type="button" className="btn btn--ghost" onClick={() => setEditingRuleKey(null)}>
                    Cancel
                  </button>
                </form>
              ) : (
                <div className="timer-widget__rule-display">
                  <strong
                    onDoubleClick={rule.key && canEditRules ? () => openRuleEditor(rule) : undefined}
                    title={rule.key && canEditRules ? `Double-click to edit ${rule.label}` : undefined}
                  >
                    {rule.value}
                  </strong>
                  {rule.key && canEditRules ? (
                    <button
                      type="button"
                      className="timer-widget__edit-button timer-widget__edit-button--rule"
                      onClick={() => openRuleEditor(rule)}
                      aria-label={`Edit ${rule.label}`}
                      title={`Edit ${rule.label}`}
                    >
                      <EditIcon />
                    </button>
                  ) : null}
                </div>
              )}
            </div>
          )})}
        </div>

        {showTrend ? (
          <div className="timer-widget__chart">
            <TrendChart points={trendPoints} showArea={isRemadeAppOverlay} showGraphIcon={surface === 'overlay'} />
          </div>
        ) : null}
      </div>
    </section>
  )
}
