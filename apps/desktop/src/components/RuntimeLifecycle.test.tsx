// @vitest-environment jsdom

import { StrictMode } from 'react'
import { render, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { RuntimeLifecycle } from './RuntimeLifecycle'
import * as nativeAppStateModule from '../lib/platform/nativeAppState'
import * as overlayRuntimeModule from '../lib/platform/overlayRuntime'
import * as twitchHelixModule from '../lib/twitch/helix'
import { useAppStore } from '../state/useAppStore'
import { useEventSubStore } from '../state/useEventSubStore'
import { useGoalsStore } from '../state/useGoalsStore'
import { useTipSessionStore } from '../state/useTipSessionStore'
import { useTwitchSessionStore } from '../state/useTwitchSessionStore'

vi.mock('../lib/platform/nativeAppState', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/platform/nativeAppState')>()
  return {
    ...actual,
    loadNativeAppSnapshot: vi.fn(async () => null),
    saveNativeAppSnapshot: vi.fn(async () => undefined),
  }
})

vi.mock('../lib/platform/overlayRuntime', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/platform/overlayRuntime')>()
  return {
    ...actual,
    getOverlayBootstrapState: vi.fn(async () => ({
      overlayBaseUrl: null,
      overlayPreviewBaseUrl: null,
      overlayLanBaseUrl: null,
      overlayLanAccessEnabled: false,
    })),
    setOverlayNetworkMode: vi.fn(async (lanEnabled: boolean) => ({
      overlayBaseUrl: null,
      overlayPreviewBaseUrl: null,
      overlayLanBaseUrl: null,
      overlayLanAccessEnabled: lanEnabled,
    })),
    syncOverlayRuntime: vi.fn(async () => undefined),
  }
})

vi.mock('../lib/twitch/helix', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/twitch/helix')>()
  return {
    ...actual,
    sendChatMessage: vi.fn(async () => ({
      messageId: 'chat-message-1',
      droppedCode: null,
      droppedMessage: null,
    })),
  }
})

describe('RuntimeLifecycle', () => {
  beforeEach(() => {
    useAppStore.setState(useAppStore.getInitialState(), true)
    useEventSubStore.setState(useEventSubStore.getInitialState(), true)
    useGoalsStore.setState(useGoalsStore.getInitialState(), true)
    useTipSessionStore.setState(useTipSessionStore.getInitialState(), true)
    useTwitchSessionStore.setState(useTwitchSessionStore.getInitialState(), true)
    vi.mocked(nativeAppStateModule.loadNativeAppSnapshot).mockClear()
    vi.mocked(nativeAppStateModule.saveNativeAppSnapshot).mockClear()
    vi.mocked(overlayRuntimeModule.getOverlayBootstrapState).mockClear()
    vi.mocked(overlayRuntimeModule.setOverlayNetworkMode).mockClear()
    vi.mocked(overlayRuntimeModule.syncOverlayRuntime).mockClear()
    vi.mocked(twitchHelixModule.sendChatMessage).mockClear()
  })

  it('renders the runtime hook composition without entering a write loop', async () => {
    const { unmount } = render(
      <StrictMode>
        <RuntimeLifecycle />
      </StrictMode>,
    )

    await waitFor(() => {
      expect(nativeAppStateModule.loadNativeAppSnapshot).toHaveBeenCalled()
      expect(overlayRuntimeModule.getOverlayBootstrapState).toHaveBeenCalled()
      expect(overlayRuntimeModule.syncOverlayRuntime).toHaveBeenCalled()
      expect(nativeAppStateModule.saveNativeAppSnapshot).toHaveBeenCalled()
    })

    unmount()

    expect(vi.mocked(nativeAppStateModule.saveNativeAppSnapshot).mock.calls.length).toBeLessThan(6)
    expect(vi.mocked(overlayRuntimeModule.syncOverlayRuntime).mock.calls.length).toBeLessThan(6)
  })

  it('feeds Twitch EventSub support events into goals independently from timer rules', async () => {
    const ladderId = useGoalsStore.getState().createLadder({
      title: 'Bits ladder',
      sourceMode: 'single-source',
      sourceType: 'bits',
      unitLabel: 'bits',
      milestones: [
        {
          thresholdAmount: 100,
          rewardTitle: 'Eat a bean',
        },
      ],
    })
    useAppStore.setState((state) => ({
      ruleConfig: {
        ...state.ruleConfig,
        cheerEnabled: false,
      },
    }))

    const { unmount } = render(
      <StrictMode>
        <RuntimeLifecycle />
      </StrictMode>,
    )

    await waitFor(() => {
      expect(nativeAppStateModule.loadNativeAppSnapshot).toHaveBeenCalled()
    })

    useEventSubStore.setState({
      normalizedEvents: [
        {
          id: 'cheer-goal-only',
          source: 'twitch-eventsub',
          eventType: 'cheer',
          occurredAt: '2026-05-16T12:00:00.000Z',
          userId: 'user-1',
          userLogin: 'viewer',
          displayName: 'Viewer',
          anonymous: false,
          amount: 150,
          currency: null,
          tier: null,
          count: null,
          command: null,
          rawPayload: {},
        },
      ],
    })

    await waitFor(() => {
      const ladder = useGoalsStore.getState().ladders.find((entry) => entry.id === ladderId)
      expect(ladder?.currentAmount).toBe(150)
      expect(ladder?.milestones[0]?.status).toBe('completed')
    })

    expect(useAppStore.getState().timerEvents).toHaveLength(0)

    unmount()
  })

  it('does not count Twitch follow events toward support reward ladders', async () => {
    const ladderId = useGoalsStore.getState().createLadder({
      title: 'Sub ladder',
      sourceMode: 'single-source',
      sourceType: 'subscriptions',
      unitLabel: 'subs',
      milestones: [
        {
          thresholdAmount: 1,
          rewardTitle: 'Chat picks a song',
        },
      ],
    })
    const { unmount } = render(
      <StrictMode>
        <RuntimeLifecycle />
      </StrictMode>,
    )

    await waitFor(() => {
      expect(nativeAppStateModule.loadNativeAppSnapshot).toHaveBeenCalled()
    })

    useEventSubStore.setState({
      normalizedEvents: [
        {
          id: 'follow-not-goal',
          source: 'twitch-eventsub',
          eventType: 'follow',
          occurredAt: '2026-05-16T12:00:00.000Z',
          userId: 'user-2',
          userLogin: 'follower',
          displayName: 'Follower',
          anonymous: false,
          amount: null,
          currency: null,
          tier: null,
          count: null,
          command: null,
          rawPayload: {},
        },
      ],
    })

    await waitFor(() => {
      expect(useEventSubStore.getState().normalizedEvents).toHaveLength(1)
    })

    const ladder = useGoalsStore.getState().ladders.find((entry) => entry.id === ladderId)
    expect(ladder?.currentAmount).toBe(0)
    expect(ladder?.milestones[0]?.status).toBe('locked')

    unmount()
  })

  it('feeds provider tip events into goals independently from timer rules', async () => {
    const ladderId = useGoalsStore.getState().createLadder({
      title: 'Tip ladder',
      sourceMode: 'single-source',
      sourceType: 'tips',
      unitLabel: 'USD',
      milestones: [
        {
          thresholdAmount: 25,
          rewardTitle: 'Hot sauce shot',
        },
      ],
    })
    useAppStore.setState((state) => ({
      ruleConfig: {
        ...state.ruleConfig,
        tipEnabled: false,
      },
    }))

    const { unmount } = render(
      <StrictMode>
        <RuntimeLifecycle />
      </StrictMode>,
    )

    await waitFor(() => {
      expect(nativeAppStateModule.loadNativeAppSnapshot).toHaveBeenCalled()
    })

    useTipSessionStore.setState({
      normalizedEvents: [
        {
          id: 'streamlabs-tip-goal-only',
          source: 'streamlabs',
          eventType: 'tip',
          occurredAt: '2026-05-16T12:00:00.000Z',
          userId: null,
          userLogin: null,
          displayName: 'Tipper',
          anonymous: false,
          amount: 30,
          currency: 'USD',
          tier: null,
          count: null,
          command: null,
          rawPayload: {},
        },
      ],
    })

    await waitFor(() => {
      const ladder = useGoalsStore.getState().ladders.find((entry) => entry.id === ladderId)
      expect(ladder?.currentAmount).toBe(30)
      expect(ladder?.milestones[0]?.status).toBe('completed')
    })

    expect(useAppStore.getState().timerEvents).toHaveLength(0)

    unmount()
  })

  it('announces completed goal milestones in Twitch chat when enabled', async () => {
    useGoalsStore.setState({ announceGoalCompletionsInChat: true })
    useTwitchSessionStore.setState({
      status: 'connected',
      tokens: {
        accessToken: 'access-token',
        refreshToken: 'refresh-token',
        expiresAt: Date.now() + 60_000,
      },
      session: {
        clientId: 'client-id',
        login: 'streamer',
        userId: 'broadcaster-1',
        scopes: ['user:write:chat'],
        expiresIn: 60_000,
        validatedAt: Date.now(),
      },
    })
    useGoalsStore.getState().createLadder({
      title: 'Bits ladder',
      sourceMode: 'single-source',
      sourceType: 'bits',
      unitLabel: 'bits',
      milestones: [
        {
          thresholdAmount: 100,
          rewardTitle: 'Eat a bean',
        },
      ],
    })

    const { unmount } = render(
      <StrictMode>
        <RuntimeLifecycle />
      </StrictMode>,
    )

    await waitFor(() => {
      expect(nativeAppStateModule.loadNativeAppSnapshot).toHaveBeenCalled()
    })

    useEventSubStore.setState({
      normalizedEvents: [
        {
          id: 'cheer-goal-announcement',
          source: 'twitch-eventsub',
          eventType: 'cheer',
          occurredAt: '2026-05-16T12:00:00.000Z',
          userId: 'user-1',
          userLogin: 'viewer',
          displayName: 'Viewer',
          anonymous: false,
          amount: 150,
          currency: null,
          tier: null,
          count: null,
          command: null,
          rawPayload: {},
        },
      ],
    })

    await waitFor(() => {
      expect(twitchHelixModule.sendChatMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          broadcasterId: 'broadcaster-1',
          senderId: 'broadcaster-1',
          message: 'Goal unlocked: Eat a bean at 100 bits!',
        }),
      )
    })

    unmount()
  })
})
