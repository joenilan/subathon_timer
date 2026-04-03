import { useMemo, useState, type ChangeEvent } from 'react'
import { useShallow } from 'zustand/react/shallow'
import type { OverlayKind } from '../lib/platform/overlayTransform'
import { useAppStore } from '../state/useAppStore'
import { selectOverlaysPageState } from '../state/selectors'

function buildPreviewUrl(pathname: string) {
  if (typeof window === 'undefined') {
    return pathname
  }

  return `${window.location.origin}${pathname}`
}

function buildNativeUrl(baseUrl: string | null, pathname: string) {
  if (!baseUrl) {
    return buildPreviewUrl(pathname)
  }

  return `${baseUrl}${pathname}`
}

function buildStudioPreviewUrl(sourceUrl: string) {
  return `${sourceUrl}${sourceUrl.includes('?') ? '&' : '?'}studio=1`
}

export function OverlaysPage() {
  const {
    overlayBaseUrl,
    overlayPreviewBaseUrl,
    overlayLanBaseUrl,
    overlayLanAccessEnabled,
    timerWidgetTheme,
    timerOverlayTransform,
    reasonOverlayTransform,
    setTimerWidgetTheme,
    setOverlayTransform,
    resetOverlayTransform,
    setOverlayLanAccessEnabled,
  } = useAppStore(useShallow(selectOverlaysPageState))
  const [selected, setSelected] = useState<OverlayKind>('timer')
  const [copied, setCopied] = useState<OverlayKind | null>(null)
  const isNativeRuntime = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window
  const runtimeReady = Boolean(overlayPreviewBaseUrl ?? overlayBaseUrl)

  const overlays = useMemo(() => {
    const timerSourceUrl = buildNativeUrl(overlayBaseUrl, '/overlay/timer')
    const reasonSourceUrl = buildNativeUrl(overlayBaseUrl, '/overlay/reason')
    const timerPreviewUrl = buildNativeUrl(overlayPreviewBaseUrl ?? overlayBaseUrl, '/overlay/timer')
    const reasonPreviewUrl = buildNativeUrl(overlayPreviewBaseUrl ?? overlayBaseUrl, '/overlay/reason')

    return [
      {
        id: 'timer' as const,
        name: 'Timer overlay',
        description: 'Main on-stream timer with incentives and trend line.',
        sceneLabel: 'Primary scene',
        usageLabel: 'Persistent widget',
        sourceUrl: timerSourceUrl,
        openUrl: timerPreviewUrl,
        previewUrl: buildStudioPreviewUrl(timerPreviewUrl),
      },
      {
        id: 'reason' as const,
        name: 'Reason popup',
        description: 'Latest event popup for subs, cheers, follows, and manual changes.',
        sceneLabel: 'Popup scene',
        usageLabel: 'Event-driven alert',
        sourceUrl: reasonSourceUrl,
        openUrl: reasonPreviewUrl,
        previewUrl: buildStudioPreviewUrl(reasonPreviewUrl),
      },
    ]
  }, [overlayBaseUrl, overlayPreviewBaseUrl])

  const introCopy = runtimeReady
    ? overlayLanAccessEnabled
      ? overlayLanBaseUrl
        ? `LAN source mode is on. Copy the LAN URLs from ${overlayLanBaseUrl} into OBS on the stream PC. Embedded previews stay local to this machine.`
        : 'LAN source mode is on, but a private LAN address could not be detected yet. The overlay runtime is still available locally on this PC.'
      : `Copy the local OBS source URLs from ${overlayBaseUrl ?? overlayPreviewBaseUrl} and verify the real output before you add it to OBS.`
    : isNativeRuntime
      ? 'Local runtime is unavailable because the fixed overlay port 31847 could not be claimed. Close anything using that port and relaunch the app.'
      : 'Browser preview mode is active. Launch the Tauri app to swap these URLs to local loopback sources.'

  const selectedOverlay = overlays.find((overlay) => overlay.id === selected) ?? overlays[0]
  const selectedTransform = selected === 'timer' ? timerOverlayTransform : reasonOverlayTransform
  const selectedAnchor = 'Center anchor'

  const handleCopy = async (overlay: (typeof overlays)[number]) => {
    try {
      await navigator.clipboard.writeText(overlay.sourceUrl)
      setCopied(overlay.id)
      window.setTimeout(() => setCopied(null), 1500)
    } catch {
      setCopied(null)
    }
  }

  const handleOffsetChange =
    (axis: 'x' | 'y') =>
    (event: ChangeEvent<HTMLInputElement>) => {
      const nextValue = Number.parseInt(event.target.value, 10) || 0
      setOverlayTransform(selected, axis === 'x' ? { x: nextValue } : { y: nextValue })
    }

  const handleScaleChange = (event: ChangeEvent<HTMLInputElement>) => {
    setOverlayTransform(selected, { scale: (Number.parseInt(event.target.value, 10) || 100) / 100 })
  }

  return (
    <div className="page-container overlays-page">
      <section className="panel overlays-shell">
        <div className="overlays-shell__header">
          <div className="overlays-shell__intro">
            <span className="meta-kicker">Overlay Studio</span>
            <h1 className="page-title">OBS sources</h1>
            <p className="panel-copy">{introCopy}</p>
          </div>
          <div className="overlays-shell__status">
            <div className="overlays-shell__badges">
              <span className={`status-chip ${runtimeReady ? 'status-chip--connected' : 'status-chip--idle'}`}>
                {runtimeReady ? 'Local runtime ready' : isNativeRuntime ? 'Local runtime unavailable' : 'Preview mode'}
              </span>
              {overlayLanAccessEnabled ? (
                <span className={`status-chip ${overlayLanBaseUrl ? 'status-chip--connected' : 'status-chip--critical'}`}>
                  {overlayLanBaseUrl ? 'LAN source ready' : 'LAN source unavailable'}
                </span>
              ) : null}
              <span className="mini-chip">{overlays.length} sources</span>
            </div>
            <div className="overlays-runtime-settings">
              <label className="overlay-theme-picker">
                <span>Timer theme</span>
                <select value={timerWidgetTheme} onChange={(event) => setTimerWidgetTheme(event.target.value as 'original' | 'app')}>
                  <option value="app">App (Default)</option>
                  <option value="original">Original</option>
                </select>
              </label>
              <label className="overlay-lan-toggle">
                <span className="overlay-lan-toggle__copy">
                  <strong>Dual-PC / LAN source</strong>
                  <small>Expose a private LAN URL for OBS on another machine.</small>
                </span>
                <input
                  type="checkbox"
                  checked={overlayLanAccessEnabled}
                  onChange={(event) => setOverlayLanAccessEnabled(event.target.checked)}
                />
              </label>
            </div>
          </div>
        </div>

        <div className="overlays-workbench">
          <aside className="overlays-rail">
            <div className="overlays-rail__header">
              <h2 className="panel-title">Source list</h2>
              <p className="panel-copy">
                Select the source you want to configure. The panel on the right shows the exact browser-source URL, a live preview, and placement controls for that source.
              </p>
            </div>

            <div className="overlay-card-list">
              {overlays.map((overlay) => {
                const isSelected = selected === overlay.id

                return (
                  <button
                    key={overlay.id}
                    type="button"
                    className={`overlay-card${isSelected ? ' overlay-card--active' : ''}`}
                    onClick={() => setSelected(overlay.id)}
                    aria-pressed={isSelected}
                  >
                    <div className="overlay-card__header">
                      <div className="overlay-card__copy">
                        <span className="overlay-card__title">{overlay.name}</span>
                        <span className="overlay-card__desc">{overlay.description}</span>
                      </div>
                      <span className="mini-chip">{overlay.sceneLabel}</span>
                    </div>
                    <div className="overlay-card__footer">
                      <span className="panel-subtitle">{overlay.usageLabel}</span>
                      <span className={`overlay-card__state${isSelected ? ' overlay-card__state--active' : ''}`}>
                        {isSelected ? 'Selected' : 'Open in studio'}
                      </span>
                    </div>
                  </button>
                )
              })}
            </div>
          </aside>

          <div className="overlay-preview-panel">
            <div className="overlay-preview-panel__header">
              <div>
                <span className="panel-subtitle">Live preview</span>
                <h2 className="panel-title">{selectedOverlay.name}</h2>
                <p className="panel-copy">{selectedOverlay.description}</p>
              </div>
              <div className="overlay-preview-panel__controls">
                <div className="overlay-preview-panel__badges">
                  <span className="mini-chip">{selectedOverlay.sceneLabel}</span>
                  <span className="mini-chip">{selectedOverlay.usageLabel}</span>
                  <span className={`status-chip ${runtimeReady ? 'status-chip--connected' : 'status-chip--idle'}`}>
                    {runtimeReady
                      ? overlayLanAccessEnabled && overlayLanBaseUrl
                        ? 'LAN source'
                        : 'Local source'
                      : isNativeRuntime
                        ? 'Preview fallback'
                        : 'React preview'}
                  </span>
                </div>
                <div className="overlay-preview-panel__actions">
                  <button className="btn" onClick={() => void handleCopy(selectedOverlay)}>
                    {copied === selectedOverlay.id ? 'Copied' : 'Copy URL'}
                  </button>
                  <a className="btn btn--primary" href={selectedOverlay.openUrl} target="_blank" rel="noreferrer">
                    Open Preview
                  </a>
                </div>
              </div>
            </div>

            <div className="overlay-preview-urls">
              <div className="overlay-preview-url">
                <span className="panel-subtitle">{runtimeReady ? 'OBS Browser Source URL' : 'Preview URL'}</span>
                <code>{selectedOverlay.sourceUrl}</code>
              </div>
              {runtimeReady && selectedOverlay.openUrl !== selectedOverlay.sourceUrl ? (
                <div className="overlay-preview-url">
                  <span className="panel-subtitle">Local preview URL</span>
                  <code>{selectedOverlay.openUrl}</code>
                </div>
              ) : null}
            </div>

            <section className="overlay-adjust-panel">
              <div className="overlay-adjust-panel__header">
                <div>
                  <span className="panel-subtitle">Placement</span>
                  <h3 className="panel-title">Live transform</h3>
                  <p className="panel-copy">
                    Move and scale the selected overlay in real time. {selectedAnchor} stays as the baseline, the embedded preview mirrors the saved placement, and the live overlay stays inside the visible frame instead of drifting off-screen.
                  </p>
                </div>
                <button className="btn btn--ghost btn--compact" onClick={() => resetOverlayTransform(selected)}>
                  Reset
                </button>
              </div>

              <div className="overlay-adjust-grid">
                <label className="overlay-slider-field">
                  <div className="overlay-slider-field__header">
                    <span>X offset</span>
                    <strong>{selectedTransform.x >= 0 ? `+${selectedTransform.x}px` : `${selectedTransform.x}px`}</strong>
                  </div>
                  <input
                    type="range"
                    min={-600}
                    max={600}
                    step={2}
                    value={selectedTransform.x}
                    onChange={handleOffsetChange('x')}
                  />
                </label>

                <label className="overlay-slider-field">
                  <div className="overlay-slider-field__header">
                    <span>Y offset</span>
                    <strong>{selectedTransform.y >= 0 ? `+${selectedTransform.y}px` : `${selectedTransform.y}px`}</strong>
                  </div>
                  <input
                    type="range"
                    min={-400}
                    max={400}
                    step={2}
                    value={selectedTransform.y}
                    onChange={handleOffsetChange('y')}
                  />
                </label>

                <label className="overlay-slider-field">
                  <div className="overlay-slider-field__header">
                    <span>Scale</span>
                    <strong>{Math.round(selectedTransform.scale * 100)}%</strong>
                  </div>
                  <input
                    type="range"
                    min={50}
                    max={200}
                    step={1}
                    value={Math.round(selectedTransform.scale * 100)}
                    onChange={handleScaleChange}
                  />
                </label>
              </div>
            </section>

            <div className={`overlay-preview-stage overlay-preview-stage--${selected}`}>
              <div className={`overlay-preview-frame${selected === 'reason' ? ' overlay-preview-frame--reason' : ''}`}>
                <iframe src={selectedOverlay.previewUrl} title={`${selectedOverlay.name} preview`} />
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  )
}
