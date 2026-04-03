import { openUrl } from '@tauri-apps/plugin-opener'
import appVersionText from '../../VERSION?raw'

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

const projectLinks = [
  {
    label: 'Source repository',
    title: 'github.com/joenilan/subathon_timer',
    href: 'https://github.com/joenilan/subathon_timer',
  },
  {
    label: 'Twitch',
    title: 'twitch.tv/dreadedzombie',
    href: 'https://twitch.tv/dreadedzombie',
  },
  {
    label: 'X / Twitter',
    title: 'x.com/dreadedzombietv',
    href: 'https://x.com/dreadedzombietv',
  },
] as const

const credits = [
  {
    label: 'Original project',
    title: 'github.com/yannismate/subathon_timer',
    href: 'https://github.com/yannismate/subathon_timer',
  },
  {
    label: 'Current desktop build',
    title: 'Maintained and expanded by dreadedzombie',
    href: 'https://github.com/joenilan/subathon_timer',
  },
] as const

export function AboutPage() {
  return (
    <div className="page-container settings-page about-page">
      <section className="page-header rules-header">
        <div>
          <h1 className="page-title">About</h1>
          <p className="page-desc">Project info, current release version, and credits for the original timer this desktop app is based on.</p>
        </div>
      </section>

      <section className="panel about-hero">
        <div className="about-hero__badge">Subathon Timer</div>
        <div className="about-hero__grid">
          <div className="about-hero__copy">
            <h2 className="panel-title">DreadedZombie desktop edition</h2>
            <p className="panel-copy">
              Desktop-first Twitch subathon timer with native overlays, EventSub runtime, wheel moderation outcomes, and direct tip-provider support.
            </p>
            <p className="panel-copy">
              This build keeps the original project credited while replacing the remaining old branding with the current maintainer identity.
            </p>
          </div>

          <div className="about-version-card">
            <span className="about-version-card__label">Current version</span>
            <strong className="about-version-card__value">v{appVersion}</strong>
          </div>
        </div>
      </section>

      <div className="about-grid">
        <section className="panel">
          <div className="panel-header">
            <div>
              <h2 className="panel-title">Credits</h2>
              <p className="panel-copy">This app is a modified and updated version of the original open-source project by yannismate.</p>
            </div>
          </div>

          <div className="about-link-list">
            {credits.map((entry) => (
              <button key={entry.href} type="button" className="about-link-card" onClick={() => void openExternal(entry.href)}>
                <span className="about-link-card__label">{entry.label}</span>
                <strong className="about-link-card__title">{entry.title}</strong>
                <span className="about-link-card__meta">Open link</span>
              </button>
            ))}
          </div>
        </section>

        <section className="panel">
          <div className="panel-header">
            <div>
              <h2 className="panel-title">Links</h2>
              <p className="panel-copy">Project and creator links for source, updates, and support.</p>
            </div>
          </div>

          <div className="about-link-list">
            {projectLinks.map((entry) => (
              <button key={entry.href} type="button" className="about-link-card" onClick={() => void openExternal(entry.href)}>
                <span className="about-link-card__label">{entry.label}</span>
                <strong className="about-link-card__title">{entry.title}</strong>
                <span className="about-link-card__meta">Open link</span>
              </button>
            ))}
          </div>
        </section>
      </div>
    </div>
  )
}
