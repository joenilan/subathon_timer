# Changelog

All notable changes to the desktop app are tracked here.

## 0.9.4

- Added a new wheel reveal timing control so streamers can decide how long the winner stays on screen before tests clear or automatic wheel actions finish.
- Reworked the wheel winner presentation so the wheel stays visible behind a smaller centered result card that reads better on stream.
- Kept the React overlay, in-app wheel popup, and native OBS loopback overlay aligned for the new reveal timing and layout behavior.

## 0.9.3

- Reworked the wheel flow to match the original gift-bomb behavior more closely, including automatic gift-bomb spins, delayed result reveal timing, chat announcements, and safe non-applying gift-bomb tests.
- Added a dedicated wheel overlay source plus an optional in-app wheel animation so both OBS and the streamer can see live spins and winner reveals without watching a separate preview.
- Polished the wheel result presentation, overlay preview behavior, provider setup forms, update checking, and remaining release-facing UI copy ahead of the public publish.

## 0.9.2

- Audited the routed desktop pages and rewrote page-level copy so About, Connections, Overlays, Rules, Settings, Wheel, and dashboard empty states read like finished production UI.
- Reworked the About page into a fuller product-facing screen with clearer project history, current-version framing, and cleaner original-project attribution.
- Tightened operator-facing labels and descriptions across the desktop app so setup and runtime screens read more clearly during real use.

## 0.9.1

- Added a dedicated About page with live app version display, project links, and explicit credit to the original `yannismate/subathon_timer` repository.
- Replaced the remaining active `yannismate` branding in the desktop bundle metadata with `dreadedzombie`, while keeping original-project attribution in the UI.
- Cleaned up repo-facing example metadata so the default channel/admin examples no longer ship with legacy personal names.

## 0.9.0

- Added StreamElements and Streamlabs tip provider support, including tip-driven timer rules, provider connection health, and recent tip previews.
- Hardened the desktop runtime around Zustand selectors, lifecycle hooks, native persistence, and overlay synchronization to avoid white-screen and feedback-loop regressions.
- Polished the Connections and Rules flows with clearer provider setup, provider readiness gating for tip rules, and cleaner event-rule editing.
- Added desktop-focused tests, CI updates, Bun-based Tauri commands, and a Windows release packaging script that emits normalized bundle filenames.

## 0.1.0

- Built the active Tauri desktop app around a live dashboard, rules editor, overlays studio, wheel editor, Twitch connections, and settings.
- Added native desktop persistence for timer state, rules, wheel configuration, and overlay transforms, while moving Twitch auth out of renderer storage.
- Added Twitch EventSub support for subscriptions, resubs, gifted subs, bits, follows, raids, and moderator chat timer commands.
- Added OBS-friendly local overlay runtime with timer and reason popup previews that stay aligned between React and Tauri.
- Added wheel outcomes for timer changes and moderation actions, plus dashboard-side live timer editing and tighter compact layouts.
