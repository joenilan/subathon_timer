export type WheelOutcomeType = 'time' | 'timeout' | 'custom'
export type WheelSpinStatus = 'idle' | 'spinning' | 'ready'

export interface WheelSegment {
  id: string
  label: string
  chance: string
  outcome: string
  outcomeType: WheelOutcomeType
  color?: string
  minSubs?: number
  timeDeltaSeconds?: number
  timeoutSeconds?: number
  timeoutTarget?: 'self' | 'random'
  moderationRequired: boolean
}

export interface WheelSpinState {
  status: WheelSpinStatus
  activeSegmentId: string | null
  resultTitle: string | null
  resultSummary: string | null
  requiresModeration: boolean
  autoApply: boolean
}
