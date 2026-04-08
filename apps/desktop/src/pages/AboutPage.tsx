import { openUrl } from '@tauri-apps/plugin-opener'
import appVersionText from '../../VERSION?raw'
import { useUpdateStore } from '../state/useUpdateStore'
import { DOWNLOAD_BASE } from '../lib/update/checkForUpdate'

const appVersion = appVersionText.trim()

async function openExternal(url: string) {
  if ('__TAURI_INTERNALS__' in window) {
    try {
      await openUrl(url)
      return
    } catch {
      // Fall back to the browser path below.
    }
  }

  window.open(url, '_blank', 'noopener,noreferrer')
}

const buildHighlights = [
  'Live Twitch EventSub timer updates',
  'StreamElements and Streamlabs tip support',
  'OBS-ready timer and reason overlays',
  'Wheel outcomes for time and moderation',
] as const

const projectLinks = [
  {
    label: 'Project source',
    title: 'View the current desktop app repository',
    detail: 'github.com/joenilan/subathon_timer',
    href: 'https://github.com/joenilan/subathon_timer',
  },
  {
    label: 'Twitch',
    title: 'Follow DreadedZombie live',
    detail: 'twitch.tv/dreadedzombie',
    href: 'https://twitch.tv/dreadedzombie',
  },
  {
    label: 'X / Twitter',
    title: 'Updates and release posts',
    detail: 'x.com/dreadedzombietv',
    href: 'https://x.com/dreadedzombietv',
  },
] as const

const credits = [
  {
    label: 'Original project',
    title: 'yannismate/subathon_timer',
    detail: 'This desktop app builds on the original open-source timer and keeps that work credited here.',
    href: 'https://github.com/yannismate/subathon_timer',
  },
  {
    label: 'Current build',
    title: 'Maintained by DreadedZombie',
    detail: 'Expanded with desktop persistence, overlays, tip providers, release packaging, and runtime hardening.',
    href: 'https://github.com/joenilan/subathon_timer',
  },
] as const

export function AboutPage() {
  const { updateInfo, checking, fetchFailed, checkForUpdate } = useUpdateStore()

  return (
    <div className="page-container settings-page about-page">
      <section className="page-header rules-header">
        <div>
          <h1 className="page-title">About</h1>
          <p className="page-desc">Version details, project history, and the source links that matter when you run, share, or build on this app.</p>
        </div>
      </section>

      {updateInfo ? (
        <section className="panel" style={{ background: 'rgba(250,204,21,0.08)', borderColor: 'rgba(250,204,21,0.3)' }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px' }}>
            <div style={{ flex: 1 }}>
              <p style={{ color: '#fde047', fontWeight: 600, fontSize: '14px', margin: 0 }}>
                Update available — v{updateInfo.version}
              </p>
              <p style={{ color: 'rgba(253,224,71,0.6)', fontSize: '12px', margin: '4px 0 0' }}>
                {updateInfo.notes}
              </p>
            </div>
            <button
              type="button"
              className="about-link-card"
              style={{ flexShrink: 0, padding: '6px 14px', background: '#facc15', color: '#000', fontWeight: 700, fontSize: '12px', borderRadius: '8px' }}
              onClick={() => void openExternal(`${DOWNLOAD_BASE}/${updateInfo.files.setup}`)}
            >
              Download
            </button>
          </div>
        </section>
      ) : (
        <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: '8px' }}>
          <span style={{ fontSize: '12px', color: 'var(--color-text-muted, #6b7280)' }}>
            {checking ? 'Checking for updates…' : fetchFailed ? 'Could not reach update server.' : 'You\'re on the latest version.'}
          </span>
          <button
            type="button"
            onClick={() => void checkForUpdate()}
            disabled={checking}
            style={{ fontSize: '12px', color: 'var(--color-text-muted, #6b7280)', background: 'none', border: 'none', cursor: 'pointer', padding: 0, opacity: checking ? 0.5 : 1 }}
          >
            Check for updates
          </button>
        </div>
      )}

      <section className="panel about-hero">
        <div className="about-hero__header">
          <div className="about-hero__badge">Subathon Timer</div>
          <div className="about-version-card">
            <span className="about-version-card__label">Current version</span>
            <strong className="about-version-card__value">v{appVersion}</strong>
          </div>
        </div>

        <div className="about-hero__copy">
          <h2 className="panel-title">Desktop timer control for real subathon runs</h2>
          <p className="panel-copy">
            This build takes the original timer concept and turns it into a desktop workflow with local overlays, live Twitch event handling, tip integrations, and release packaging that is easier to hand to other streamers.
          </p>
          <p className="panel-copy">
            It is built so the stream operator can manage the timer, wheel, rules, and provider connections from one app without juggling browser tabs or raw config files during a run.
          </p>
        </div>

        <div className="about-highlight-grid">
          {buildHighlights.map((item) => (
            <div key={item} className="about-highlight-card">
              <span className="about-highlight-card__dot" />
              <span>{item}</span>
            </div>
          ))}
        </div>
      </section>

      <div className="about-grid">
        <section className="panel">
          <div className="panel-header">
            <div>
              <h2 className="panel-title">Credits</h2>
              <p className="panel-copy">This release keeps the original project credited clearly. The desktop app is an expanded continuation, not a rebrand that erases where it started.</p>
            </div>
          </div>

          <div className="about-link-list">
            {credits.map((entry) => (
              <button key={entry.href} type="button" className="about-link-card" onClick={() => void openExternal(entry.href)}>
                <span className="about-link-card__label">{entry.label}</span>
                <strong className="about-link-card__title">{entry.title}</strong>
                <p className="about-link-card__detail">{entry.detail}</p>
                <span className="about-link-card__meta">Open link</span>
              </button>
            ))}
          </div>
        </section>

        <section className="panel">
          <div className="panel-header">
            <div>
              <h2 className="panel-title">Links</h2>
              <p className="panel-copy">Use these for source access, release tracking, or the current creator channels tied to the project.</p>
            </div>
          </div>

          <div className="about-link-list">
            {projectLinks.map((entry) => (
              <button key={entry.href} type="button" className="about-link-card" onClick={() => void openExternal(entry.href)}>
                <span className="about-link-card__label">{entry.label}</span>
                <strong className="about-link-card__title">{entry.title}</strong>
                <p className="about-link-card__detail">{entry.detail}</p>
                <span className="about-link-card__meta">Open link</span>
              </button>
            ))}
          </div>
        </section>
      </div>
    </div>
  )
}
