type SessionStatus = 'waiting_for_collaborators' | 'active' | 'ended'
type ParticipantRole = 'host' | 'guest'
type ConnectionStatus = 'connected' | 'disconnected'
type TwitchHealth = 'connected' | 'needs-attention' | 'not-linked'
type TipHealth = 'connected' | 'connecting' | 'error' | 'idle'
type SharedTimerStatus = 'idle' | 'running' | 'paused' | 'finished'

interface TwitchIdentity {
  userId: string
  login: string
  displayName: string
}

interface ParticipantRuntimeState {
  twitchStatus: TwitchHealth
  twitchLogin: string | null
  streamElementsStatus: TipHealth
  streamlabsStatus: TipHealth
}

interface ParticipantRecord {
  id: string
  sessionId: string
  role: ParticipantRole
  displayName: string
  connectionStatus: ConnectionStatus
  joinedAt: string
  lastSeenAt: string
  twitchIdentity: TwitchIdentity | null
  runtimeState: ParticipantRuntimeState
}

interface SessionRecord {
  id: string
  title: string
  inviteCode: string
  status: SessionStatus
  hostParticipantId: string
  participants: ParticipantRecord[]
  timerState: SharedTimerState
  createdAt: string
  updatedAt: string
}

interface SharedTimerState {
  timerStatus: SharedTimerStatus
  timerSessionBaseRemainingSeconds: number
  timerSessionBaseUptimeSeconds: number
  timerSessionRunningSince: number | null
}

interface JoinTokenRecord {
  token: string
  sessionId: string
  participantId: string
}

interface SharedSessionSocketData {
  token: string
}

const HOST = process.env.SHARED_SESSION_HOST ?? '127.0.0.1'
const PORT = Number.parseInt(process.env.SHARED_SESSION_PORT ?? '31947', 10)
const MAX_PARTICIPANTS = Number.parseInt(process.env.SHARED_SESSION_MAX_PARTICIPANTS ?? '6', 10)
const DEFAULT_TIMER_SECONDS = Number.parseInt(process.env.SHARED_SESSION_DEFAULT_TIMER_SECONDS ?? '21600', 10)

const sessions = new Map<string, SessionRecord>()
const inviteCodeIndex = new Map<string, string>()
const joinTokens = new Map<string, JoinTokenRecord>()
const sessionSockets = new Map<string, Set<ServerWebSocket<SharedSessionSocketData>>>()

const defaultRuntimeState = (): ParticipantRuntimeState => ({
  twitchStatus: 'not-linked',
  twitchLogin: null,
  streamElementsStatus: 'idle',
  streamlabsStatus: 'idle',
})

function nowIso() {
  return new Date().toISOString()
}

function sessionSnapshot(session: SessionRecord) {
  return {
    id: session.id,
    title: session.title,
    inviteCode: session.inviteCode,
    status: session.status,
    hostParticipantId: session.hostParticipantId,
    participants: session.participants,
    timerState: session.timerState,
    createdAt: session.createdAt,
    updatedAt: session.updatedAt,
  }
}

function clampTimerSeconds(value: number) {
  return Math.max(0, Math.floor(Number.isFinite(value) ? value : 0))
}

function createDefaultTimerState(): SharedTimerState {
  return {
    timerStatus: 'paused',
    timerSessionBaseRemainingSeconds: clampTimerSeconds(DEFAULT_TIMER_SECONDS),
    timerSessionBaseUptimeSeconds: 0,
    timerSessionRunningSince: null,
  }
}

function resolveTimerRuntime(timerState: SharedTimerState, now = Date.now()) {
  if (timerState.timerStatus !== 'running' || !timerState.timerSessionRunningSince) {
    return {
      timerStatus:
        timerState.timerSessionBaseRemainingSeconds <= 0 && timerState.timerStatus !== 'idle' ? 'finished' : timerState.timerStatus,
      timerRemainingSeconds: clampTimerSeconds(timerState.timerSessionBaseRemainingSeconds),
      uptimeSeconds: clampTimerSeconds(timerState.timerSessionBaseUptimeSeconds),
    }
  }

  const elapsedSeconds = clampTimerSeconds((now - timerState.timerSessionRunningSince) / 1000)
  const timerRemainingSeconds = clampTimerSeconds(timerState.timerSessionBaseRemainingSeconds - elapsedSeconds)
  const uptimeSeconds = clampTimerSeconds(timerState.timerSessionBaseUptimeSeconds + elapsedSeconds)

  return {
    timerStatus: timerRemainingSeconds <= 0 ? 'finished' : 'running',
    timerRemainingSeconds,
    uptimeSeconds,
  }
}

function collapseTimerState(timerState: SharedTimerState, nextStatus: SharedTimerStatus): SharedTimerState {
  const runtime = resolveTimerRuntime(timerState)

  return {
    timerStatus: runtime.timerRemainingSeconds <= 0 ? 'finished' : nextStatus,
    timerSessionBaseRemainingSeconds: runtime.timerRemainingSeconds,
    timerSessionBaseUptimeSeconds: runtime.uptimeSeconds,
    timerSessionRunningSince: null,
  }
}

type TimerAction =
  | { action: 'start' }
  | { action: 'pause' }
  | { action: 'reset' }
  | { action: 'adjust'; deltaSeconds: number; reason: string }
  | { action: 'set'; timerSeconds: number; reason: string }

function applyTimerAction(timerState: SharedTimerState, action: TimerAction): SharedTimerState {
  const runtime = resolveTimerRuntime(timerState)
  const wasRunning = runtime.timerStatus === 'running'
  const collapsed = {
    timerStatus: runtime.timerRemainingSeconds <= 0 ? 'finished' : wasRunning ? 'paused' : runtime.timerStatus,
    timerSessionBaseRemainingSeconds: runtime.timerRemainingSeconds,
    timerSessionBaseUptimeSeconds: runtime.uptimeSeconds,
    timerSessionRunningSince: null,
  } satisfies SharedTimerState

  switch (action.action) {
    case 'start':
      if (collapsed.timerSessionBaseRemainingSeconds <= 0) {
        return {
          ...collapsed,
          timerStatus: 'finished',
        }
      }

      return {
        timerStatus: 'running',
        timerSessionBaseRemainingSeconds: collapsed.timerSessionBaseRemainingSeconds,
        timerSessionBaseUptimeSeconds: collapsed.timerSessionBaseUptimeSeconds,
        timerSessionRunningSince: Date.now(),
      }

    case 'pause':
      return {
        ...collapsed,
        timerStatus: collapsed.timerSessionBaseRemainingSeconds <= 0 ? 'finished' : 'paused',
      }

    case 'reset':
      return createDefaultTimerState()

    case 'adjust': {
      const nextRemaining = clampTimerSeconds(collapsed.timerSessionBaseRemainingSeconds + action.deltaSeconds)
      if (wasRunning && nextRemaining > 0) {
        return {
          timerStatus: 'running',
          timerSessionBaseRemainingSeconds: nextRemaining,
          timerSessionBaseUptimeSeconds: collapsed.timerSessionBaseUptimeSeconds,
          timerSessionRunningSince: Date.now(),
        }
      }

      return {
        timerStatus: nextRemaining <= 0 ? 'finished' : collapsed.timerStatus,
        timerSessionBaseRemainingSeconds: nextRemaining,
        timerSessionBaseUptimeSeconds: collapsed.timerSessionBaseUptimeSeconds,
        timerSessionRunningSince: null,
      }
    }

    case 'set': {
      const nextRemaining = clampTimerSeconds(action.timerSeconds)
      if (wasRunning && nextRemaining > 0) {
        return {
          timerStatus: 'running',
          timerSessionBaseRemainingSeconds: nextRemaining,
          timerSessionBaseUptimeSeconds: collapsed.timerSessionBaseUptimeSeconds,
          timerSessionRunningSince: Date.now(),
        }
      }

      return {
        timerStatus: nextRemaining <= 0 ? 'finished' : collapsed.timerStatus === 'idle' ? 'paused' : collapsed.timerStatus,
        timerSessionBaseRemainingSeconds: nextRemaining,
        timerSessionBaseUptimeSeconds: collapsed.timerSessionBaseUptimeSeconds,
        timerSessionRunningSince: null,
      }
    }
  }
}

function generateInviteCode() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  let code = ''

  for (let index = 0; index < 6; index += 1) {
    code += alphabet[Math.floor(Math.random() * alphabet.length)]
  }

  return inviteCodeIndex.has(code) ? generateInviteCode() : code
}

function createJoinToken(sessionId: string, participantId: string) {
  const token = crypto.randomUUID()
  joinTokens.set(token, {
    token,
    sessionId,
    participantId,
  })
  return token
}

function getSessionByInviteCode(inviteCode: string) {
  const normalizedCode = inviteCode.trim().toUpperCase()
  const sessionId = inviteCodeIndex.get(normalizedCode)
  return sessionId ? sessions.get(sessionId) ?? null : null
}

function updateSessionStatus(session: SessionRecord) {
  const connectedCount = session.participants.filter((participant) => participant.connectionStatus === 'connected').length
  session.status = session.participants.length > 1 || connectedCount > 1 ? 'active' : 'waiting_for_collaborators'
  session.updatedAt = nowIso()
}

function broadcastSession(sessionId: string) {
  const session = sessions.get(sessionId)
  if (!session) {
    return
  }

  const sockets = sessionSockets.get(sessionId)
  if (!sockets || sockets.size === 0) {
    return
  }

  const payload = JSON.stringify({
    type: 'session.snapshot',
    payload: sessionSnapshot(session),
  })

  for (const socket of sockets) {
    socket.send(payload)
  }
}

function addSocketToSession(sessionId: string, socket: ServerWebSocket<SharedSessionSocketData>) {
  const sockets = sessionSockets.get(sessionId) ?? new Set<ServerWebSocket<SharedSessionSocketData>>()
  sockets.add(socket)
  sessionSockets.set(sessionId, sockets)
}

function removeSocketFromSession(sessionId: string, socket: ServerWebSocket<SharedSessionSocketData>) {
  const sockets = sessionSockets.get(sessionId)
  if (!sockets) {
    return
  }

  sockets.delete(socket)

  if (sockets.size === 0) {
    sessionSockets.delete(sessionId)
  }
}

function parseJsonBody(request: Request) {
  return request.json().catch(() => null)
}

function jsonResponse(payload: unknown, init?: ResponseInit) {
  return Response.json(payload, init)
}

function errorResponse(message: string, status = 400) {
  return jsonResponse({ error: message }, { status })
}

const server = Bun.serve<SharedSessionSocketData>({
  hostname: HOST,
  port: PORT,

  fetch(request, server) {
    const url = new URL(request.url)

    if (url.pathname === '/health' && request.method === 'GET') {
      return jsonResponse({
        ok: true,
        name: 'Shared Session Service',
        version: '0.1.0',
        activeSessions: sessions.size,
      })
    }

    if (url.pathname === '/sessions' && request.method === 'POST') {
      return parseJsonBody(request).then((body) => {
        const payload = body as {
          title?: string
          displayName?: string
          twitchIdentity?: TwitchIdentity | null
        } | null

        const displayName = payload?.displayName?.trim()
        if (!displayName) {
          return errorResponse('A participant label is required to create the room.')
        }

        const sessionId = crypto.randomUUID()
        const participantId = crypto.randomUUID()
        const inviteCode = generateInviteCode()
        const createdAt = nowIso()
        const title = payload?.title?.trim() || `${displayName}'s shared session`

        const participant: ParticipantRecord = {
          id: participantId,
          sessionId,
          role: 'host',
          displayName,
          connectionStatus: 'disconnected',
          joinedAt: createdAt,
          lastSeenAt: createdAt,
          twitchIdentity: payload?.twitchIdentity ?? null,
          runtimeState: defaultRuntimeState(),
        }

        const session: SessionRecord = {
          id: sessionId,
          title,
          inviteCode,
          status: 'waiting_for_collaborators',
          hostParticipantId: participantId,
          participants: [participant],
          timerState: createDefaultTimerState(),
          createdAt,
          updatedAt: createdAt,
        }

        sessions.set(sessionId, session)
        inviteCodeIndex.set(inviteCode, sessionId)

        return jsonResponse({
          session: sessionSnapshot(session),
          participantId,
          joinToken: createJoinToken(sessionId, participantId),
        })
      })
    }

    if (url.pathname === '/sessions/join' && request.method === 'POST') {
      return parseJsonBody(request).then((body) => {
        const payload = body as {
          inviteCode?: string
          displayName?: string
          twitchIdentity?: TwitchIdentity | null
        } | null

        const inviteCode = payload?.inviteCode?.trim().toUpperCase()
        const displayName = payload?.displayName?.trim()

        if (!inviteCode) {
          return errorResponse('Enter the invite code from the host app.')
        }

        if (!displayName) {
          return errorResponse('A participant label is required to join the room.')
        }

        const session = getSessionByInviteCode(inviteCode)
        if (!session) {
          return errorResponse('That invite code does not match an active shared session.', 404)
        }

        if (session.participants.length >= MAX_PARTICIPANTS) {
          return errorResponse(`This shared session already has all ${MAX_PARTICIPANTS} creator slots filled.`, 409)
        }

        const participantId = crypto.randomUUID()
        const joinedAt = nowIso()
        const participant: ParticipantRecord = {
          id: participantId,
          sessionId: session.id,
          role: 'guest',
          displayName,
          connectionStatus: 'disconnected',
          joinedAt,
          lastSeenAt: joinedAt,
          twitchIdentity: payload?.twitchIdentity ?? null,
          runtimeState: defaultRuntimeState(),
        }

        session.participants.push(participant)
        updateSessionStatus(session)

        return jsonResponse({
          session: sessionSnapshot(session),
          participantId,
          joinToken: createJoinToken(session.id, participantId),
        })
      })
    }

    if (url.pathname === '/ws' && request.method === 'GET') {
      const token = url.searchParams.get('token')?.trim()
      if (!token) {
        return errorResponse('Missing join token.', 400)
      }

      const record = joinTokens.get(token)
      if (!record) {
        return errorResponse('Join token is invalid or expired.', 401)
      }

      const upgraded = server.upgrade(request, {
        data: {
          token,
        },
      })

      if (!upgraded) {
        return errorResponse('Unable to open the shared session socket.', 500)
      }

      return undefined
    }

    return errorResponse('Not found.', 404)
  },

  websocket: {
    open(socket) {
      const token = socket.data.token
      const record = joinTokens.get(token)

      if (!record) {
        socket.send(JSON.stringify({ type: 'session.error', payload: { message: 'Join token is invalid.' } }))
        socket.close()
        return
      }

      const session = sessions.get(record.sessionId)
      const participant = session?.participants.find((candidate) => candidate.id === record.participantId)

      if (!session || !participant) {
        socket.send(JSON.stringify({ type: 'session.error', payload: { message: 'Shared session no longer exists.' } }))
        socket.close()
        return
      }

      participant.connectionStatus = 'connected'
      participant.lastSeenAt = nowIso()
      updateSessionStatus(session)
      addSocketToSession(session.id, socket)
      broadcastSession(session.id)
    },

    message(socket, rawMessage) {
      const token = socket.data.token
      const record = joinTokens.get(token)
      if (!record) {
        socket.close()
        return
      }

      const session = sessions.get(record.sessionId)
      const participant = session?.participants.find((candidate) => candidate.id === record.participantId)
      if (!session || !participant) {
        socket.close()
        return
      }

      let message:
        | { type: 'hello' }
        | { type: 'participant.status'; payload: ParticipantRuntimeState }
        | { type: 'timer.action'; payload: TimerAction }

      try {
        message = JSON.parse(String(rawMessage)) as typeof message
      } catch {
        socket.send(JSON.stringify({ type: 'session.error', payload: { message: 'Shared session message was not valid JSON.' } }))
        return
      }

      participant.lastSeenAt = nowIso()

      if (message.type === 'participant.status') {
        participant.runtimeState = {
          twitchStatus: message.payload.twitchStatus,
          twitchLogin: message.payload.twitchLogin,
          streamElementsStatus: message.payload.streamElementsStatus,
          streamlabsStatus: message.payload.streamlabsStatus,
        }

        if (!participant.twitchIdentity && message.payload.twitchLogin) {
          participant.twitchIdentity = {
            userId: participant.twitchIdentity?.userId ?? '',
            login: message.payload.twitchLogin,
            displayName: participant.twitchIdentity?.displayName ?? message.payload.twitchLogin,
          }
        }
      }

      if (message.type === 'timer.action') {
        if (participant.id !== session.hostParticipantId) {
          socket.send(JSON.stringify({ type: 'session.error', payload: { message: 'Only the host can change the shared timer right now.' } }))
          return
        }

        session.timerState = applyTimerAction(session.timerState, message.payload)
      }

      updateSessionStatus(session)
      broadcastSession(session.id)
    },

    close(socket) {
      const token = socket.data.token
      const record = joinTokens.get(token)
      if (!record) {
        return
      }

      const session = sessions.get(record.sessionId)
      const participant = session?.participants.find((candidate) => candidate.id === record.participantId)
      if (!session || !participant) {
        return
      }

      participant.connectionStatus = 'disconnected'
      participant.lastSeenAt = nowIso()
      updateSessionStatus(session)
      removeSocketFromSession(session.id, socket)
      broadcastSession(session.id)
    },
  },
})

console.log(`Shared Session Service listening on http://${HOST}:${server.port}`)
