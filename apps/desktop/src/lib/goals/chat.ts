import type { GoalCompletedMilestoneAnnouncement } from './types'

const TWITCH_CHAT_MESSAGE_LIMIT = 500

export function buildGoalCompletionChatMessage(completions: GoalCompletedMilestoneAnnouncement[]) {
  const visibleCompletions = completions.filter((completion) => completion.rewardTitle.trim().length > 0)
  if (visibleCompletions.length === 0) {
    return null
  }

  const message =
    visibleCompletions.length === 1
      ? buildSingleGoalMessage(visibleCompletions[0])
      : buildMultipleGoalMessage(visibleCompletions)

  return truncateChatMessage(message)
}

function buildSingleGoalMessage(completion: GoalCompletedMilestoneAnnouncement) {
  return `Goal unlocked: ${completion.rewardTitle} at ${formatGoalAmount(
    completion.thresholdAmount,
    completion.unitLabel,
  )}!`
}

function buildMultipleGoalMessage(completions: GoalCompletedMilestoneAnnouncement[]) {
  const rewardList = formatRewardList(completions.map((completion) => completion.rewardTitle))
  return `Goals unlocked: ${rewardList}!`
}

function formatRewardList(values: string[]) {
  const uniqueValues = [...new Set(values.map((value) => value.trim()).filter(Boolean))]
  if (uniqueValues.length <= 1) {
    return uniqueValues[0] ?? 'Reward unlocked'
  }

  if (uniqueValues.length === 2) {
    return `${uniqueValues[0]} and ${uniqueValues[1]}`
  }

  return `${uniqueValues.slice(0, -1).join(', ')}, and ${uniqueValues[uniqueValues.length - 1]}`
}

function formatGoalAmount(value: number, unitLabel: string) {
  const rounded = Number.isInteger(value) ? value.toString() : value.toFixed(2)
  return `${rounded} ${unitLabel}`
}

function truncateChatMessage(message: string) {
  if (message.length <= TWITCH_CHAT_MESSAGE_LIMIT) {
    return message
  }

  return `${message.slice(0, TWITCH_CHAT_MESSAGE_LIMIT - 3)}...`
}
