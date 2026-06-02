import { useState } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { getDefaultGoalLadderConfig } from '../lib/goals/engine'
import type {
  CreateGoalLadderInput,
  GoalSourceMode,
  GoalSourceType,
  SubathonGoalLadder,
  SubathonGoalLadderConfig,
  SubathonGoalMilestone,
} from '../lib/goals/types'
import { useGoalsStore } from '../state/useGoalsStore'
import { selectGoalsPageState } from '../state/selectors'

type MilestoneDraft = {
  id: string
  thresholdAmount: string
  rewardTitle: string
  rewardDescription: string
  milestoneSourceType: GoalSourceType
}

type LadderDraft = {
  editingId: string | null
  title: string
  description: string
  sourceMode: GoalSourceMode
  sourceType: GoalSourceType
  unitLabel: string
  milestones: MilestoneDraft[]
  subscriptionUnitValue: string
  bitsAmountUnit: string
  bitsUnitValue: string
  tipAmountUnit: string
  tipUnitValue: string
}

type SourceOption = {
  sourceMode: GoalSourceMode
  sourceType: GoalSourceType
  label: string
  unitLabel: string
  description: string
  defaultMilestones: Array<{ thresholdAmount: string; rewardTitle: string; milestoneSourceType?: GoalSourceType }>
}

const sourceOptions: SourceOption[] = [
  {
    sourceMode: 'single-source',
    sourceType: 'bits',
    label: 'Bits ladder',
    unitLabel: 'bits',
    description: 'Unlock rewards from Twitch cheers, using the raw bit amount.',
    defaultMilestones: [
      { thresholdAmount: '500', rewardTitle: 'Play a sound alert' },
      { thresholdAmount: '1000', rewardTitle: 'Spin the wheel' },
      { thresholdAmount: '5000', rewardTitle: 'Add a wheel segment' },
      { thresholdAmount: '10000', rewardTitle: 'Chat picks next game' },
    ],
  },
  {
    sourceMode: 'single-source',
    sourceType: 'subscriptions',
    label: 'Subscription ladder',
    unitLabel: 'subs',
    description: 'Unlock rewards from new subs, resubs, gifted subs, and gift bombs.',
    defaultMilestones: [
      { thresholdAmount: '5', rewardTitle: 'Chat picks a challenge' },
      { thresholdAmount: '10', rewardTitle: 'Bonus wheel spin' },
      { thresholdAmount: '25', rewardTitle: 'Chat picks next game' },
      { thresholdAmount: '50', rewardTitle: 'Unlock a bonus stream segment' },
    ],
  },
  {
    sourceMode: 'single-source',
    sourceType: 'tips',
    label: 'Tips ladder',
    unitLabel: 'USD',
    description: 'Unlock rewards from connected Streamlabs and StreamElements tips.',
    defaultMilestones: [
      { thresholdAmount: '5', rewardTitle: 'Shoutout in chat' },
      { thresholdAmount: '10', rewardTitle: 'Pick a challenge card' },
      { thresholdAmount: '25', rewardTitle: 'Chat picks next game' },
      { thresholdAmount: '50', rewardTitle: "Streamer's choice reward" },
    ],
  },
  {
    sourceMode: 'single-source',
    sourceType: 'channel-points',
    label: 'Channel Points ladder',
    unitLabel: 'redemptions',
    description: 'Unlock rewards from Twitch channel point redemptions.',
    defaultMilestones: [
      { thresholdAmount: '10', rewardTitle: 'Play a sound alert' },
      { thresholdAmount: '25', rewardTitle: 'Chat picks a challenge' },
      { thresholdAmount: '50', rewardTitle: 'Chat picks next game' },
      { thresholdAmount: '100', rewardTitle: 'Unlock a bonus stream segment' },
    ],
  },
  {
    sourceMode: 'single-source',
    sourceType: 'charity',
    label: 'Fundraiser / Charity',
    unitLabel: 'USD',
    description: 'Track a charity fundraiser manually. Progress is entered by hand — no automatic events.',
    defaultMilestones: [
      { thresholdAmount: '50', rewardTitle: 'Shoutout to all donors' },
      { thresholdAmount: '100', rewardTitle: 'Chat picks a challenge' },
      { thresholdAmount: '250', rewardTitle: 'Streamer does a dare' },
      { thresholdAmount: '500', rewardTitle: 'Unlock a bonus charity stream' },
    ],
  },
  {
    sourceMode: 'custom',
    sourceType: 'mixed-support',
    label: 'Custom goals',
    unitLabel: 'points',
    description: 'Mix any sources in one list. Each milestone tracks its own source independently.',
    defaultMilestones: [
      { thresholdAmount: '500', rewardTitle: 'Play a sound alert', milestoneSourceType: 'bits' },
      { thresholdAmount: '5', rewardTitle: 'Chat picks a challenge', milestoneSourceType: 'subscriptions' },
      { thresholdAmount: '25', rewardTitle: 'Unlock a stream challenge', milestoneSourceType: 'tips' },
    ],
  },
]

function makeDraftMilestones(milestones: Array<{ thresholdAmount: string; rewardTitle: string; milestoneSourceType?: GoalSourceType }>) {
  return milestones.map((m, i) => ({
    id: `draft-${i}`,
    thresholdAmount: m.thresholdAmount,
    rewardTitle: m.rewardTitle,
    rewardDescription: '',
    milestoneSourceType: m.milestoneSourceType ?? 'bits',
  }))
}

const defaultDraft: LadderDraft = {
  editingId: null,
  title: sourceOptions[0].label,
  description: '',
  sourceMode: sourceOptions[0].sourceMode,
  sourceType: sourceOptions[0].sourceType,
  unitLabel: sourceOptions[0].unitLabel,
  milestones: makeDraftMilestones(sourceOptions[0].defaultMilestones),
  subscriptionUnitValue: '1',
  bitsAmountUnit: '100',
  bitsUnitValue: '1',
  tipAmountUnit: '5',
  tipUnitValue: '1',
}

function formatGoalAmount(value: number, unitLabel: string) {
  const rounded = Number.isInteger(value) ? value.toString() : value.toFixed(2)
  return `${rounded} ${unitLabel}`
}

function formatHistoryTime(value: number) {
  return new Intl.DateTimeFormat(undefined, {
    hour: 'numeric',
    minute: '2-digit',
  }).format(value)
}

function getSourceLabel(ladder: SubathonGoalLadder) {
  if (ladder.sourceMode === 'custom') return 'Custom goals'
  return sourceOptions.find((option) => option.sourceType === ladder.sourceType)?.label ?? 'Reward ladder'
}

function getMilestoneUnitLabel(milestoneSourceType: GoalSourceType | undefined, ladderUnitLabel: string) {
  if (milestoneSourceType === 'bits') return 'bits'
  if (milestoneSourceType === 'subscriptions') return 'subs'
  if (milestoneSourceType === 'tips') return '$'
  if (milestoneSourceType === 'channel-points') return 'pts'
  return ladderUnitLabel
}

function getGroupSourceLabel(sourceType: GoalSourceType) {
  if (sourceType === 'bits') return 'Bits'
  if (sourceType === 'subscriptions') return 'Subs'
  if (sourceType === 'tips') return 'Tips'
  if (sourceType === 'channel-points') return 'Channel Points'
  return 'Other'
}

function groupMilestonesBySource(milestones: SubathonGoalMilestone[]) {
  const order: GoalSourceType[] = ['bits', 'subscriptions', 'tips', 'channel-points', 'mixed-support']
  const groups = new Map<GoalSourceType, SubathonGoalMilestone[]>()
  for (const milestone of milestones) {
    const key = milestone.milestoneSourceType ?? 'bits'
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key)!.push(milestone)
  }
  return order.filter((k) => groups.has(k)).map((k) => ({ sourceType: k, milestones: groups.get(k)! }))
}

function getGroupProgress(milestones: SubathonGoalMilestone[], unit: string) {
  const current = milestones.reduce((max, m) => Math.max(max, m.milestoneCurrentAmount ?? 0), 0)
  const nextLocked = milestones
    .filter((m) => m.status === 'locked')
    .sort((a, b) => a.thresholdAmount - b.thresholdAmount)[0] ?? null
  if (!nextLocked) return { current, next: null, pct: 100, label: `All ${unit} goals done` }
  const pct = Math.min(100, Math.max(0, (current / nextLocked.thresholdAmount) * 100))
  return { current, next: nextLocked, pct, label: `${formatGoalAmount(current, unit)} / ${formatGoalAmount(nextLocked.thresholdAmount, unit)}` }
}

function getNextMilestone(ladder: SubathonGoalLadder) {
  return ladder.milestones
    .filter((milestone) => milestone.status === 'locked')
    .sort((left, right) => left.thresholdAmount - right.thresholdAmount)[0] ?? null
}

function getLadderProgress(ladder: SubathonGoalLadder) {
  if (ladder.sourceMode === 'custom') {
    const total = ladder.milestones.length
    if (total === 0) return 0
    const completed = ladder.milestones.filter((m) => m.status === 'completed').length
    return Math.round((completed / total) * 100)
  }
  const maxThreshold = ladder.milestones.reduce((current, milestone) => Math.max(current, milestone.thresholdAmount), 0)
  if (maxThreshold <= 0) {
    return 0
  }
  return Math.min(100, Math.max(0, (ladder.currentAmount / maxThreshold) * 100))
}

function buildDraftFromLadder(ladder: SubathonGoalLadder): LadderDraft {
  return {
    editingId: ladder.id,
    title: ladder.title,
    description: ladder.description ?? '',
    sourceMode: ladder.sourceMode,
    sourceType: ladder.sourceType,
    unitLabel: ladder.unitLabel,
    milestones: ladder.milestones.map((milestone) => ({
      id: milestone.id,
      thresholdAmount: String(milestone.thresholdAmount),
      rewardTitle: milestone.rewardTitle,
      rewardDescription: milestone.rewardDescription ?? '',
      milestoneSourceType: milestone.milestoneSourceType ?? 'bits',
    })),
    subscriptionUnitValue: String(ladder.config.mixed.subscriptionUnitValue),
    bitsAmountUnit: String(ladder.config.mixed.bitsAmountUnit),
    bitsUnitValue: String(ladder.config.mixed.bitsUnitValue),
    tipAmountUnit: String(ladder.config.mixed.tipAmountUnit),
    tipUnitValue: String(ladder.config.mixed.tipUnitValue),
  }
}

function buildLadderConfig(draft: LadderDraft): Partial<SubathonGoalLadderConfig> {
  const defaults = getDefaultGoalLadderConfig()
  return {
    ...defaults,
    mixed: {
      ...defaults.mixed,
      subscriptionUnitValue: Number.parseFloat(draft.subscriptionUnitValue) || defaults.mixed.subscriptionUnitValue,
      bitsAmountUnit: Number.parseFloat(draft.bitsAmountUnit) || defaults.mixed.bitsAmountUnit,
      bitsUnitValue: Number.parseFloat(draft.bitsUnitValue) || defaults.mixed.bitsUnitValue,
      tipAmountUnit: Number.parseFloat(draft.tipAmountUnit) || defaults.mixed.tipAmountUnit,
      tipUnitValue: Number.parseFloat(draft.tipUnitValue) || defaults.mixed.tipUnitValue,
    },
  }
}

function buildCreateInput(draft: LadderDraft): CreateGoalLadderInput | null {
  const milestones = draft.milestones
    .map((milestone) => ({
      thresholdAmount: Number.parseFloat(milestone.thresholdAmount),
      rewardTitle: milestone.rewardTitle.trim(),
      rewardDescription: milestone.rewardDescription.trim() || undefined,
      milestoneSourceType: draft.sourceMode === 'custom' ? milestone.milestoneSourceType : undefined,
    }))
    .filter((milestone) => Number.isFinite(milestone.thresholdAmount) && milestone.thresholdAmount > 0 && milestone.rewardTitle)

  if (!draft.title.trim() || milestones.length === 0) {
    return null
  }

  return {
    title: draft.title.trim(),
    description: draft.description.trim() || undefined,
    sourceMode: draft.sourceMode,
    sourceType: draft.sourceType,
    unitLabel: draft.unitLabel.trim() || 'points',
    milestones,
    config: buildLadderConfig(draft),
  }
}

export function GoalsPage() {
  const {
    adjustGoalProgress,
    announceGoalCompletionsInChat,
    archiveLadder,
    clearAllLadders,
    createLadder,
    deleteLadder,
    history,
    ladders,
    reopenMilestone,
    resetLadderProgress,
    setAnnounceGoalCompletionsInChat,
    skipMilestone,
    unarchiveLadder,
    updateLadder,
  } = useGoalsStore(useShallow(selectGoalsPageState))
  const [draft, setDraft] = useState<LadderDraft>(defaultDraft)
  const [formMessage, setFormMessage] = useState<string | null>(null)
  const [manualDrafts, setManualDrafts] = useState<Record<string, { amount: string; reason: string }>>({})
  const [confirmClearAll, setConfirmClearAll] = useState(false)

  const activeLadders = ladders.filter((ladder) => ladder.status !== 'archived')
  const archivedLadders = ladders.filter((ladder) => ladder.status === 'archived')

  const handleSourceChange = (value: string) => {
    const selected = sourceOptions.find((option) => `${option.sourceMode}:${option.sourceType}` === value) ?? sourceOptions[0]
    setDraft((current) => ({
      ...current,
      sourceMode: selected.sourceMode,
      sourceType: selected.sourceType,
      unitLabel: selected.unitLabel,
      title: current.editingId ? current.title : selected.label,
      milestones: current.editingId
        ? current.milestones
        : makeDraftMilestones(selected.defaultMilestones),
    }))
  }

  const handleMilestoneChange = (id: string, patch: Partial<MilestoneDraft>) => {
    setDraft((current) => ({
      ...current,
      milestones: current.milestones.map((milestone) => (milestone.id === id ? { ...milestone, ...patch } : milestone)),
    }))
  }

  const handleAddMilestone = () => {
    setDraft((current) => ({
      ...current,
      milestones: [
        ...current.milestones,
        {
          id: `draft-${Date.now()}`,
          thresholdAmount: '',
          rewardTitle: '',
          rewardDescription: '',
          milestoneSourceType: 'bits' as GoalSourceType,
        },
      ],
    }))
  }

  const handleRemoveMilestone = (id: string) => {
    setDraft((current) => ({
      ...current,
      milestones: current.milestones.filter((milestone) => milestone.id !== id),
    }))
  }

  const handleSubmit = () => {
    const input = buildCreateInput(draft)
    if (!input) {
      setFormMessage('Add a ladder name and at least one reward milestone with a threshold.')
      return
    }

    if (draft.editingId) {
      const existing = ladders.find((ladder) => ladder.id === draft.editingId)
      if (!existing) {
        setFormMessage('That ladder no longer exists.')
        return
      }

      updateLadder(draft.editingId, {
        title: input.title,
        description: input.description,
        sourceMode: input.sourceMode,
        sourceType: input.sourceType,
        unitLabel: input.unitLabel,
        config: {
          ...existing.config,
          ...input.config,
        } as SubathonGoalLadderConfig,
        milestones: input.milestones.map((milestone, index) => {
          const previous = existing.milestones[index]
          return {
            id: previous?.id ?? `goal-milestone-${Date.now()}-${index}`,
            thresholdAmount: milestone.thresholdAmount,
            rewardTitle: milestone.rewardTitle,
            rewardDescription: milestone.rewardDescription,
            milestoneSourceType: milestone.milestoneSourceType,
            milestoneCurrentAmount: previous?.milestoneCurrentAmount ?? 0,
            status: previous?.status ?? 'locked',
            completedAt: previous?.completedAt,
          }
        }),
      })
      setFormMessage('Reward ladder updated.')
    } else {
      createLadder(input)
      setFormMessage('Reward ladder created.')
    }

    setDraft(defaultDraft)
  }

  const handleEdit = (ladder: SubathonGoalLadder) => {
    setDraft(buildDraftFromLadder(ladder))
    setFormMessage('Editing ladder. Save changes when the milestones look right.')
  }

  const handleManualDraftChange = (ladderId: string, patch: Partial<{ amount: string; reason: string }>) => {
    setManualDrafts((current) => ({
      ...current,
      [ladderId]: {
        amount: current[ladderId]?.amount ?? '',
        reason: current[ladderId]?.reason ?? '',
        ...patch,
      },
    }))
  }

  const handleApplyManualAdjustment = (ladderId: string) => {
    const manual = manualDrafts[ladderId]
    const amount = Number.parseFloat(manual?.amount ?? '')
    if (!manual?.reason.trim() || !Number.isFinite(amount) || amount === 0) {
      return
    }
    adjustGoalProgress(ladderId, amount, manual.reason)
    handleManualDraftChange(ladderId, { amount: '', reason: '' })
  }

  const handleReset = (ladderId: string) => {
    const reason = manualDrafts[ladderId]?.reason.trim()
    if (!reason) {
      return
    }
    resetLadderProgress(ladderId, reason)
    handleManualDraftChange(ladderId, { amount: '', reason: '' })
  }

  return (
    <div className="page-container goals-page">
      <section className="page-header rules-header goals-header">
        <div>
          <h1 className="page-title">Goals</h1>
          <p className="page-desc">
            Build reward ladders for your subathon. These milestones track progress from stream events without changing timer rules or adding time.
          </p>
        </div>
        <div className="goals-header__stats">
          <span>{activeLadders.length} active</span>
          <span>{archivedLadders.length} archived</span>
          <button
            className={`goals-chat-toggle${announceGoalCompletionsInChat ? ' goals-chat-toggle--active' : ''}`}
            type="button"
            onClick={() => setAnnounceGoalCompletionsInChat(!announceGoalCompletionsInChat)}
          >
            <strong>Chat announcements</strong>
            <em>{announceGoalCompletionsInChat ? 'Enabled' : 'Off'}</em>
          </button>
          {confirmClearAll ? (
            <span className="goals-clear-confirm">
              <span>Delete all ladders and history?</span>
              <button
                className="btn btn--ghost"
                type="button"
                onClick={() => {
                  clearAllLadders()
                  setDraft(defaultDraft)
                  setFormMessage(null)
                  setManualDrafts({})
                  setConfirmClearAll(false)
                }}
              >
                Yes, clear all
              </button>
              <button className="btn btn--ghost" type="button" onClick={() => setConfirmClearAll(false)}>
                Cancel
              </button>
            </span>
          ) : (
            <button
              className="btn btn--ghost goals-clear-btn"
              type="button"
              onClick={() => setConfirmClearAll(true)}
              disabled={ladders.length === 0 && history.length === 0}
            >
              Clear all
            </button>
          )}
        </div>
      </section>

      <div className="goals-layout">
        <section className="panel goals-composer">
          <div className="panel-header">
            <div>
              <h2 className="panel-title">{draft.editingId ? 'Edit reward ladder' : 'Create reward ladder'}</h2>
              <p className="panel-copy">Choose what this ladder counts, then add each threshold and the reward it unlocks.</p>
            </div>
          </div>

          <div className="goals-source-picker" role="group" aria-label="Reward ladder type">
            {sourceOptions.map((option) => {
              const selected = draft.sourceMode === option.sourceMode && draft.sourceType === option.sourceType
              return (
                <button
                  key={`${option.sourceMode}:${option.sourceType}`}
                  type="button"
                  className={`goals-source-option${selected ? ' goals-source-option--active' : ''}`}
                  onClick={() => handleSourceChange(`${option.sourceMode}:${option.sourceType}`)}
                >
                  <span>{option.label}</span>
                  <small>{option.description}</small>
                </button>
              )
            })}
          </div>

          <div className="goals-form-fields">
            <label className="rule-field">
              <span className="rule-field__label">Name <em className="goals-field-optional">(optional)</em></span>
              <input
                className="rule-field__input"
                value={draft.title}
                onChange={(event) => setDraft((current) => ({ ...current, title: event.target.value }))}
                placeholder={sourceOptions.find((o) => o.sourceType === draft.sourceType)?.label ?? 'Reward ladder'}
              />
            </label>

            {(draft.sourceType === 'tips' || draft.sourceType === 'charity') ? (
              <label className="rule-field">
                <span className="rule-field__label">Unit label</span>
                <input
                  className="rule-field__input"
                  value={draft.unitLabel}
                  onChange={(event) => setDraft((current) => ({ ...current, unitLabel: event.target.value }))}
                  placeholder="e.g. USD, EUR"
                />
              </label>
            ) : null}
          </div>

          {draft.sourceMode === 'custom' ? (
            <p className="goals-custom-hint">Each milestone below can track a different source independently. Set the amount and pick the source for each one.</p>
          ) : null}

          <div className="goals-milestone-editor">
            <div className="goals-section-heading">
              <strong>Milestones</strong>
              <button className="btn btn--ghost" type="button" onClick={handleAddMilestone}>
                + Add
              </button>
            </div>

            {draft.milestones.map((milestone) => {
              const isCustom = draft.sourceMode === 'custom'
              const milestoneUnit = isCustom
                ? getMilestoneUnitLabel(milestone.milestoneSourceType, draft.unitLabel)
                : draft.unitLabel
              const stepSize = (!isCustom && draft.sourceType === 'tips') || (isCustom && milestone.milestoneSourceType === 'tips') ? 0.01 : 1
              return (
                <div className="goals-milestone-row" key={milestone.id}>
                  <input
                    className="rule-field__input goals-milestone-threshold"
                    type="number"
                    min={0}
                    step={stepSize}
                    placeholder="0"
                    value={milestone.thresholdAmount}
                    onChange={(event) => handleMilestoneChange(milestone.id, { thresholdAmount: event.target.value })}
                  />
                  {isCustom ? (
                    <select
                      className="goals-milestone-source-select"
                      value={milestone.milestoneSourceType}
                      onChange={(event) => handleMilestoneChange(milestone.id, { milestoneSourceType: event.target.value as GoalSourceType })}
                    >
                      <option value="bits">bits</option>
                      <option value="subscriptions">subs</option>
                      <option value="tips">tips $</option>
                      <option value="channel-points">pts</option>
                    </select>
                  ) : (
                    <span className="goals-milestone-unit">{milestoneUnit}</span>
                  )}
                  <input
                    className="rule-field__input goals-milestone-reward"
                    placeholder="Reward description"
                    value={milestone.rewardTitle}
                    onChange={(event) => handleMilestoneChange(milestone.id, { rewardTitle: event.target.value })}
                  />
                  <button
                    className="goals-milestone-remove"
                    type="button"
                    onClick={() => handleRemoveMilestone(milestone.id)}
                    disabled={draft.milestones.length <= 1}
                    aria-label="Remove milestone"
                  >
                    ×
                  </button>
                </div>
              )
            })}
          </div>

          <div className="goals-composer__actions">
            <button className="btn btn--primary" type="button" onClick={handleSubmit}>
              {draft.editingId ? 'Save Ladder' : 'Create Ladder'}
            </button>
            <button
              className="btn btn--ghost"
              type="button"
              onClick={() => {
                setDraft(defaultDraft)
                setFormMessage(null)
              }}
            >
              Clear
            </button>
            {formMessage ? <span className="goals-form-message">{formMessage}</span> : null}
          </div>
        </section>

        <section className="goals-board">
          {activeLadders.length === 0 ? (
            <div className="panel goals-empty-state">
              <div className="goals-empty-state__orb" aria-hidden="true" />
              <span className="goals-empty-state__eyebrow">No ladders yet</span>
              <h2>Turn support into visible stream rewards.</h2>
              <p>Add thresholds like 100 bits, 25 subs, or $50 tips. As progress comes in, rewards become a checked-off roadmap for the streamer and chat.</p>
            </div>
          ) : (
            activeLadders.map((ladder) => {
              const nextMilestone = getNextMilestone(ladder)
              const progress = getLadderProgress(ladder)
              const manual = manualDrafts[ladder.id] ?? { amount: '', reason: '' }

              return (
                <article key={ladder.id} className="panel goals-ladder-card">
                  <div className="goals-ladder-card__header">
                    <div>
                      <div className="goals-ladder-card__badges">
                        <span className="mini-chip">{getSourceLabel(ladder)}</span>
                      </div>
                      <h2>{ladder.title}</h2>
                      {ladder.description ? <p>{ladder.description}</p> : null}
                    </div>
                    {ladder.sourceMode !== 'custom' && (
                      <div className="goals-ladder-card__total">
                        <span>Current progress</span>
                        <strong>{formatGoalAmount(ladder.currentAmount, ladder.unitLabel)}</strong>
                        <em>{nextMilestone ? `Next unlock at ${formatGoalAmount(nextMilestone.thresholdAmount, ladder.unitLabel)}` : 'All rewards unlocked'}</em>
                      </div>
                    )}
                  </div>

                  {ladder.sourceMode !== 'custom' && (
                    <div className="goals-progress">
                      <span style={{ width: `${progress}%` }} />
                    </div>
                  )}

                  {ladder.sourceMode === 'custom' ? (
                    <div className="goals-source-groups">
                      {groupMilestonesBySource(ladder.milestones).map(({ sourceType, milestones: groupMilestones }) => {
                        const unit = getMilestoneUnitLabel(sourceType, ladder.unitLabel)
                        const groupProg = getGroupProgress(groupMilestones, unit)
                        return (
                          <div key={sourceType} className="goals-source-group">
                            <div className="goals-source-group__header">
                              <span className="goals-source-group__label">{getGroupSourceLabel(sourceType)}</span>
                              <span className="goals-source-group__progress-label">{groupProg.label}</span>
                            </div>
                            <div className="goals-progress goals-source-group__bar">
                              <span style={{ width: `${groupProg.pct}%` }} />
                            </div>
                            <div className="goals-milestone-list">
                              {groupMilestones.map((milestone) => (
                                <div key={milestone.id} className={`goals-milestone-item goals-milestone-item--${milestone.status}`}>
                                  <div className="goals-milestone-item__mark">
                                    {milestone.status === 'completed' ? '✓' : milestone.status === 'skipped' ? '–' : ''}
                                  </div>
                                  <div className="goals-milestone-item__copy">
                                    <strong>{milestone.rewardTitle}</strong>
                                    <span>{formatGoalAmount(milestone.thresholdAmount, unit)}</span>
                                  </div>
                                  <div className="goals-milestone-item__actions">
                                    {milestone.status === 'locked' ? (
                                      <button className="btn btn--ghost" type="button" onClick={() => skipMilestone(ladder.id, milestone.id, manual.reason || undefined)}>Skip</button>
                                    ) : (
                                      <button className="btn btn--ghost" type="button" onClick={() => reopenMilestone(ladder.id, milestone.id, manual.reason || undefined)}>Reopen</button>
                                    )}
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  ) : (
                    <div className="goals-milestone-list">
                      {ladder.milestones.map((milestone) => (
                        <div key={milestone.id} className={`goals-milestone-item goals-milestone-item--${milestone.status}`}>
                          <div className="goals-milestone-item__mark">
                            {milestone.status === 'completed' ? '✓' : milestone.status === 'skipped' ? '–' : ''}
                          </div>
                          <div className="goals-milestone-item__copy">
                            <strong>{milestone.rewardTitle}</strong>
                            <span>{formatGoalAmount(milestone.thresholdAmount, ladder.unitLabel)}</span>
                          </div>
                          <div className="goals-milestone-item__actions">
                            {milestone.status === 'locked' ? (
                              <button className="btn btn--ghost" type="button" onClick={() => skipMilestone(ladder.id, milestone.id, manual.reason || undefined)}>Skip</button>
                            ) : (
                              <button className="btn btn--ghost" type="button" onClick={() => reopenMilestone(ladder.id, milestone.id, manual.reason || undefined)}>Reopen</button>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  <div className="goals-ladder-tools">
                    {ladder.sourceMode !== 'custom' && (
                      <label className="rule-field">
                        <span className="rule-field__label">Manual amount</span>
                        <input
                          className="rule-field__input"
                          type="number"
                          step={ladder.sourceType === 'tips' ? 0.01 : 1}
                          value={manual.amount}
                          onChange={(event) => handleManualDraftChange(ladder.id, { amount: event.target.value })}
                        />
                        <span className="rule-field__hint">Use a negative number to correct progress downward.</span>
                      </label>
                    )}
                    <label className="rule-field goals-ladder-tools__reason">
                      <span className="rule-field__label">Reason</span>
                      <input
                        className="rule-field__input"
                        value={manual.reason}
                        onChange={(event) => handleManualDraftChange(ladder.id, { reason: event.target.value })}
                      />
                      <span className="rule-field__hint">{ladder.sourceMode === 'custom' ? 'Used for resets, skips, and reopens.' : 'Required for manual adjustments, resets, skips, and reopens.'}</span>
                    </label>
                    <div className="goals-ladder-tools__actions">
                      {ladder.sourceMode !== 'custom' && (
                        <button className="btn btn--primary" type="button" onClick={() => handleApplyManualAdjustment(ladder.id)}>
                          Apply
                        </button>
                      )}
                      <button className="btn btn--ghost" type="button" onClick={() => handleReset(ladder.id)} disabled={!manual.reason.trim()}>
                        Reset
                      </button>
                      <button className="btn btn--ghost" type="button" onClick={() => handleEdit(ladder)}>
                        Edit
                      </button>
                      <button className="btn btn--ghost" type="button" onClick={() => archiveLadder(ladder.id)}>
                        Archive
                      </button>
                    </div>
                  </div>
                </article>
              )
            })
          )}
        </section>

        <aside className="panel goals-history-panel">
          <div className="panel-header">
            <div>
              <h2 className="panel-title">Goal history</h2>
              <p className="panel-copy">Recent ladder progress, manual corrections, and milestone changes.</p>
            </div>
          </div>
          {history.length === 0 ? (
            <div className="goals-history-empty">Progress events will appear here once a ladder starts moving.</div>
          ) : (
            <div className="goals-history-list">
              {history.slice(0, 20).map((entry) => (
                <div key={entry.id} className="goals-history-item">
                  <span>{formatHistoryTime(entry.occurredAt)}</span>
                  <strong>{entry.title}</strong>
                  <p>{entry.summary}</p>
                </div>
              ))}
            </div>
          )}

          {archivedLadders.length > 0 ? (
            <div className="goals-archive-list">
              <strong>Archived</strong>
              {archivedLadders.map((ladder) => (
                <div key={ladder.id} className="goals-archive-item">
                  <span>{ladder.title}</span>
                  <div className="goals-archive-item__actions">
                    <button className="btn btn--ghost" type="button" onClick={() => unarchiveLadder(ladder.id)}>
                      Restore
                    </button>
                    <button className="btn btn--ghost" type="button" onClick={() => deleteLadder(ladder.id)}>
                      Delete
                    </button>
                  </div>
                </div>
              ))}
            </div>
          ) : null}
        </aside>
      </div>
    </div>
  )
}
