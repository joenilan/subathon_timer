import { openUrl } from '@tauri-apps/plugin-opener'
import appVersionText from '../../VERSION?raw'
import { useUpdateStore } from '../state/useUpdateStore'

const appVersion = appVersionText.trim()

async function openExternal(url: string) {
  if ('__TAURI_INTERNALS__' in window) {
    try {
      await openUrl(url)
      return
    } catch {
      // fall through
    }
  }
  window.open(url, '_blank', 'noopener,noreferrer')
}

const socialLinks = [
  {
    label: 'Twitch',
    detail: 'twitch.tv/dreadedzombie',
    href: 'https://twitch.tv/dreadedzombie',
    icon: '💜',
  },
  {
    label: 'X / Twitter',
    detail: 'x.com/dreadedzombietv',
    href: 'https://x.com/dreadedzombietv',
    icon: '𝕏',
  },
  {
    label: 'GitHub',
    detail: 'github.com/joenilan',
    href: 'https://github.com/joenilan',
    icon: '⌥',
  },
  {
    label: 'Source',
    detail: 'github.com/joenilan/subathon_timer',
    href: 'https://github.com/joenilan/subathon_timer',
    icon: '⎇',
  },
] as const

const supportLinks = [
  {
    label: 'StreamElements tip',
    detail: 'streamelements.com/dreadedzombie/tip',
    href: 'https://streamelements.com/dreadedzombie/tip',
    icon: '⚡',
  },
  {
    label: 'Ko-fi',
    detail: 'ko-fi.com/dreadedzombie',
    href: 'https://ko-fi.com/dreadedzombie',
    icon: '☕',
  },
] as const

export function AboutPage() {
  const { update, checking, downloading, downloadProgress, error, checkForUpdate, installUpdate } = useUpdateStore()

  return (
    <div className="page-container settings-page about-page">
      <section className="page-header rules-header">
        <div>
          <h1 className="page-title">About</h1>
          <p className="page-desc">Version info, credits, and the links that matter.</p>
        </div>
      </section>

      {/* Update strip */}
      {update ? (
        <section className="panel about-update-strip about-update-strip--update">
          <div className="about-update-strip__copy">
            <span className="about-update-strip__kicker">Update available</span>
            <strong className="about-update-strip__title">Version {update.version} is ready to install</strong>
            {update.body ? <p className="about-update-strip__detail">{update.body}</p> : null}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, alignItems: 'flex-end', flexShrink: 0 }}>
            <button
              type="button"
              className="btn btn--primary about-update-strip__action"
              onClick={() => void installUpdate()}
              disabled={downloading}
            >
              {downloading ? `Downloading… ${downloadProgress}%` : 'Update & Restart'}
            </button>
            {error ? <span style={{ fontSize: 11, color: 'var(--red)' }}>{error}</span> : null}
          </div>
        </section>
      ) : (
        <div className="about-update-row">
          <span className="about-update-row__status">
            {checking
              ? 'Checking for updates…'
              : error
                ? 'Could not reach the update feed.'
                : 'You\'re on the latest version.'}
          </span>
          <button
            type="button"
            className="btn btn--ghost about-update-row__action"
            onClick={() => void checkForUpdate()}
            disabled={checking}
          >
            {checking ? 'Checking…' : 'Check for updates'}
          </button>
        </div>
      )}

      {/* Developer profile card */}
      <section className="panel about-profile-card">
        <div className="about-profile-card__icon" aria-hidden="true">DZ</div>

        <div className="about-profile-card__identity">
          <h2 className="about-profile-card__name">Subathon Timer</h2>
          <span className="about-profile-card__version">v{appVersion}</span>
        </div>

        <p className="about-profile-card__tagline">
          Desktop timer control for real subathon runs — live Twitch events, tip feeds, wheel outcomes, and OBS-ready overlays in one self-contained app.
        </p>

        <div className="about-profile-card__divider" />

        <div className="about-profile-card__credit">
          <span className="about-profile-card__credit-label">Developed by</span>
          <strong className="about-profile-card__credit-name">DreadedZombie</strong>
        </div>

        <div className="about-profile-card__origin">
          <span>Based on the original open-source project by </span>
          <button
            type="button"
            className="about-inline-link"
            onClick={() => void openExternal('https://github.com/yannismate/subathon_timer')}
          >
            yannismate
          </button>
        </div>
      </section>

      {/* Links grid */}
      <div className="about-links-grid">
        <section className="panel about-links-panel">
          <h3 className="about-links-panel__title">Connect</h3>
          <div className="about-action-list">
            {socialLinks.map((link) => (
              <button
                key={link.href}
                type="button"
                className="about-action-btn"
                onClick={() => void openExternal(link.href)}
              >
                <span className="about-action-btn__icon" aria-hidden="true">{link.icon}</span>
                <span className="about-action-btn__body">
                  <strong className="about-action-btn__label">{link.label}</strong>
                  <span className="about-action-btn__detail">{link.detail}</span>
                </span>
                <span className="about-action-btn__arrow" aria-hidden="true">›</span>
              </button>
            ))}
          </div>
        </section>

        <section className="panel about-links-panel">
          <h3 className="about-links-panel__title">Support development</h3>
          <div className="about-action-list">
            {supportLinks.map((link) => (
              <button
                key={link.href}
                type="button"
                className="about-action-btn"
                onClick={() => void openExternal(link.href)}
              >
                <span className="about-action-btn__icon" aria-hidden="true">{link.icon}</span>
                <span className="about-action-btn__body">
                  <strong className="about-action-btn__label">{link.label}</strong>
                  <span className="about-action-btn__detail">{link.detail}</span>
                </span>
                <span className="about-action-btn__arrow" aria-hidden="true">›</span>
              </button>
            ))}
          </div>
        </section>
      </div>
    </div>
  )
}
