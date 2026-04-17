import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { createSharedSessionServer } from './createServer'

// ---------------------------------------------------------------------------
// Test server lifecycle
// ---------------------------------------------------------------------------

let baseUrl: string
let wsBase: string
let stopServer: () => Promise<void>

beforeAll(() => {
  const { port, stop } = createSharedSessionServer({
    port: 0, // Bun assigns an available port
    maxParticipants: 3,
    defaultTimerSeconds: 3600,
  })

  baseUrl = `http://127.0.0.1:${port}`
  wsBase = `ws://127.0.0.1:${port}`
  stopServer = stop
})

afterAll(() => stopServer())

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function post(path: string, body: unknown) {
  const response = await fetch(`${baseUrl}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })

  return {
    status: response.status,
    body: (await response.json()) as Record<string, unknown>,
  }
}

interface WsHandle {
  ws: WebSocket
  received: unknown[]
  /** Returns the next message, waiting up to timeoutMs if none has arrived yet. */
  nextMessage: (timeoutMs?: number) => Promise<unknown>
  close: () => void
}

function openWs(token: string): Promise<WsHandle> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`${wsBase}/ws?token=${encodeURIComponent(token)}`)
    const received: unknown[] = []
    let readIndex = 0
    let opened = false

    // Resolvers waiting for the next message when the queue is empty
    const waiters: Array<(value: unknown) => void> = []

    ws.onmessage = (event) => {
      const parsed = JSON.parse(String(event.data)) as unknown
      received.push(parsed)

      const waiter = waiters.shift()
      if (waiter) {
        waiter(parsed)
      }
    }

    ws.onerror = () => {
      if (!opened) {
        reject(new Error('WebSocket connection error'))
      }
    }

    ws.onclose = () => {
      // If onopen never fired this was a failed upgrade (e.g. 401 response).
      if (!opened) {
        reject(new Error('WebSocket closed before handshake completed'))
      }
    }

    ws.onopen = () => {
      opened = true
      resolve({
        ws,
        received,
        nextMessage(timeoutMs = 3000) {
          return new Promise((res, rej) => {
            // If a message already arrived and hasn't been consumed, return it immediately.
            if (readIndex < received.length) {
              res(received[readIndex++])
              return
            }

            const timer = setTimeout(() => {
              rej(new Error('nextMessage timed out'))
            }, timeoutMs)

            waiters.push((msg) => {
              clearTimeout(timer)
              readIndex++
              res(msg)
            })
          })
        },
        close() {
          ws.onclose = null
          ws.close()
        },
      })
    }
  })
}

function send(ws: WebSocket, message: unknown) {
  ws.send(JSON.stringify(message))
}

// ---------------------------------------------------------------------------
// Session create / join
// ---------------------------------------------------------------------------

describe('POST /sessions', () => {
  test('creates a session and returns snapshot + joinToken', async () => {
    const { status, body } = await post('/sessions', {
      displayName: 'StreamerA',
      title: 'Test session',
    })

    expect(status).toBe(200)
    expect(typeof body.joinToken).toBe('string')
    expect(typeof body.participantId).toBe('string')

    const session = body.session as Record<string, unknown>
    expect(session.title).toBe('Test session')
    expect(session.status).toBe('waiting_for_collaborators')
    expect((session.participants as unknown[]).length).toBe(1)
  })

  test('returns 400 when displayName is missing', async () => {
    const { status } = await post('/sessions', { title: 'No name' })
    expect(status).toBe(400)
  })
})

describe('POST /sessions/join', () => {
  test('joins with valid invite code', async () => {
    const { body: created } = await post('/sessions', { displayName: 'Host' })
    const session = created.session as Record<string, unknown>

    const { status, body: joined } = await post('/sessions/join', {
      inviteCode: session.inviteCode,
      displayName: 'Guest',
    })

    expect(status).toBe(200)
    expect(typeof (joined as Record<string, unknown>).joinToken).toBe('string')

    const joinedSession = (joined as Record<string, unknown>).session as Record<string, unknown>
    expect((joinedSession.participants as unknown[]).length).toBe(2)
  })

  test('returns 404 for unknown invite code', async () => {
    const { status } = await post('/sessions/join', {
      inviteCode: 'XXXXXX',
      displayName: 'Nobody',
    })

    expect(status).toBe(404)
  })

  test('returns 409 when session is at capacity', async () => {
    const { body: created } = await post('/sessions', { displayName: 'Host' })
    const session = created.session as Record<string, unknown>
    const code = session.inviteCode as string

    await post('/sessions/join', { inviteCode: code, displayName: 'Guest1' })
    await post('/sessions/join', { inviteCode: code, displayName: 'Guest2' })

    // maxParticipants is 3 for the test server, so 4th should fail
    const { status } = await post('/sessions/join', { inviteCode: code, displayName: 'Guest3' })
    expect(status).toBe(409)
  })
})

// ---------------------------------------------------------------------------
// WebSocket presence and reconnect
// ---------------------------------------------------------------------------

describe('WebSocket connect', () => {
  test('receives session snapshot on connect', async () => {
    const { body } = await post('/sessions', { displayName: 'Host' })
    const handle = await openWs(body.joinToken as string)

    const msg = await handle.nextMessage()
    expect((msg as Record<string, unknown>).type).toBe('session.snapshot')
    handle.close()
  })

  test('reconnect with same token delivers a fresh snapshot', async () => {
    const { body } = await post('/sessions', { displayName: 'Host' })
    const token = body.joinToken as string

    // First connection
    const first = await openWs(token)
    await first.nextMessage() // snapshot
    first.close()

    // Small delay so the close propagates
    await new Promise((r) => setTimeout(r, 50))

    // Reconnect with the same token
    const second = await openWs(token)
    const snapshot = await second.nextMessage()
    expect((snapshot as Record<string, unknown>).type).toBe('session.snapshot')
    second.close()
  })

  test('invalid token is rejected', async () => {
    await expect(openWs('invalid-token-xyz')).rejects.toThrow()
  })
})

// ---------------------------------------------------------------------------
// Rejoin endpoint
// ---------------------------------------------------------------------------

describe('POST /sessions/:id/rejoin', () => {
  test('returns a fresh token for an existing participant', async () => {
    const { body } = await post('/sessions', { displayName: 'Host' })
    const sessionId = (body.session as Record<string, unknown>).id as string
    const participantId = body.participantId as string

    const { status, body: rejoinBody } = await post(`/sessions/${sessionId}/rejoin`, {
      participantId,
    })

    expect(status).toBe(200)
    expect(typeof (rejoinBody as Record<string, unknown>).joinToken).toBe('string')
    // Fresh token should be different from the original
    expect((rejoinBody as Record<string, unknown>).joinToken).not.toBe(body.joinToken)
  })

  test('returns 404 for unknown session', async () => {
    const { status } = await post('/sessions/no-such-session/rejoin', {
      participantId: 'some-id',
    })

    expect(status).toBe(404)
  })

  test('returns 404 for unknown participantId', async () => {
    const { body } = await post('/sessions', { displayName: 'Host' })
    const sessionId = (body.session as Record<string, unknown>).id as string

    const { status } = await post(`/sessions/${sessionId}/rejoin`, {
      participantId: 'not-a-real-participant',
    })

    expect(status).toBe(404)
  })

  test('reconnect via rejoin token delivers a snapshot', async () => {
    const { body } = await post('/sessions', { displayName: 'Host' })
    const sessionId = (body.session as Record<string, unknown>).id as string
    const participantId = body.participantId as string

    const { body: rejoinBody } = await post(`/sessions/${sessionId}/rejoin`, { participantId })
    const handle = await openWs((rejoinBody as Record<string, unknown>).joinToken as string)
    const msg = await handle.nextMessage()

    expect((msg as Record<string, unknown>).type).toBe('session.snapshot')
    handle.close()
  })
})

// ---------------------------------------------------------------------------
// Timer event dedupe
// ---------------------------------------------------------------------------

describe('Twitch event dedupe', () => {
  test('applying the same event twice does not double-apply', async () => {
    const { body } = await post('/sessions', { displayName: 'Host' })
    const handle = await openWs(body.joinToken as string)
    await handle.nextMessage() // initial snapshot

    const event = {
      id: 'evt-unique-001',
      source: 'twitch-eventsub',
      eventType: 'subscription_tier1',
      userId: 'u1',
      userLogin: 'viewer1',
      displayName: 'Viewer1',
      count: null,
      amount: null,
      currency: null,
      message: '',
      months: null,
      streakMonths: null,
      durationMonths: null,
      isGift: false,
      isAnonymous: false,
      timestamp: Date.now(),
    }

    send(handle.ws, { type: 'twitch.event', payload: event })
    const snap1 = (await handle.nextMessage()) as Record<string, unknown>
    const timer1 = (
      (snap1 as Record<string, unknown>).payload as Record<string, unknown>
    ).timerState as Record<string, unknown>
    const remaining1 = timer1.timerSessionBaseRemainingSeconds as number

    // Submit the identical event again
    send(handle.ws, { type: 'twitch.event', payload: event })
    const snap2 = (await handle.nextMessage()) as Record<string, unknown>
    const timer2 = (
      (snap2 as Record<string, unknown>).payload as Record<string, unknown>
    ).timerState as Record<string, unknown>
    const remaining2 = timer2.timerSessionBaseRemainingSeconds as number

    // The second submit still triggers a broadcast (status sync), but timer should not change
    expect(remaining2).toBe(remaining1)

    handle.close()
  })

  test('non-tip streamelements event is ignored', async () => {
    const { body } = await post('/sessions', { displayName: 'Host' })
    const handle = await openWs(body.joinToken as string)
    await handle.nextMessage() // initial snapshot

    const initialTimer = (
      (
        (
          handle.received[handle.received.length - 1] as Record<string, unknown>
        ).payload as Record<string, unknown>
      ).timerState as Record<string, unknown>
    ).timerSessionBaseRemainingSeconds as number

    // StreamElements follow (non-tip) should be rejected
    send(handle.ws, {
      type: 'tip.event',
      payload: {
        id: 'se-follow-001',
        source: 'streamelements',
        eventType: 'follow', // not a tip
        userId: null,
        userLogin: null,
        displayName: 'Viewer',
        count: null,
        amount: null,
        currency: null,
        message: '',
        months: null,
        streakMonths: null,
        durationMonths: null,
        isGift: false,
        isAnonymous: false,
        timestamp: Date.now(),
      },
    })

    const snap = (await handle.nextMessage()) as Record<string, unknown>
    const timer = (
      (snap as Record<string, unknown>).payload as Record<string, unknown>
    ).timerState as Record<string, unknown>
    const remaining = timer.timerSessionBaseRemainingSeconds as number

    expect(remaining).toBe(initialTimer)
    handle.close()
  })
})

// ---------------------------------------------------------------------------
// Timer actions (host only)
// ---------------------------------------------------------------------------

describe('Timer actions', () => {
  test('host can start and pause the shared timer', async () => {
    const { body } = await post('/sessions', { displayName: 'Host' })
    const handle = await openWs(body.joinToken as string)
    await handle.nextMessage()

    send(handle.ws, { type: 'timer.action', payload: { action: 'start' } })
    const startSnap = (await handle.nextMessage()) as Record<string, unknown>
    const timerAfterStart = (
      (startSnap.payload as Record<string, unknown>).timerState as Record<string, unknown>
    ).timerStatus

    expect(timerAfterStart).toBe('running')

    send(handle.ws, { type: 'timer.action', payload: { action: 'pause' } })
    const pauseSnap = (await handle.nextMessage()) as Record<string, unknown>
    const timerAfterPause = (
      (pauseSnap.payload as Record<string, unknown>).timerState as Record<string, unknown>
    ).timerStatus

    expect(timerAfterPause).toBe('paused')
    handle.close()
  })

  test('guest receives error when attempting a timer action', async () => {
    const { body: hostBody } = await post('/sessions', { displayName: 'Host' })
    const hostSession = hostBody.session as Record<string, unknown>

    const { body: guestBody } = await post('/sessions/join', {
      inviteCode: hostSession.inviteCode,
      displayName: 'Guest',
    })

    const guestHandle = await openWs((guestBody as Record<string, unknown>).joinToken as string)
    await guestHandle.nextMessage() // snapshot

    send(guestHandle.ws, { type: 'timer.action', payload: { action: 'start' } })
    const errorMsg = (await guestHandle.nextMessage()) as Record<string, unknown>

    expect(errorMsg.type).toBe('session.error')
    guestHandle.close()
  })
})

// ---------------------------------------------------------------------------
// Session end
// ---------------------------------------------------------------------------

describe('Session end', () => {
  test('host can end the session and all sockets receive session.ended', async () => {
    const { body: hostBody } = await post('/sessions', { displayName: 'Host' })
    const hostHandle = await openWs(hostBody.joinToken as string)
    await hostHandle.nextMessage()

    const { body: guestBody } = await post('/sessions/join', {
      inviteCode: (hostBody.session as Record<string, unknown>).inviteCode,
      displayName: 'Guest',
    })
    const guestHandle = await openWs((guestBody as Record<string, unknown>).joinToken as string)
    // The guest receives a snapshot on connect and the host also receives one due to presence change
    await guestHandle.nextMessage() // guest snapshot
    // drain any presence-change snapshot on host
    await hostHandle.nextMessage()

    send(hostHandle.ws, { type: 'session.end' })

    const endedMsg = (await guestHandle.nextMessage()) as Record<string, unknown>
    expect(endedMsg.type).toBe('session.ended')
  })

  test('guest cannot end the session', async () => {
    const { body: hostBody } = await post('/sessions', { displayName: 'Host' })
    await openWs(hostBody.joinToken as string).then(async (h) => {
      await h.nextMessage()
      h.close()
    })

    const { body: guestBody } = await post('/sessions/join', {
      inviteCode: (hostBody.session as Record<string, unknown>).inviteCode,
      displayName: 'Guest',
    })
    const guestHandle = await openWs((guestBody as Record<string, unknown>).joinToken as string)
    await guestHandle.nextMessage()

    send(guestHandle.ws, { type: 'session.end' })
    const errorMsg = (await guestHandle.nextMessage()) as Record<string, unknown>

    expect(errorMsg.type).toBe('session.error')
    guestHandle.close()
  })

  test('joining an ended session returns 410', async () => {
    const { body: hostBody } = await post('/sessions', { displayName: 'Host' })
    const hostHandle = await openWs(hostBody.joinToken as string)
    await hostHandle.nextMessage()

    send(hostHandle.ws, { type: 'session.end' })
    await new Promise((r) => setTimeout(r, 100))

    const { status } = await post('/sessions/join', {
      inviteCode: (hostBody.session as Record<string, unknown>).inviteCode,
      displayName: 'LateJoiner',
    })

    expect(status).toBe(410)
  })

  test('rejoin on an ended session returns 410', async () => {
    const { body: hostBody } = await post('/sessions', { displayName: 'Host' })
    const sessionId = (hostBody.session as Record<string, unknown>).id as string
    const participantId = hostBody.participantId as string

    const hostHandle = await openWs(hostBody.joinToken as string)
    await hostHandle.nextMessage()
    send(hostHandle.ws, { type: 'session.end' })
    await new Promise((r) => setTimeout(r, 100))

    const { status } = await post(`/sessions/${sessionId}/rejoin`, { participantId })
    expect(status).toBe(410)
  })
})

// ---------------------------------------------------------------------------
// Health endpoint
// ---------------------------------------------------------------------------

describe('GET /health', () => {
  test('returns ok', async () => {
    const response = await fetch(`${baseUrl}/health`)
    const body = (await response.json()) as Record<string, unknown>

    expect(response.status).toBe(200)
    expect(body.ok).toBe(true)
    expect(typeof body.activeSessions).toBe('number')
  })
})
