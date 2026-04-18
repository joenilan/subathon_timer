# Patch Notes

## 0.10.0

- Wheel slices now draw proportionally to their chance weight so the visual matches the actual odds — a 2% segment looks like 2% of the wheel, not the same size as a 28% one.
- Added Shared Session, an optional feature that connects up to six creator desktops to one shared timer and wheel via a central server. Each creator's Twitch and tip events contribute to the same countdown in real time. Enable it under Settings → Features.

## 0.9.4

- Added a setting for how long wheel results stay visible after a spin.
- The wheel now stays on screen during the winner reveal with a smaller centered result card.
- React, in-app, and OBS wheel surfaces now follow the same reveal timing and presentation.

## 0.9.3

- Gifted-sub wheel spins now follow the live reveal flow more closely, with safer gift-bomb tests that preview the result without applying actions.
- The wheel can now appear both as an OBS overlay source and as an optional in-app animation for the streamer.
- Wheel winner screens, overlay previews, updater health, and final setup copy were cleaned up for this release.

## 0.9.2

- Rewrote the main desktop pages so the app reads like a finished release instead of an internal tool panel.
- Expanded the About page into a cleaner product and credits screen.
- Tightened setup, rules, overlay, and wheel copy for clearer day-to-day use.

## 0.9.1

- Added a new About page with version info, source links, and original-project credits.
- Updated the remaining desktop branding to `dreadedzombie` while preserving credit to `yannismate/subathon_timer`.
- Cleaned up bundled example metadata and defaults that still carried old personal names.

## 0.9.0

- StreamElements and Streamlabs tips can now add time directly through the shared `Tips / donations` rule.
- Twitch, tip providers, overlays, and native persistence were hardened to reduce duplicate-event risk and React/Tauri runtime issues.
- The Connections page now has clearer provider setup, cleaner status feedback, and a less cluttered tip-provider layout.
- Windows release packaging now has a dedicated `bun run release:windows` path that emits normalized bundle filenames.

## 0.1.0

- New desktop app with a live subathon dashboard, Twitch connections, rules, overlays, wheel, and settings.
- Twitch events now drive the timer through EventSub, including subs, gifted subs, bits, follows, and raids.
- Moderator chat commands are supported for timer control, with per-command permission settings in the app.
- Timer and reason overlays can be previewed locally and used directly in OBS through the built-in loopback server.
- Wheel outcomes can add or remove time and trigger Twitch moderation actions when the connected session has the required scopes.
- Desktop auth, timer state, and app data now persist across launches.
