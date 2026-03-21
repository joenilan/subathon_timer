import { useEffect, useState } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { importLegacyConfig } from '../lib/config/legacyConfig'
import {
  TIMER_COMMAND_PERMISSION_DEFINITIONS,
  TIMER_COMMAND_PERMISSION_OPTIONS,
} from '../lib/twitch/timerCommandPermissions'
import { useAppStore } from '../state/useAppStore'
import { selectSettingsPageState } from '../state/selectors'

function formatDurationDraft(totalSeconds: number) {
  const safeTotal = Math.max(0, Math.floor(totalSeconds))
  const hours = Math.floor(safeTotal / 3600)
  const minutes = Math.floor((safeTotal % 3600) / 60)
  const seconds = safeTotal % 60

  return {
    hours: String(hours),
    minutes: String(minutes).padStart(2, '0'),
    seconds: String(seconds).padStart(2, '0'),
  }
}

function clampDurationPart(value: string, maxLength: number) {
  return value.replace(/\D/g, '').slice(0, maxLength)
}

function parseDurationDraft(draft: { hours: string; minutes: string; seconds: string }) {
  const hours = Math.max(0, Number.parseInt(draft.hours || '0', 10) || 0)
  const minutes = Math.min(59, Math.max(0, Number.parseInt(draft.minutes || '0', 10) || 0))
  const seconds = Math.min(59, Math.max(0, Number.parseInt(draft.seconds || '0', 10) || 0))
  return hours * 3600 + minutes * 60 + seconds
}

export function SettingsPage() {
  const {
    timerWidgetTheme,
    setTimerWidgetTheme,
    defaultTimerSeconds,
    setDefaultTimerSeconds,
    commandPermissions,
    setCommandPermission,
    applyImportedLegacyConfig,
  } = useAppStore(useShallow(selectSettingsPageState))

  const [importText, setImportText] = useState('')
  const [importMessage, setImportMessage] = useState<string | null>(null)
  const [timerDefaultDraft, setTimerDefaultDraft] = useState(() => formatDurationDraft(defaultTimerSeconds))

  useEffect(() => {
    setTimerDefaultDraft(formatDurationDraft(defaultTimerSeconds))
  }, [defaultTimerSeconds])

  const handleTimerDefaultChange = (part: 'hours' | 'minutes' | 'seconds', value: string) => {
    setTimerDefaultDraft((current) => ({
      ...current,
      [part]: clampDurationPart(value, part === 'hours' ? 3 : 2),
    }))
  }

  const handleApplyTimerDefault = () => {
    const nextSeconds = parseDurationDraft(timerDefaultDraft)
    setDefaultTimerSeconds(nextSeconds)
    setTimerDefaultDraft(formatDurationDraft(nextSeconds))
  }

  const handleImport = () => {
    try {
      const imported = importLegacyConfig(importText)
      applyImportedLegacyConfig(imported)
      setImportMessage('Legacy config imported successfully.')
    } catch (error) {
      setImportMessage(error instanceof Error ? error.message : 'Unable to import this config.')
    }
  }

  const handleClearImport = () => {
    setImportText('')
    setImportMessage(null)
  }

  return (
    <div className="page-container settings-page">
      <section className="page-header rules-header">
        <div>
          <h1 className="page-title">Settings</h1>
          <p className="page-desc">Only app-level controls live here. Everything else is edited where it happens and saves automatically.</p>
        </div>
      </section>

      <section className="panel settings-panel settings-panel--appearance">
        <div className="panel-header">
          <div>
            <h2 className="panel-title">Appearance</h2>
            <p className="panel-copy">Choose the timer look used on the dashboard and in the OBS timer overlay.</p>
          </div>
        </div>

        <div className="rules-grid">
          <label className="rule-field">
            <span className="rule-field__label">Timer theme</span>
            <select
              className="rule-field__input"
              value={timerWidgetTheme}
              onChange={(event) => setTimerWidgetTheme(event.target.value as 'original' | 'app')}
            >
              <option value="app">App (Default)</option>
              <option value="original">Original</option>
            </select>
            <span className="rule-field__hint">Applies to the dashboard timer and the timer overlay.</span>
          </label>

          <div className="rule-field">
            <span className="rule-field__label">Default timer start</span>
            <div className="settings-duration-fields">
              <label className="timer-widget__editor-field">
                <span>HH</span>
                <input
                  className="timer-widget__editor-input"
                  inputMode="numeric"
                  value={timerDefaultDraft.hours}
                  onChange={(event) => handleTimerDefaultChange('hours', event.target.value)}
                />
              </label>
              <label className="timer-widget__editor-field">
                <span>MM</span>
                <input
                  className="timer-widget__editor-input"
                  inputMode="numeric"
                  value={timerDefaultDraft.minutes}
                  onChange={(event) => handleTimerDefaultChange('minutes', event.target.value)}
                />
              </label>
              <label className="timer-widget__editor-field">
                <span>SS</span>
                <input
                  className="timer-widget__editor-input"
                  inputMode="numeric"
                  value={timerDefaultDraft.seconds}
                  onChange={(event) => handleTimerDefaultChange('seconds', event.target.value)}
                />
              </label>
            </div>
            <div className="wheel-config-actions settings-duration-actions">
              <button className="btn btn--primary" onClick={handleApplyTimerDefault}>Save Default</button>
            </div>
            <span className="rule-field__hint">Reset uses this time. Editing the live timer on the dashboard no longer changes it.</span>
          </div>
        </div>
      </section>

      <section className="panel settings-panel settings-panel--commands">
        <div className="panel-header">
          <div>
            <h2 className="panel-title">Chat command permissions</h2>
            <p className="panel-copy">Choose whether each `!timer` command is usable by the streamer, mods, or both.</p>
          </div>
        </div>

        <div className="settings-migration-summary">
          <div className="settings-mini-note">
            <strong>Safe default</strong>
            <span>Day-to-day commands stay open to streamer + mods</span>
          </div>
          <div className="settings-mini-note">
            <strong>Lock down</strong>
            <span>`!timer set` and `!timer reset` start as streamer only</span>
          </div>
          <div className="settings-mini-note">
            <strong>Applies live</strong>
            <span>New EventSub chat commands use these permissions immediately</span>
          </div>
        </div>

        <div className="rules-grid">
          {TIMER_COMMAND_PERMISSION_DEFINITIONS.map((definition) => (
            <label key={definition.action} className="rule-field">
              <span className="rule-field__label">{definition.commandLabel}</span>
              <select
                className="rule-field__input"
                value={commandPermissions[definition.action]}
                onChange={(event) =>
                  setCommandPermission(
                    definition.action,
                    event.target.value as 'streamer' | 'mod' | 'both',
                  )
                }
              >
                {TIMER_COMMAND_PERMISSION_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
              <span className="rule-field__hint">{definition.description}</span>
            </label>
          ))}
        </div>
      </section>

      <section className="panel settings-panel settings-panel--migration">
        <div className="panel-header">
          <div>
            <h2 className="panel-title">Import legacy config.json</h2>
            <p className="panel-copy">Paste an older config here to bring over the parts that still matter: timing rules and wheel setup.</p>
          </div>
        </div>

        <div className="settings-migration-summary">
          <div className="settings-mini-note">
            <strong>Imports</strong>
            <span>Rules and wheel entries</span>
          </div>
          <div className="settings-mini-note">
            <strong>Skips</strong>
            <span>Channel, admins, blacklist, and provider fields</span>
          </div>
          <div className="settings-mini-note">
            <strong>Next step</strong>
            <span>Finish any edits on Rules, Wheel, Dashboard, and Overlays</span>
          </div>
        </div>

        <div className="wheel-config-panel settings-import-card">
          <label className="rule-field">
            <span className="rule-field__label">Legacy config payload</span>
            <textarea
              className="wheel-config-textarea settings-json-textarea"
              value={importText}
              onChange={(event) => setImportText(event.target.value)}
              placeholder={'{\n  "time": {\n    "base_value": 60\n  },\n  ...\n}'}
            />
            <span className="rule-field__hint">Imports timer rules and wheel segments from the old config shape.</span>
          </label>
          <div className="wheel-config-actions">
            <button className="btn btn--primary" onClick={handleImport} disabled={!importText.trim()}>Import Legacy Config</button>
            <button className="btn btn--ghost" onClick={handleClearImport} disabled={!importText && !importMessage}>Clear</button>
          </div>
          {importMessage ? <div className="settings-inline-message">{importMessage}</div> : null}
        </div>
      </section>
    </div>
  )
}
