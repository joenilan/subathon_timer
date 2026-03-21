// @vitest-environment jsdom

import { StrictMode } from 'react'
import { render, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { RuntimeLifecycle } from './RuntimeLifecycle'
import * as nativeAppStateModule from '../lib/platform/nativeAppState'
import * as overlayRuntimeModule from '../lib/platform/overlayRuntime'
import { useAppStore } from '../state/useAppStore'
import { useEventSubStore } from '../state/useEventSubStore'
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

describe('RuntimeLifecycle', () => {
  beforeEach(() => {
    useAppStore.setState(useAppStore.getInitialState(), true)
    useEventSubStore.setState(useEventSubStore.getInitialState(), true)
    useTwitchSessionStore.setState(useTwitchSessionStore.getInitialState(), true)
    vi.mocked(nativeAppStateModule.loadNativeAppSnapshot).mockClear()
    vi.mocked(nativeAppStateModule.saveNativeAppSnapshot).mockClear()
    vi.mocked(overlayRuntimeModule.getOverlayBootstrapState).mockClear()
    vi.mocked(overlayRuntimeModule.setOverlayNetworkMode).mockClear()
    vi.mocked(overlayRuntimeModule.syncOverlayRuntime).mockClear()
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
})
