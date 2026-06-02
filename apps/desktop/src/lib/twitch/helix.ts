interface HelixChatter {
  userId: string
  userLogin: string
  userName: string
}

interface HelixErrorPayload {
  message?: string
  error?: string
}

interface HelixSendChatMessageResponse {
  messageId: string | null
  droppedCode: string | null
  droppedMessage: string | null
}

async function parseJson(response: Response) {
  try {
    return (await response.json()) as Record<string, unknown>
  } catch {
    return {}
  }
}

async function isChannelModerator(params: {
  clientId: string
  accessToken: string
  broadcasterId: string
  userId: string
}) {
  const url = new URL('https://api.twitch.tv/helix/moderation/moderators')
  url.searchParams.set('broadcaster_id', params.broadcasterId)
  url.searchParams.set('user_id', params.userId)

  const response = await fetch(url, {
    headers: {
      'Client-Id': params.clientId,
      Authorization: `Bearer ${params.accessToken}`,
    },
  })

  const payload = (await parseJson(response)) as {
    data?: Array<{ user_id?: string }>
  } & HelixErrorPayload

  if (!response.ok) {
    throw new Error(buildErrorMessage(payload as Record<string, unknown>, 'Failed to check Twitch moderator status.'))
  }

  return (payload.data ?? []).some((moderator) => moderator.user_id === params.userId)
}

async function removeChannelModerator(params: {
  clientId: string
  accessToken: string
  broadcasterId: string
  userId: string
}) {
  const url = new URL('https://api.twitch.tv/helix/moderation/moderators')
  url.searchParams.set('broadcaster_id', params.broadcasterId)
  url.searchParams.set('user_id', params.userId)

  const response = await fetch(url, {
    method: 'DELETE',
    headers: {
      'Client-Id': params.clientId,
      Authorization: `Bearer ${params.accessToken}`,
    },
  })

  const payload = await parseJson(response)

  if (!response.ok) {
    throw new Error(buildErrorMessage(payload, 'Failed to temporarily remove Twitch moderator status.'))
  }
}

async function addChannelModerator(params: {
  clientId: string
  accessToken: string
  broadcasterId: string
  userId: string
}) {
  const url = new URL('https://api.twitch.tv/helix/moderation/moderators')
  url.searchParams.set('broadcaster_id', params.broadcasterId)
  url.searchParams.set('user_id', params.userId)

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Client-Id': params.clientId,
      Authorization: `Bearer ${params.accessToken}`,
    },
  })

  const payload = await parseJson(response)

  if (!response.ok) {
    throw new Error(buildErrorMessage(payload, 'Failed to restore Twitch moderator status.'))
  }
}

function buildErrorMessage(payload: Record<string, unknown>, fallback: string) {
  const message = payload.message
  const error = payload.error

  if (typeof message === 'string' && message.trim().length > 0) {
    return message
  }

  if (typeof error === 'string' && error.trim().length > 0) {
    return error
  }

  return fallback
}

export async function timeoutUser(params: {
  clientId: string
  accessToken: string
  broadcasterId: string
  moderatorId: string
  userId: string
  durationSeconds: number
  reason?: string
}) {
  const url = new URL('https://api.twitch.tv/helix/moderation/bans')
  url.searchParams.set('broadcaster_id', params.broadcasterId)
  url.searchParams.set('moderator_id', params.moderatorId)

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Client-Id': params.clientId,
      Authorization: `Bearer ${params.accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      data: {
        user_id: params.userId,
        duration: params.durationSeconds,
        reason: params.reason ?? 'Wheel outcome',
      },
    }),
  })

  const payload = await parseJson(response)

  if (!response.ok) {
    throw new Error(buildErrorMessage(payload, 'Failed to apply Twitch timeout.'))
  }

  return payload
}

export async function timeoutTwitchUserWithModRestore(params: {
  clientId: string
  accessToken: string
  broadcasterId: string
  moderatorId: string
  userId: string
  durationSeconds: number
  reason?: string
}) {
  const targetWasModerator = await isChannelModerator(params)

  if (!targetWasModerator) {
    return timeoutUser(params)
  }

  await removeChannelModerator(params)

  try {
    const timeoutResult = await timeoutUser(params)

    // Twitch does not restore moderator status automatically after timeout expiry.
    // This in-process timer is lost if the app exits before the timeout ends.
    globalThis.setTimeout(() => {
      void addChannelModerator(params)
    }, Math.max(1, params.durationSeconds) * 1000)

    return timeoutResult
  } catch (error) {
    await addChannelModerator(params)
    throw error
  }
}

export async function getChatters(params: {
  clientId: string
  accessToken: string
  broadcasterId: string
  moderatorId: string
}) {
  const url = new URL('https://api.twitch.tv/helix/chat/chatters')
  url.searchParams.set('broadcaster_id', params.broadcasterId)
  url.searchParams.set('moderator_id', params.moderatorId)
  url.searchParams.set('first', '100')

  const response = await fetch(url, {
    headers: {
      'Client-Id': params.clientId,
      Authorization: `Bearer ${params.accessToken}`,
    },
  })

  const payload = (await response.json()) as {
    data?: Array<{
      user_id?: string
      user_login?: string
      user_name?: string
    }>
  } & HelixErrorPayload

  if (!response.ok) {
    throw new Error(buildErrorMessage(payload as Record<string, unknown>, 'Failed to read chatters from Twitch.'))
  }

  return (payload.data ?? [])
    .filter((entry) => entry.user_id && entry.user_login && entry.user_name)
    .map(
      (entry): HelixChatter => ({
        userId: entry.user_id as string,
        userLogin: entry.user_login as string,
        userName: entry.user_name as string,
      }),
    )
}

export async function sendChatMessage(params: {
  clientId: string
  accessToken: string
  broadcasterId: string
  senderId: string
  message: string
  replyParentMessageId?: string | null
}) {
  const response = await fetch('https://api.twitch.tv/helix/chat/messages', {
    method: 'POST',
    headers: {
      'Client-Id': params.clientId,
      Authorization: `Bearer ${params.accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      broadcaster_id: params.broadcasterId,
      sender_id: params.senderId,
      message: params.message,
      reply_parent_message_id: params.replyParentMessageId ?? undefined,
    }),
  })

  const payload = (await parseJson(response)) as {
    data?: Array<{
      message_id?: string
      is_sent?: boolean
      drop_reason?: {
        code?: string
        message?: string
      }
    }>
  } & HelixErrorPayload

  if (!response.ok || !payload.data?.[0]) {
    throw new Error(buildErrorMessage(payload as Record<string, unknown>, 'Failed to send a Twitch chat message.'))
  }

  const result = payload.data[0]
  const dropReason = result.drop_reason

  if (result.is_sent === false || dropReason?.message) {
    throw new Error(dropReason?.message || 'Twitch rejected the chat message.')
  }

  return {
    messageId: typeof result.message_id === 'string' ? result.message_id : null,
    droppedCode: typeof dropReason?.code === 'string' ? dropReason.code : null,
    droppedMessage: typeof dropReason?.message === 'string' ? dropReason.message : null,
  } satisfies HelixSendChatMessageResponse
}
