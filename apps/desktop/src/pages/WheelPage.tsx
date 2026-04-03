import { useEffect, useMemo, useState } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { WheelDisplay } from '../components/WheelDisplay'
import type { WheelSegment } from '../lib/wheel/types'
import { useAppStore } from '../state/useAppStore'
import { useTwitchSessionStore } from '../state/useTwitchSessionStore'
import { selectWheelPageState } from '../state/selectors'

const WHEEL_TEXT_SCALE_MIN = 0.35
const WHEEL_TEXT_SCALE_MAX = 0.75

function normalizeChanceInput(value: string) {
  if (value.trim().endsWith('%')) {
    return value.trim()
  }

  const parsed = Number.parseFloat(value)
  if (Number.isNaN(parsed)) {
    return value
  }

  if (parsed <= 1) {
    return `${Math.round(parsed * 100)}%`
  }

  return `${Math.round(parsed)}%`
}

function toWheelTextScaleUiValue(scale: number) {
  const normalized = (scale - WHEEL_TEXT_SCALE_MIN) / (WHEEL_TEXT_SCALE_MAX - WHEEL_TEXT_SCALE_MIN)
  return Math.round(Math.min(1, Math.max(0, normalized)) * 100)
}

function fromWheelTextScaleUiValue(uiValue: number) {
  const normalized = Math.min(100, Math.max(0, uiValue)) / 100
  return WHEEL_TEXT_SCALE_MIN + normalized * (WHEEL_TEXT_SCALE_MAX - WHEEL_TEXT_SCALE_MIN)
}

export function WheelPage() {
  const {
    wheelSegments,
    wheelSpin,
    wheelTextScale,
    spinWheel,
    applyWheelResult,
    addWheelSegment,
    updateWheelSegment,
    removeWheelSegment,
    setWheelTextScale,
  } = useAppStore(useShallow(selectWheelPageState))
  const twitchSession = useTwitchSessionStore((state) => state.session)
  const [selectedId, setSelectedId] = useState<string | null>(wheelSegments[0]?.id ?? null)

  useEffect(() => {
    if (!selectedId || !wheelSegments.some((segment) => segment.id === selectedId)) {
      setSelectedId(wheelSegments[0]?.id ?? null)
    }
  }, [selectedId, wheelSegments])

  const selectedSegment = useMemo(
    () => wheelSegments.find((segment) => segment.id === selectedId) ?? wheelSegments[0] ?? null,
    [selectedId, wheelSegments],
  )
  const activeResultSegment = useMemo(
    () => wheelSegments.find((segment) => segment.id === wheelSpin.activeSegmentId) ?? null,
    [wheelSegments, wheelSpin.activeSegmentId],
  )
  const missingModerationScopes = useMemo(() => {
    if (wheelSpin.status !== 'ready' || activeResultSegment?.outcomeType !== 'timeout') {
      return []
    }

    const missing = new Set<string>()
    if (!twitchSession?.scopes.includes('moderator:manage:banned_users')) {
      missing.add('moderator:manage:banned_users')
    }

    if (
      activeResultSegment.timeoutTarget === 'random' &&
      !twitchSession?.scopes.includes('moderator:read:chatters')
    ) {
      missing.add('moderator:read:chatters')
    }

    return [...missing]
  }, [activeResultSegment, twitchSession, wheelSpin.status])

  const spinStatusLabel =
    wheelSpin.status === 'ready'
      ? 'Result ready'
      : wheelSpin.status === 'spinning'
        ? 'Selecting…'
        : 'Idle'

  const resultLabel =
    wheelSpin.status === 'idle'
      ? 'Spin to get a result'
      : wheelSpin.status === 'spinning'
        ? 'Selecting outcome…'
        : (wheelSpin.resultTitle ?? 'Outcome ready')
  const wheelTextScaleUiValue = toWheelTextScaleUiValue(wheelTextScale)

  return (
    <div className="page-container wheel-page">

      {/* ── Stage: wheel LEFT, info RIGHT ── */}
      <div className="wheel-main-layout">

        {/* Left column: wheel + action buttons */}
        <div className="wheel-left-col">
          <WheelDisplay segments={wheelSegments} spin={wheelSpin} textScale={wheelTextScale} />

          <div className="wheel-stage-toolbar">
            <label className="wheel-scale-control" htmlFor="wheel-text-scale">
              <span className="wheel-scale-control__label">Text scale</span>
              <input
                id="wheel-text-scale"
                type="range"
                min={0}
                max={100}
                step={1}
                value={wheelTextScaleUiValue}
                onChange={(event) => setWheelTextScale(fromWheelTextScaleUiValue(Number(event.target.value)))}
              />
            </label>
            <strong className="wheel-scale-value">{wheelTextScaleUiValue}%</strong>
          </div>

          <div className="wheel-cta-row">
            <button
              id="btn-spin-wheel"
              className="btn btn--primary wheel-cta-btn"
              onClick={spinWheel}
              disabled={wheelSpin.status === 'spinning'}
            >
              {wheelSpin.status === 'spinning' ? 'Spinning…' : 'Spin Wheel'}
            </button>
            <button
              id="btn-apply-result"
              className="btn wheel-cta-btn"
              onClick={() => void applyWheelResult()}
              disabled={wheelSpin.status !== 'ready'}
            >
              Apply Result
            </button>
          </div>
        </div>

        {/* Right column: result info + segment editor */}
        <div className="wheel-right-col">

          {/* Result card */}
          <div className="panel wheel-result-panel">
            <div className="wheel-result-panel__header">
              <div>
                <span className="wheel-result-panel__eyebrow">Outcome</span>
                <strong className="wheel-result-panel__title">{resultLabel}</strong>
              </div>
              <span className={`status-chip status-chip--${
                wheelSpin.status === 'spinning' ? 'pending'
                  : wheelSpin.status === 'ready' ? 'connected'
                  : 'idle'
              }`}>{spinStatusLabel}</span>
            </div>

            {wheelSpin.status === 'ready' && wheelSpin.resultSummary && (
              <p className="panel-copy">{wheelSpin.resultSummary}</p>
            )}

            {wheelSpin.status === 'idle' && (
              <p className="panel-copy">Spin first, then review before applying.</p>
            )}

            {wheelSpin.requiresModeration && wheelSpin.status === 'ready' && missingModerationScopes.length > 0 && (
              <p className="wheel-result-warning">
                ⚠ Reconnect Twitch before applying this timeout outcome. Missing {missingModerationScopes.join(', ')}.
              </p>
            )}

            {/* Step tracker */}
            <div className="wheel-steps">
              {(['Spin', 'Reveal', 'Apply'] as const).map((label, i) => {
                const stepNum = i + 1
                const isActive =
                  (stepNum === 1 && wheelSpin.status === 'idle') ||
                  (stepNum === 2 && wheelSpin.status === 'spinning') ||
                  (stepNum === 3 && wheelSpin.status === 'ready')
                const isComplete =
                  (stepNum === 1 && wheelSpin.status !== 'idle') ||
                  (stepNum === 2 && wheelSpin.status === 'ready')
                return (
                  <div
                    key={label}
                    className={`wheel-step${isActive ? ' active' : ''}${isComplete ? ' complete' : ''}`}
                  >
                    <span className="wheel-step__num">{stepNum}</span>
                    <span className="wheel-step__label">{label}</span>
                  </div>
                )
              })}
            </div>
          </div>

          {/* Segment editor */}
          <div className="panel wheel-editor-panel">
            <div className="wheel-editor-header">
              <div>
                <h2 className="panel-title">Segments</h2>
              </div>
              <div className="wheel-page-actions">
                <button className="btn" onClick={() => setSelectedId(addWheelSegment('time'))}>+ Time</button>
                <button className="btn" onClick={() => setSelectedId(addWheelSegment('timeout'))}>+ Timeout</button>
                <button className="btn" onClick={() => setSelectedId(addWheelSegment('custom'))}>+ Custom</button>
              </div>
            </div>

            <div className="wheel-editor-body">
              {/* Segment list */}
              <div className="wheel-segment-list">
                {wheelSegments.map((segment) => (
                  <button
                    type="button"
                    className={`wheel-seg-chip${selectedSegment?.id === segment.id ? ' selected' : ''}`}
                    key={segment.id}
                    onClick={() => setSelectedId(segment.id)}
                  >
                    <span className="wheel-seg-chip__swatch" style={{ backgroundColor: segment.color ?? '#888' }} />
                    <span className="wheel-seg-chip__label">{segment.label}</span>
                    <span className="wheel-seg-chip__chance">{segment.chance}</span>
                    <span className="wheel-seg-chip__type">{segment.outcomeType}</span>
                  </button>
                ))}
              </div>

              {/* Config panel */}
              {selectedSegment ? (
                <div className="wheel-config-panel">
                  <div className="wheel-config-grid">
                    <label className="rule-field rule-field--inline">
                      <span className="rule-field__label">Label</span>
                      <input
                        id="wheel-seg-label"
                        className="rule-field__input"
                        value={selectedSegment.label}
                        onChange={(event) => updateWheelSegment(selectedSegment.id, { label: event.target.value })}
                      />
                    </label>

                    <label className="rule-field rule-field--inline">
                      <span className="rule-field__label">Type</span>
                      <select
                        id="wheel-seg-type"
                        className="rule-field__input"
                        value={selectedSegment.outcomeType}
                        onChange={(event) =>
                          updateWheelSegment(selectedSegment.id, {
                            outcomeType: event.target.value as WheelSegment['outcomeType'],
                          })
                        }
                      >
                        <option value="time">time</option>
                        <option value="timeout">timeout</option>
                        <option value="custom">custom</option>
                      </select>
                    </label>

                    <label className="rule-field rule-field--inline">
                      <span className="rule-field__label">Chance</span>
                      <input
                        id="wheel-seg-chance"
                        className="rule-field__input"
                        value={selectedSegment.chance}
                        onChange={(event) => updateWheelSegment(selectedSegment.id, { chance: event.target.value })}
                        onBlur={(event) =>
                          updateWheelSegment(selectedSegment.id, { chance: normalizeChanceInput(event.target.value) })
                        }
                      />
                    </label>

                    <label className="rule-field rule-field--color">
                      <span className="rule-field__label">Color</span>
                      <span className="rule-field__color-wrap">
                        <input
                          id="wheel-seg-color"
                          type="color"
                          className="rule-field__color-input"
                          value={selectedSegment.color ?? '#7c3aed'}
                          onChange={(event) => updateWheelSegment(selectedSegment.id, { color: event.target.value })}
                        />
                        <span className="rule-field__color-hex">{selectedSegment.color ?? '#7c3aed'}</span>
                      </span>
                    </label>

                    <label className="rule-field rule-field--inline">
                      <span className="rule-field__label">Min Subs</span>
                      <input
                        id="wheel-seg-minsubs"
                        className="rule-field__input"
                        type="number"
                        min={1}
                        value={selectedSegment.minSubs ?? 1}
                        onChange={(event) =>
                          updateWheelSegment(selectedSegment.id, { minSubs: Number(event.target.value) || 1 })
                        }
                      />
                    </label>

                    {selectedSegment.outcomeType === 'time' ? (
                      <label className="rule-field rule-field--inline">
                        <span className="rule-field__label">Seconds</span>
                        <input
                          id="wheel-seg-seconds"
                          className="rule-field__input"
                          type="number"
                          value={selectedSegment.timeDeltaSeconds ?? 0}
                          onChange={(event) =>
                            updateWheelSegment(selectedSegment.id, { timeDeltaSeconds: Number(event.target.value) || 0 })
                          }
                        />
                      </label>
                    ) : null}

                    {selectedSegment.outcomeType === 'timeout' ? (
                      <>
                        <label className="rule-field rule-field--inline">
                          <span className="rule-field__label">Target</span>
                          <select
                            id="wheel-seg-target"
                            className="rule-field__input"
                            value={selectedSegment.timeoutTarget ?? 'self'}
                            onChange={(event) =>
                              updateWheelSegment(selectedSegment.id, {
                                timeoutTarget: event.target.value as 'self' | 'random',
                              })
                            }
                          >
                            <option value="self">sender</option>
                            <option value="random">random</option>
                          </select>
                        </label>
                        <label className="rule-field rule-field--inline">
                          <span className="rule-field__label">TO seconds</span>
                          <input
                            id="wheel-seg-toseconds"
                            className="rule-field__input"
                            type="number"
                            min={1}
                            value={selectedSegment.timeoutSeconds ?? 300}
                            onChange={(event) =>
                              updateWheelSegment(selectedSegment.id, { timeoutSeconds: Number(event.target.value) || 300 })
                            }
                          />
                        </label>
                      </>
                    ) : null}
                  </div>

                  <label className="rule-field">
                    <span className="rule-field__label">Description</span>
                    <textarea
                      id="wheel-seg-desc"
                      className="wheel-config-textarea"
                      value={selectedSegment.outcome}
                      onChange={(event) => updateWheelSegment(selectedSegment.id, { outcome: event.target.value })}
                    />
                  </label>

                  <div className="wheel-config-actions">
                    <button
                      id="btn-remove-segment"
                      className="btn btn--ghost btn--danger"
                      onClick={() => {
                        if (window.confirm(`Remove "${selectedSegment.label}"?`)) {
                          removeWheelSegment(selectedSegment.id)
                        }
                      }}
                    >
                      Remove
                    </button>
                  </div>
                </div>
              ) : (
                <div className="wheel-config-empty">
                  <p>Select a segment or add one to edit it.</p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
