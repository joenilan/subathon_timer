import { useTwitchSessionStore } from '../../state/useTwitchSessionStore'
import { TWITCH_CLIENT_ID } from '../twitch/constants'
import { sendChatMessage } from '../twitch/helix'
import { buildGoalCompletionChatMessage } from './chat'
import type { ProcessGoalEventResult } from './types'

export async function announceGoalCompletionInChat(result: ProcessGoalEventResult) {
  if (result.completedMilestones.length === 0) {
    return
  }

  const message = buildGoalCompletionChatMessage(result.completedMilestones)
  if (!message) {
    return
  }

  const { session, tokens } = useTwitchSessionStore.getState()
  if (!session?.userId || !tokens?.accessToken || !session.scopes.includes('user:write:chat')) {
    return
  }

  try {
    await sendChatMessage({
      clientId: TWITCH_CLIENT_ID,
      accessToken: tokens.accessToken,
      broadcasterId: session.userId,
      senderId: session.userId,
      message,
    })
  } catch {
    // Goal progress should never fail because Twitch rejected or rate-limited an optional chat message.
  }
}
