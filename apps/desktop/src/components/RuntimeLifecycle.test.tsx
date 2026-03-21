// @vitest-environment jsdom

import { StrictMode } from 'react'
import { render, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { RuntimeLifecycle } from './RuntimeLifecycle'
import { useAppStore } from '../state/useAppStore'
import { useEventSubStore } from '../state/useEventSubStore'
import { useTwitchSessionStore } from '../state/useTwitchSessionStore'

const nativeAppStateMocks = vi.hoisted(() => ({
  loadNativeAppSnapshot: vi.fn(async () => null),
  saveNativeAppSnapshot: vi.fn(async () => undefined),
}))

const overlayRuntimeMocks = vi.hoisted(() => ({
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
}))

vi.mock('../lib/platform/nativeAppState', async () => {
  const actual = await vi.importActual<typeof import('../lib/platform/nativeAppState')>('../lib/platform/nativeAppState')
  return {
    ...actual,
    loadNativeAppSnapshot: nativeAppStateMocks.loadNativeAppSnapshot,
    saveNativeAppSnapshot: nativeAppStateMocks.saveNativeAppSnapshot,
  }
})

vi.mock('../lib/platform/overlayRuntime', async () => {
  const actual = await vi.importActual<typeof import('../lib/platform/overlayRuntime')>('../lib/platform/overlayRuntime')
  return {
    ...actual,
    getOverlayBootstrapState: overlayRuntimeMocks.getOverlayBootstrapState,
    setOverlayNetworkMode: overlayRuntimeMocks.setOverlayNetworkMode,
    syncOverlayRuntime: overlayRuntimeMocks.syncOverlayRuntime,
  }
})

describe('RuntimeLifecycle', () => {
  beforeEach(() => {
    useAppStore.setState(useAppStore.getInitialState(), true)
    useEventSubStore.setState(useEventSubStore.getInitialState(), true)
    useTwitchSessionStore.setState(useTwitchSessionStore.getInitialState(), true)
    nativeAppStateMocks.loadNativeAppSnapshot.mockClear()
    nativeAppStateMocks.saveNativeAppSnapshot.mockClear()
    overlayRuntimeMocks.getOverlayBootstrapState.mockClear()
    overlayRuntimeMocks.setOverlayNetworkMode.mockClear()
    overlayRuntimeMocks.syncOverlayRuntime.mockClear()
  })

  it('renders the runtime hook composition without entering a write loop', async () => {
    const { unmount } = render(
      <StrictMode>
        <RuntimeLifecycle />
      </StrictMode>,
    )

    await waitFor(() => {
      expect(nativeAppStateMocks.loadNativeAppSnapshot).toHaveBeenCalled()
      expect(overlayRuntimeMocks.getOverlayBootstrapState).toHaveBeenCalled()
      expect(overlayRuntimeMocks.syncOverlayRuntime).toHaveBeenCalled()
      expect(nativeAppStateMocks.saveNativeAppSnapshot).toHaveBeenCalled()
    })

    unmount()

    expect(nativeAppStateMocks.saveNativeAppSnapshot.mock.calls.length).toBeLessThan(6)
    expect(overlayRuntimeMocks.syncOverlayRuntime.mock.calls.length).toBeLessThan(6)
  })
})
