import { create } from 'zustand'
import { applyGoalEvent, getDefaultGoalLadderConfig, sortGoalMilestones } from '../lib/goals/engine'
import type {
  CreateGoalLadderInput,
  GoalCompletedMilestoneAnnouncement,
  GoalHistoryEntry,
  ProcessGoalEventResult,
  GoalsSnapshot,
  SubathonGoalLadder,
  SubathonGoalLadderConfig,
  SubathonGoalMilestone,
} from '../lib/goals/types'
import type { NormalizedTimerEvent } from '../lib/timer/types'

const MAX_GOAL_HISTORY = 250

export interface GoalsState {
  ladders: SubathonGoalLadder[]
  history: GoalHistoryEntry[]
  announceGoalCompletionsInChat: boolean
  hydrateGoalsSnapshot: (snapshot: GoalsSnapshot | null | undefined) => void
  setAnnounceGoalCompletionsInChat: (value: boolean) => void
  createLadder: (input: CreateGoalLadderInput) => string
  updateLadder: (id: string, patch: Partial<Omit<SubathonGoalLadder, 'id' | 'createdAt' | 'processedEventIds'>>) => void
  archiveLadder: (id: string) => void
  deleteLadder: (id: string) => void
  adjustGoalProgress: (ladderId: string, deltaAmount: number, reason: string) => void
  resetLadderProgress: (ladderId: string, reason: string) => void
  skipMilestone: (ladderId: string, milestoneId: string, reason?: string) => void
  reopenMilestone: (ladderId: string, milestoneId: string, reason?: string) => void
  clearAllLadders: () => void
  unarchiveLadder: (id: string) => void
  processGoalEvent: (event: NormalizedTimerEvent) => ProcessGoalEventResult
  buildGoalsSnapshot: () => GoalsSnapshot
}

export const useGoalsStore = create<GoalsState>((set, get) => ({
  ladders: [],
  history: [],
  announceGoalCompletionsInChat: false,

  hydrateGoalsSnapshot: (snapshot) => {
    const normalized = normalizeGoalsSnapshot(snapshot)
    set({
      ladders: normalized.ladders,
      history: normalized.history,
      announceGoalCompletionsInChat: normalized.announceGoalCompletionsInChat ?? false,
    })
  },

  setAnnounceGoalCompletionsInChat: (value) => set({ announceGoalCompletionsInChat: value }),

  createLadder: (input) => {
    const now = Date.now()
    const id = `goal-ladder-${now}-${Math.random().toString(36).slice(2, 8)}`
    const ladder = normalizeGoalLadder({
      id,
      title: input.title,
      description: input.description,
      status: 'active',
      sourceMode: input.sourceMode,
      sourceType: input.sourceType,
      currentAmount: 0,
      unitLabel: input.unitLabel,
      milestones: input.milestones.map((milestone, index) => ({
        id: `goal-milestone-${now}-${index}-${Math.random().toString(36).slice(2, 6)}`,
        thresholdAmount: milestone.thresholdAmount,
        rewardTitle: milestone.rewardTitle,
        rewardDescription: milestone.rewardDescription,
        status: 'locked',
      })),
      createdAt: new Date(now).toISOString(),
      config: mergeGoalConfig(input.config),
      processedEventIds: [],
    })

    set((state) => ({
      ladders: [...state.ladders, ladder],
    }))

    return id
  },

  updateLadder: (id, patch) =>
    set((state) => ({
      ladders: state.ladders.map((ladder) =>
        ladder.id === id
          ? normalizeGoalLadder({
              ...ladder,
              ...patch,
              milestones: patch.milestones ?? ladder.milestones,
              config: patch.config ? mergeGoalConfig(patch.config) : ladder.config,
            })
          : ladder,
      ),
    })),

  archiveLadder: (id) =>
    set((state) => ({
      ladders: state.ladders.map((ladder) => (ladder.id === id ? { ...ladder, status: 'archived' } : ladder)),
    })),

  deleteLadder: (id) =>
    set((state) => ({
      ladders: state.ladders.filter((ladder) => ladder.id !== id),
      history: state.history.filter((entry) => entry.ladderId !== id),
    })),

  adjustGoalProgress: (ladderId, deltaAmount, reason) => {
    const safeDelta = Number.isFinite(deltaAmount) ? deltaAmount : 0
    if (safeDelta === 0 || reason.trim().length === 0) {
      return
    }

    set((state) => {
      const now = Date.now()
      const nextHistory: GoalHistoryEntry[] = []
      const ladders = state.ladders.map((ladder) => {
        if (ladder.id !== ladderId) {
          return ladder
        }

        const nextAmount = Math.max(0, ladder.currentAmount + safeDelta)
        const completed = completeCrossedMilestones(ladder.milestones, nextAmount, new Date(now).toISOString())
        nextHistory.push({
          id: `goal-history-manual-${now}`,
          ladderId,
          type: 'manual_adjustment',
          title: 'Manual goal adjustment',
          summary: reason.trim(),
          deltaAmount: safeDelta,
          occurredAt: now,
          source: 'manual',
        })
        nextHistory.push(...buildMilestoneHistory(ladder.id, completed.completedMilestones, now))

        return {
          ...ladder,
          currentAmount: nextAmount,
          milestones: completed.milestones,
        }
      })

      return {
        ladders,
        history: appendGoalHistory(state.history, nextHistory),
      }
    })
  },

  resetLadderProgress: (ladderId, reason) => {
    if (reason.trim().length === 0) {
      return
    }

    set((state) => {
      const now = Date.now()
      return {
        ladders: state.ladders.map((ladder) =>
          ladder.id === ladderId
            ? {
                ...ladder,
                currentAmount: 0,
                milestones: ladder.milestones.map((milestone) => ({
                  ...milestone,
                  status: 'locked',
                  completedAt: undefined,
                })),
                processedEventIds: [],
              }
            : ladder,
        ),
        history: appendGoalHistory(state.history, [
          {
            id: `goal-history-reset-${now}`,
            ladderId,
            type: 'ladder_reset',
            title: 'Goal ladder reset',
            summary: reason.trim(),
            deltaAmount: 0,
            occurredAt: now,
            source: 'manual',
          },
        ]),
      }
    })
  },

  skipMilestone: (ladderId, milestoneId, reason) => updateMilestoneStatus(set, ladderId, milestoneId, 'skipped', reason ?? 'Skipped manually'),

  reopenMilestone: (ladderId, milestoneId, reason) => updateMilestoneStatus(set, ladderId, milestoneId, 'locked', reason ?? 'Reopened manually'),

  clearAllLadders: () => set({ ladders: [], history: [] }),

  unarchiveLadder: (id) =>
    set((state) => ({
      ladders: state.ladders.map((ladder) => (ladder.id === id ? { ...ladder, status: 'active' } : ladder)),
    })),

  processGoalEvent: (event) => {
    const completedMilestones: GoalCompletedMilestoneAnnouncement[] = []
    set((state) => {
      const now = Date.now()
      const nextHistory: GoalHistoryEntry[] = []
      const ladders = state.ladders.map((ladder) => {
        const result = applyGoalEvent(ladder, event, { completedAt: event.occurredAt })
        if (!result.accepted) {
          return ladder
        }

        nextHistory.push({
          id: `goal-history-event-${now}-${ladder.id}`,
          ladderId: ladder.id,
          type: 'event_progress',
          title: 'Goal progress updated',
          summary: `${event.displayName ?? event.userLogin ?? 'A viewer'} added ${formatGoalAmount(
            result.contributionAmount,
            ladder.unitLabel,
          )}.`,
          deltaAmount: result.contributionAmount,
          occurredAt: now,
          source: 'event',
          eventId: event.id,
        })
        nextHistory.push(...buildMilestoneHistory(ladder.id, result.completedMilestones, now))
        completedMilestones.push(
          ...result.completedMilestones.map((milestone) => ({
            ladderId: ladder.id,
            ladderTitle: ladder.title,
            milestoneId: milestone.id,
            rewardTitle: milestone.rewardTitle,
            thresholdAmount: milestone.thresholdAmount,
            unitLabel: ladder.unitLabel,
          })),
        )

        return result.ladder
      })

      return {
        ladders,
        history: appendGoalHistory(state.history, nextHistory),
      }
    })

    return { completedMilestones }
  },

  buildGoalsSnapshot: () => {
    const state = get()
    return {
      ladders: state.ladders,
      history: state.history,
      announceGoalCompletionsInChat: state.announceGoalCompletionsInChat,
    }
  },
}))

function mergeGoalConfig(config: Partial<SubathonGoalLadderConfig> | undefined): SubathonGoalLadderConfig {
  const defaults = getDefaultGoalLadderConfig()
  return {
    allowTestEvents: config?.allowTestEvents ?? defaults.allowTestEvents,
    subscriptions: {
      ...defaults.subscriptions,
      ...config?.subscriptions,
      tierWeights: {
        ...defaults.subscriptions.tierWeights,
        ...config?.subscriptions?.tierWeights,
      },
    },
    bits: {
      ...defaults.bits,
      ...config?.bits,
      minimumBits: Math.max(1, Math.round(config?.bits?.minimumBits ?? defaults.bits.minimumBits)),
    },
    tips: {
      ...defaults.tips,
      ...config?.tips,
      minimumAmount: Math.max(0.01, config?.tips?.minimumAmount ?? defaults.tips.minimumAmount),
    },
    mixed: {
      ...defaults.mixed,
      ...config?.mixed,
      bitsAmountUnit: Math.max(1, config?.mixed?.bitsAmountUnit ?? defaults.mixed.bitsAmountUnit),
      tipAmountUnit: Math.max(0.01, config?.mixed?.tipAmountUnit ?? defaults.mixed.tipAmountUnit),
    },
  }
}

function normalizeGoalsSnapshot(snapshot: GoalsSnapshot | null | undefined): GoalsSnapshot {
  if (!snapshot) {
    return { ladders: [], history: [], announceGoalCompletionsInChat: false }
  }

  return {
    ladders: Array.isArray(snapshot.ladders) ? snapshot.ladders.map(normalizeGoalLadder) : [],
    history: Array.isArray(snapshot.history) ? snapshot.history.filter(isValidGoalHistoryEntry).slice(0, MAX_GOAL_HISTORY) : [],
    announceGoalCompletionsInChat: snapshot.announceGoalCompletionsInChat === true,
  }
}

function normalizeGoalLadder(ladder: SubathonGoalLadder): SubathonGoalLadder {
  return {
    ...ladder,
    title: ladder.title.trim().length > 0 ? ladder.title.trim() : 'Subathon rewards',
    description: ladder.description?.trim() || undefined,
    status: ladder.status === 'paused' || ladder.status === 'archived' ? ladder.status : 'active',
    sourceMode: ladder.sourceMode === 'mixed-source' ? 'mixed-source' : 'single-source',
    sourceType: ladder.sourceType,
    currentAmount: Math.max(0, Number.isFinite(ladder.currentAmount) ? ladder.currentAmount : 0),
    unitLabel: ladder.unitLabel.trim().length > 0 ? ladder.unitLabel.trim() : 'points',
    milestones: sortGoalMilestones(ladder.milestones.map(normalizeMilestone)),
    config: mergeGoalConfig(ladder.config),
    processedEventIds: Array.isArray(ladder.processedEventIds) ? ladder.processedEventIds.filter(Boolean).slice(-500) : [],
  }
}

function normalizeMilestone(milestone: SubathonGoalMilestone): SubathonGoalMilestone {
  return {
    ...milestone,
    thresholdAmount: Math.max(0, Number.isFinite(milestone.thresholdAmount) ? milestone.thresholdAmount : 0),
    rewardTitle: milestone.rewardTitle.trim().length > 0 ? milestone.rewardTitle.trim() : 'Reward unlocked',
    rewardDescription: milestone.rewardDescription?.trim() || undefined,
    status:
      milestone.status === 'completed' || milestone.status === 'skipped'
        ? milestone.status
        : 'locked',
    completedAt: milestone.status === 'completed' ? milestone.completedAt : undefined,
  }
}

function completeCrossedMilestones(
  milestones: SubathonGoalMilestone[],
  nextAmount: number,
  completedAt: string,
) {
  const completedMilestones: SubathonGoalMilestone[] = []
  const nextMilestones = milestones.map((milestone) => {
    if (milestone.status !== 'locked' || milestone.thresholdAmount > nextAmount) {
      return milestone
    }

    const completedMilestone = {
      ...milestone,
      status: 'completed' as const,
      completedAt,
    }
    completedMilestones.push(completedMilestone)
    return completedMilestone
  })

  return {
    milestones: nextMilestones,
    completedMilestones: sortGoalMilestones(completedMilestones),
  }
}

function buildMilestoneHistory(ladderId: string, milestones: SubathonGoalMilestone[], now: number) {
  return milestones.map((milestone) => ({
    id: `goal-history-milestone-${now}-${milestone.id}`,
    ladderId,
    milestoneId: milestone.id,
    type: 'milestone_completed' as const,
    title: 'Goal unlocked',
    summary: milestone.rewardTitle,
    deltaAmount: 0,
    occurredAt: now,
    source: 'event' as const,
  }))
}

function appendGoalHistory(current: GoalHistoryEntry[], next: GoalHistoryEntry[]) {
  if (next.length === 0) {
    return current
  }
  return [...next, ...current].slice(0, MAX_GOAL_HISTORY)
}

function updateMilestoneStatus(
  set: (partial: Partial<GoalsState> | ((state: GoalsState) => Partial<GoalsState>), replace?: false) => void,
  ladderId: string,
  milestoneId: string,
  status: 'locked' | 'skipped',
  reason: string,
) {

  set((state) => {
    const now = Date.now()
    let historyEntry: GoalHistoryEntry | null = null
    const ladders = state.ladders.map((ladder) => {
      if (ladder.id !== ladderId) {
        return ladder
      }

      return {
        ...ladder,
        milestones: ladder.milestones.map((milestone) => {
          if (milestone.id !== milestoneId) {
            return milestone
          }

          historyEntry = {
            id: `goal-history-milestone-status-${now}-${milestoneId}`,
            ladderId,
            milestoneId,
            type: status === 'skipped' ? 'milestone_skipped' : 'milestone_reopened',
            title: status === 'skipped' ? 'Goal skipped' : 'Goal reopened',
            summary: reason.trim(),
            deltaAmount: 0,
            occurredAt: now,
            source: 'manual',
          }

          return {
            ...milestone,
            status,
            completedAt: undefined,
          }
        }),
      }
    })

    return {
      ladders,
      history: historyEntry ? appendGoalHistory(state.history, [historyEntry]) : state.history,
    }
  })
}

function isValidGoalHistoryEntry(entry: GoalHistoryEntry) {
  return Boolean(entry && typeof entry.id === 'string' && typeof entry.ladderId === 'string')
}

function formatGoalAmount(value: number, unitLabel: string) {
  const rounded = Number.isInteger(value) ? value.toString() : value.toFixed(2)
  return `${rounded} ${unitLabel}`
}
