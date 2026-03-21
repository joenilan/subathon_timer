# Changelog

All notable changes to the desktop app are tracked here.

## 0.1.0

- Built the active Tauri desktop app around a live dashboard, rules editor, overlays studio, wheel editor, Twitch connections, and settings.
- Added native desktop persistence for timer state, rules, wheel configuration, and overlay transforms, while moving Twitch auth out of renderer storage.
- Added Twitch EventSub support for subscriptions, resubs, gifted subs, bits, follows, raids, and moderator chat timer commands.
- Added OBS-friendly local overlay runtime with timer and reason popup previews that stay aligned between React and Tauri.
- Added wheel outcomes for timer changes and moderation actions, plus dashboard-side live timer editing and tighter compact layouts.
