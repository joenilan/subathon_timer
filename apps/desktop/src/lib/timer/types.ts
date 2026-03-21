export type NormalizedTwitchEventType =
  | 'subscription'
  | 'resubscription'
  | 'gift_subscription'
  | 'gift_bomb'
  | 'cheer'
  | 'follow'
  | 'raid'
  | 'chat_command'

export type ChatTimerCommandAction = 'add' | 'remove' | 'pause' | 'resume' | 'start' | 'reset' | 'set' | 'help'
export type TimerCommandPermission = 'streamer' | 'mod' | 'both'

export interface TimerCommandPermissionConfig {
  add: TimerCommandPermission
  remove: TimerCommandPermission
  pause: TimerCommandPermission
  resume: TimerCommandPermission
  start: TimerCommandPermission
  reset: TimerCommandPermission
  set: TimerCommandPermission
  help: TimerCommandPermission
}

export interface ChatTimerCommand {
  action: ChatTimerCommandAction
  rawText: string
  seconds: number | null
  isBroadcaster: boolean
  isModerator: boolean
}

export interface NormalizedTwitchEvent {
  id: string
  source: 'twitch-eventsub'
  eventType: NormalizedTwitchEventType
  occurredAt: string
  userId: string | null
  userLogin: string | null
  displayName: string | null
  anonymous: boolean
  amount: number | null
  tier: string | null
  count: number | null
  command: ChatTimerCommand | null
  rawPayload: Record<string, unknown>
}

export interface TimerRuleConfig {
  baseValueSeconds: number
  tier1SubSeconds: number
  tier2SubSeconds: number
  tier3SubSeconds: number
  donationMultiplier: number
  bitsPerUnit: number
  bitsUnitSeconds: number
  followSeconds: number
  advancedSubEventOverridesEnabled: boolean
  subscriptionEnabled: boolean
  resubscriptionEnabled: boolean
  giftSubscriptionEnabled: boolean
  giftBombEnabled: boolean
  subscriptionUseCustomValues: boolean
  resubscriptionUseCustomValues: boolean
  giftSubscriptionUseCustomValues: boolean
  giftBombUseCustomValues: boolean
  subscriptionTier1Seconds: number
  subscriptionTier2Seconds: number
  subscriptionTier3Seconds: number
  resubscriptionTier1Seconds: number
  resubscriptionTier2Seconds: number
  resubscriptionTier3Seconds: number
  giftSubscriptionTier1Seconds: number
  giftSubscriptionTier2Seconds: number
  giftSubscriptionTier3Seconds: number
  giftBombTier1Seconds: number
  giftBombTier2Seconds: number
  giftBombTier3Seconds: number
  cheerEnabled: boolean
  followEnabled: boolean
  raidEnabled: boolean
  raidViewerCountUnit: number
  raidUnitSeconds: number
}

export type TimerRuleNumericKey =
  | 'baseValueSeconds'
  | 'tier1SubSeconds'
  | 'tier2SubSeconds'
  | 'tier3SubSeconds'
  | 'donationMultiplier'
  | 'bitsPerUnit'
  | 'bitsUnitSeconds'
  | 'followSeconds'
  | 'subscriptionTier1Seconds'
  | 'subscriptionTier2Seconds'
  | 'subscriptionTier3Seconds'
  | 'resubscriptionTier1Seconds'
  | 'resubscriptionTier2Seconds'
  | 'resubscriptionTier3Seconds'
  | 'giftSubscriptionTier1Seconds'
  | 'giftSubscriptionTier2Seconds'
  | 'giftSubscriptionTier3Seconds'
  | 'giftBombTier1Seconds'
  | 'giftBombTier2Seconds'
  | 'giftBombTier3Seconds'
  | 'raidViewerCountUnit'
  | 'raidUnitSeconds'

export type TimerRuleToggleKey =
  | 'advancedSubEventOverridesEnabled'
  | 'subscriptionEnabled'
  | 'resubscriptionEnabled'
  | 'giftSubscriptionEnabled'
  | 'giftBombEnabled'
  | 'subscriptionUseCustomValues'
  | 'resubscriptionUseCustomValues'
  | 'giftSubscriptionUseCustomValues'
  | 'giftBombUseCustomValues'
  | 'cheerEnabled'
  | 'followEnabled'
  | 'raidEnabled'

export type TimerWidgetTheme = 'original' | 'app'

export interface TimerAdjustmentResult {
  deltaSeconds: number
  title: string
  summary: string
}
