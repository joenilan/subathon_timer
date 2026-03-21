export const TWITCH_CLIENT_ID =
  import.meta.env.VITE_TWITCH_CLIENT_ID?.trim() || '0opot2aae0mbxanet7loi1obm6vxfe'

export const TWITCH_SCOPES = [
  'channel:read:subscriptions',
  'bits:read',
  'moderator:read:followers',
  'moderator:manage:banned_users',
  'moderator:read:chatters',
  'user:read:chat',
  'user:write:chat',
] as const

export const TWITCH_SCOPE_LABELS: Record<(typeof TWITCH_SCOPES)[number], string> = {
  'channel:read:subscriptions': 'Read subscriptions, gift subs, and resub activity.',
  'bits:read': 'Read cheer and Bits events.',
  'moderator:read:followers': 'Read follower events when the broadcaster account is connected.',
  'moderator:manage:banned_users': 'Apply timeout wheel outcomes through Helix moderation.',
  'moderator:read:chatters': 'Pick a real random chatter when the wheel selects a random timeout.',
  'user:read:chat': 'Listen for moderator timer commands from Twitch chat.',
  'user:write:chat': 'Reply in chat with timer command help and status feedback.',
}

export const TWITCH_SCOPE_STRING = TWITCH_SCOPES.join(' ')
export const TWITCH_VALIDATE_INTERVAL_MS = 60 * 60 * 1000
export const TWITCH_REFRESH_EARLY_MS = 5 * 60 * 1000
