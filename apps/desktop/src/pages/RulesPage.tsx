import { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useShallow } from 'zustand/react/shallow'
import { timerEventRuleDefinitions, timerTierRuleDefinitions } from '../lib/timer/ruleDefinitions'
import type { TipProviderStatus } from '../lib/tips/types'
import { useAppStore } from '../state/useAppStore'
import { useTipSessionStore } from '../state/useTipSessionStore'
import { selectRulesTipState } from '../state/selectors'

function buildTipRuleOverlay(
  streamElementsStatus: TipProviderStatus,
  streamlabsStatus: TipProviderStatus,
) {
  const notConnectedProviders: string[] = []
  const connectingProviders: string[] = []

  if (streamElementsStatus === 'connecting') {
    connectingProviders.push('StreamElements')
  } else if (streamElementsStatus !== 'connected') {
    notConnectedProviders.push('StreamElements')
  }

  if (streamlabsStatus === 'connecting') {
    connectingProviders.push('Streamlabs')
  } else if (streamlabsStatus !== 'connected') {
    notConnectedProviders.push('Streamlabs')
  }

  if (notConnectedProviders.length === 0 && connectingProviders.length === 0) {
    return null
  }

  const waitingLabel = [...connectingProviders, ...notConnectedProviders].join(' and ')

  if (notConnectedProviders.length === 0) {
    return {
      title: `${waitingLabel} still connecting`,
      detail: 'Tips will start adding time once the live connection finishes.',
    }
  }

  if (connectingProviders.length === 0) {
    return {
      title: `${waitingLabel} not connected`,
      detail: 'Tips from that provider will not add time until you connect it on the Connections page.',
    }
  }

  return {
    title: `${notConnectedProviders.join(' and ')} not connected`,
    detail: `${connectingProviders.join(' and ')} is still connecting. Tips only count from providers that are fully connected.`,
  }
}

export function RulesPage() {
  const navigate = useNavigate()
  const ruleConfig = useAppStore((state) => state.ruleConfig)
  const setRuleValue = useAppStore((state) => state.setRuleValue)
  const { streamElementsStatus, streamlabsStatus } = useTipSessionStore(useShallow(selectRulesTipState))
  const advancedSubOverridesEnabled = ruleConfig.advancedSubEventOverridesEnabled
  const tipRuleOverlay = useMemo(
    () =>
      ruleConfig.tipEnabled
        ? buildTipRuleOverlay(streamElementsStatus, streamlabsStatus)
        : null,
    [ruleConfig.tipEnabled, streamElementsStatus, streamlabsStatus],
  )

  return (
    <div className="page-container rules-page">
      <section className="page-header rules-header">
        <div>
          <h1 className="page-title">Rules</h1>
          <p className="page-desc">
            These rules drive the live timer, overlays, Twitch EventSub handling, and connected tip providers. Changes save immediately.
          </p>
        </div>
      </section>

      <section className="panel">
        <div className="panel-header">
          <div>
            <h2 className="panel-title">Shared subscription values</h2>
            <p className="panel-copy">These tier values are the default for new subscriptions, resubscriptions, single gifted subs, and gift bombs. Turn on advanced overrides only when one sub event needs its own tier values.</p>
          </div>
        </div>

        <div className="rules-grid">
          {timerTierRuleDefinitions.map((field) => (
            <label key={field.key} className="rule-field">
              <span className="rule-field__label">{field.label}</span>
              <input
                className="rule-field__input"
                type="number"
                min={0}
                step={1}
                value={ruleConfig[field.key]}
                onChange={(event) => setRuleValue(field.key, Number(event.target.value) || 0)}
              />
              <span className="rule-field__hint">{field.hint}</span>
            </label>
          ))}
        </div>

        <div className="rule-advanced-bar">
          <div className="rule-advanced-bar__copy">
            <strong>Advanced sub overrides</strong>
            <p>Keep this off to reuse the shared T1 / T2 / T3 values everywhere. Turn it on to optionally override new subs, resubs, gifted subs, or gift bombs with their own tier values.</p>
          </div>

          <label className={`rule-toggle${advancedSubOverridesEnabled ? ' rule-toggle--enabled' : ''}`}>
            <input
              type="checkbox"
              checked={advancedSubOverridesEnabled}
              onChange={(event) => setRuleValue('advancedSubEventOverridesEnabled', event.target.checked)}
              aria-label="Toggle advanced sub overrides"
            />
            <span className="rule-toggle__track" aria-hidden="true">
              <span className="rule-toggle__thumb" />
            </span>
            <span className="rule-toggle__label">{advancedSubOverridesEnabled ? 'On' : 'Off'}</span>
          </label>
        </div>
      </section>

      <section className="panel">
        <div className="panel-header">
          <div>
            <h2 className="panel-title">Live event rules</h2>
            <p className="panel-copy">Toggle any Twitch event on or off. Enabled events affect the timer immediately; disabled events still keep their values so you can prep them before going live.</p>
          </div>
        </div>

        <div className="rule-event-list">
          {timerEventRuleDefinitions.map((eventRule) => {
            const enabled = ruleConfig[eventRule.key]
            const usesCustomValues = eventRule.customToggleKey ? ruleConfig[eventRule.customToggleKey] : false
            const showCustomToggle = advancedSubOverridesEnabled && Boolean(eventRule.customToggleKey)
            const showControls = Boolean(
              eventRule.controls?.length && (!eventRule.customToggleKey || (advancedSubOverridesEnabled && usesCustomValues)),
            )
            const showTipOverlay = eventRule.key === 'tipEnabled' && enabled && tipRuleOverlay

            return (
              <article
                key={eventRule.key}
                className={`rule-event-card${enabled ? ' rule-event-card--enabled' : ''}${showTipOverlay ? ' rule-event-card--warning' : ''}`}
              >
                <div className="rule-event-card__header">
                  <div className="rule-event-card__copy">
                    <h3 className="rule-event-card__title">{eventRule.label}</h3>
                    <p className="rule-event-card__hint">{eventRule.hint}</p>
                  </div>

                  <label className={`rule-toggle${enabled ? ' rule-toggle--enabled' : ''}`}>
                    <input
                      type="checkbox"
                      checked={enabled}
                      onChange={(event) => setRuleValue(eventRule.key, event.target.checked)}
                      aria-label={`Toggle ${eventRule.label}`}
                    />
                    <span className="rule-toggle__track" aria-hidden="true">
                      <span className="rule-toggle__thumb" />
                    </span>
                    <span className="rule-toggle__label">{enabled ? 'On' : 'Off'}</span>
                  </label>
                </div>

                {(eventRule.sharedValueNote || showCustomToggle || showControls) && (
                  <div className={`rule-event-card__body${showTipOverlay ? ' rule-event-card__body--overlay' : ''}`}>
                    <div className={showTipOverlay ? 'rule-event-card__content rule-event-card__content--obscured' : 'rule-event-card__content'}>
                      {eventRule.sharedValueNote || showCustomToggle ? (
                        <div className="rule-event-card__meta-row">
                          {eventRule.sharedValueNote ? (
                            <div className="rule-event-card__meta">
                              {showCustomToggle && usesCustomValues ? 'Custom tier overrides are active for this event.' : eventRule.sharedValueNote}
                            </div>
                          ) : (
                            <span />
                          )}

                          {showCustomToggle && eventRule.customToggleKey && eventRule.customToggleLabel ? (
                            <label className={`rule-toggle rule-toggle--compact${usesCustomValues ? ' rule-toggle--enabled' : ''}`}>
                              <input
                                type="checkbox"
                                checked={usesCustomValues}
                                onChange={(event) => setRuleValue(eventRule.customToggleKey!, event.target.checked)}
                                aria-label={`Toggle ${eventRule.customToggleLabel.toLowerCase()} for ${eventRule.label}`}
                              />
                              <span className="rule-toggle__track" aria-hidden="true">
                                <span className="rule-toggle__thumb" />
                              </span>
                              <span className="rule-toggle__label">{eventRule.customToggleLabel}</span>
                            </label>
                          ) : null}
                        </div>
                      ) : null}

                      {showControls && eventRule.controls ? (
                        <div className="rule-event-card__controls">
                          {eventRule.controls.map((control) => (
                            <label key={control.key} className="rule-field rule-field--compact">
                              <span className="rule-field__label">{control.label}</span>
                              <div className="rule-inline-input">
                                <input
                                  className="rule-field__input"
                                  type="number"
                                  min={control.min ?? 0}
                                  step={control.step ?? 1}
                                  value={ruleConfig[control.key]}
                                  onChange={(event) => setRuleValue(control.key, Number(event.target.value) || 0)}
                                />
                                {control.suffix ? <span className="rule-inline-input__suffix">{control.suffix}</span> : null}
                              </div>
                            </label>
                          ))}
                        </div>
                      ) : null}
                    </div>

                    {showTipOverlay ? (
                      <div className="rule-event-card__overlay" role="presentation">
                        <div className="rule-event-card__overlay-panel">
                          <strong>{tipRuleOverlay.title}</strong>
                          <p>{tipRuleOverlay.detail}</p>
                          <button className="btn btn--primary" onClick={() => navigate('/connections')}>
                            Open Connections
                          </button>
                        </div>
                      </div>
                    ) : null}
                  </div>
                )}
              </article>
            )
          })}
        </div>
      </section>
    </div>
  )
}
