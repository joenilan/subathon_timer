# Patch Notes

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
