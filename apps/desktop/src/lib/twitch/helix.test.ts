import { afterEach, describe, expect, it, vi } from 'vitest'
import { timeoutTwitchUserWithModRestore } from './helix'

const baseParams = {
  clientId: 'client',
  accessToken: 'token',
  broadcasterId: 'broadcaster',
  moderatorId: 'broadcaster',
  userId: 'target',
  durationSeconds: 30,
  reason: 'Wheel outcome',
}

function jsonResponse(payload: unknown, init?: ResponseInit) {
  return new Response(JSON.stringify(payload), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
    ...init,
  })
}

describe('timeoutTwitchUserWithModRestore', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    vi.useRealTimers()
  })

  it('times out non-moderator targets directly', async () => {
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(jsonResponse({ data: [] }))
      .mockResolvedValueOnce(jsonResponse({ data: [] }))

    await timeoutTwitchUserWithModRestore(baseParams)

    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(fetchMock.mock.calls[1][1]?.method).toBe('POST')
    expect(String(fetchMock.mock.calls[1][0])).toContain('/helix/moderation/bans')
  })

  it('removes moderators before timeout and schedules moderator restore', async () => {
    vi.useFakeTimers()
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(jsonResponse({ data: [{ user_id: 'target' }] }))
      .mockResolvedValueOnce(jsonResponse({}))
      .mockResolvedValueOnce(jsonResponse({ data: [] }))
      .mockResolvedValueOnce(jsonResponse({}))

    await timeoutTwitchUserWithModRestore(baseParams)

    expect(fetchMock).toHaveBeenCalledTimes(3)
    expect(fetchMock.mock.calls[1][1]?.method).toBe('DELETE')
    expect(String(fetchMock.mock.calls[2][0])).toContain('/helix/moderation/bans')

    await vi.advanceTimersByTimeAsync(30_000)

    expect(fetchMock).toHaveBeenCalledTimes(4)
    expect(fetchMock.mock.calls[3][1]?.method).toBe('POST')
    expect(String(fetchMock.mock.calls[3][0])).toContain('/helix/moderation/moderators')
  })

  it('restores moderator status immediately when timeout fails', async () => {
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(jsonResponse({ data: [{ user_id: 'target' }] }))
      .mockResolvedValueOnce(jsonResponse({}))
      .mockResolvedValueOnce(jsonResponse({ message: 'timeout failed' }, { status: 400 }))
      .mockResolvedValueOnce(jsonResponse({}))

    await expect(timeoutTwitchUserWithModRestore(baseParams)).rejects.toThrow('timeout failed')

    expect(fetchMock).toHaveBeenCalledTimes(4)
    expect(fetchMock.mock.calls[3][1]?.method).toBe('POST')
    expect(String(fetchMock.mock.calls[3][0])).toContain('/helix/moderation/moderators')
  })
})
