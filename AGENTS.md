# Repository Guidelines

## Project Structure & Module Organization
- `apps/desktop/` is the active app. It contains the Tauri shell, React frontend, and new Twitch auth/runtime work.
- `apps/desktop/src/` holds the UI, route pages, state stores, and web-side integration code.
- `apps/desktop/src/state/useTwitchSessionStore.ts` owns local Twitch auth/session lifecycle.
- `apps/desktop/src/state/useEventSubStore.ts` owns the live EventSub WebSocket session and core subscription set.
- `apps/desktop/src/state/useAppStore.ts` owns the live timer runtime, persisted dashboard state, and Twitch-driven activity history.
- `apps/desktop/src/lib/timer/` contains the timer rules, duration formatting, and line-chart helpers.
- `apps/desktop/src/components/TimerWidget.tsx` is the shared timer presentation used by the dashboard and timer overlay.
- `apps/desktop/src/components/ReasonWidget.tsx` is the shared reason-popup surface used by the reason overlay.
- `apps/desktop/src/pages/DashboardPage.tsx` keeps the live timer widget as the primary stage and, when enabled, shows activity in a right-side rail.
- `apps/desktop/src/pages/RulesPage.tsx` edits the live timer rule config persisted in the app store.
- `apps/desktop/src/overlays/` contains the standalone overlay routes that preview live timer/runtime state.
- `apps/desktop/src-tauri/` holds the Rust entrypoint and Tauri configuration.
- `apps/desktop/src-tauri/src/lib.rs` now serves loopback overlay endpoints on `127.0.0.1` when running under Tauri.
- `apps/desktop/src/lib/platform/overlayRuntime.ts` syncs live timer state and the selected timer theme into the native overlay server.
- Keep the React overlay routes and the Rust loopback overlay HTML aligned. Do not polish only one side.
- `apps/desktop/src/lib/wheel/` and `apps/desktop/src/components/WheelDisplay.tsx` contain the active wheel runtime and visualization.
- `apps/desktop/src/pages/WheelPage.tsx` should keep the wheel as a large top-stage surface with the editor underneath; avoid cramped side-by-side layouts that cause overlap.
- Validate wheel-page changes at the actual wheel window target size, not an arbitrary browser viewport. The current working check is `1220x860`.
- Keep the wheel stage visually isolated from the editor below it. The segment list may scroll, but the wheel stage must not overflow into the editor section.
- `apps/desktop/src/lib/twitch/helix.ts` contains the active Helix moderation/chatters calls used by wheel timeout outcomes.
- `apps/desktop/src/pages/WheelPage.tsx` is the active wheel editor; add/remove/edit segments there instead of expecting manual JSON edits.
- `apps/desktop/src/pages/SettingsPage.tsx` owns the remaining desktop-level appearance settings and legacy config import flow.
- `apps/desktop/src/lib/config/legacyConfig.ts` parses the old `config.json` shape into the current desktop rules and wheel config.
- `apps/desktop/docs/persistence-roadmap.md` is the source of truth for the persistence migration phases. Update it whenever a persistence-related phase lands or changes scope.
- Root `src/` and `public/` are the legacy Node/overlay app. Treat them as behavior reference unless a task explicitly targets the old stack.

## Build, Test, and Development Commands
- `cd apps/desktop && bun install --frozen-lockfile` installs desktop dependencies from `bun.lock`.
- `cd apps/desktop && bun run dev` runs the frontend in the browser on `127.0.0.1:1420`.
- `cd apps/desktop && bun run tauri:dev` runs the actual desktop app with the Tauri runtime.
- `cd apps/desktop && bun run build` builds the frontend bundle and type-checks TypeScript.
- `cd apps/desktop && bun test` runs the desktop unit tests with Vitest.
- `cd apps/desktop && bun run version:check` verifies that `VERSION`, `package.json`, `src-tauri/tauri.conf.json`, and `src-tauri/Cargo.toml` all match.
- `cd apps/desktop && bun run version:check-notes` verifies that `CHANGELOG.md` and `PATCH_NOTES.md` both include the current desktop app version.
- `cd apps/desktop && bun run version:patch|minor|major` bumps `apps/desktop/VERSION` and syncs the desktop app version files.
- `cd apps/desktop && bun run version:set -- 0.2.0` sets an exact desktop app version and syncs the desktop app version files.
- `cd apps/desktop && bun run tauri:clean` removes the full Rust/Tauri build cache when disk usage gets out of hand.
- `cd apps/desktop && bun run tauri:build:clean` creates a release build, then removes the release-side Rust artifacts while keeping dev caches.
- `cargo check --manifest-path apps/desktop/src-tauri/Cargo.toml` validates the native layer without producing a release build.
- Root `bun run start` is only for the legacy app.

## Coding Style & Naming Conventions
- Use TypeScript with strict mode intact. Avoid weakening types to get builds through.
- Keep React pages in `src/pages`, shared UI in `src/components`, state in `src/state`, and Twitch code in `src/lib/twitch`.
- Prefer small, explicit functions over clever abstractions. This app is operational tooling, not a framework exercise.
- Match the existing visual direction. Do not reintroduce generic dashboard chrome, oversized card grids, or flashy gradients.
- For Zustand selectors, never build nested objects, arrays, or transformed payloads inline. Select flat store fields only, then assemble derived payloads with `useMemo` or plain render logic.
- For React effects that write to stores or native bridges, keep an explicit idempotency guard. Do not rely on dependency arrays alone to prevent loops under React 19 dev behavior.

## Testing Guidelines
- For desktop changes, run `bun run build` and `cargo check`.
- For auth and UI changes, verify both `bun run dev` and `bun run tauri:dev` when the runtime matters.
- Test Twitch auth from the `Connections` page, including reconnect and refresh paths when touched.
- Test EventSub after auth by confirming the `Connections` page shows a WebSocket session, subscription count, and recent notifications when Twitch events occur.
- Test the dashboard after Twitch events occur: timer adjustments, activity feed, and trend graph should move without manual refresh.
- Test `Rules` by changing values and confirming new Twitch events use the updated seconds.
- Test `Overlays` by opening the direct preview routes and confirming they reflect the same timer theme, timer state, and latest activity as the dashboard.
- In Tauri, prefer the loopback URLs shown on `Overlays` for OBS. Browser-only dev mode falls back to hash-route preview URLs.
- Test `Wheel` by spinning, applying a time result, and confirming the timer/activity feed update.
- Test timeout wheel results with a freshly reconnected Twitch session that includes moderation scopes. Older saved sessions may need reconnect before Helix timeout calls succeed.
- Test wheel add/remove/edit flows directly in the wheel editor.
- Test `Settings` import with an old config.json payload and confirm wheel config plus timing rules migrate into the app correctly. Legacy channel, provider, admin, and blacklist fields are intentionally ignored.

## Commit & Pull Request Guidelines
- Keep commits focused and descriptive, for example: `Add Twitch device auth session store`.
- `apps/desktop/VERSION` is the source of truth for the active desktop app version. Keep release prep on the desktop app flowing through the `version:*` scripts instead of editing scattered version fields by hand.
- For desktop releases, update [CHANGELOG.md](/E:/git/subathon_timer/apps/desktop/CHANGELOG.md) and [PATCH_NOTES.md](/E:/git/subathon_timer/apps/desktop/PATCH_NOTES.md) in the same pass as the version bump.
- In pull requests, include:
  - what changed
  - how it was tested
  - screenshots or short clips for UI changes
  - any Twitch scopes, token, or runtime behavior changes

## Agent-Specific Notes
- Preserve the current reset layout unless the user explicitly asks for a redesign.
- Modernize auth and Twitch integrations in `apps/desktop`; do not drift back toward IRC/TMI-based work in the legacy app.
- For desktop page and pane scroll areas, use scoped custom scrollbars instead of default system scrollbars.
- Standard app pages like `Connections`, `Rules`, and `Settings` should prefer page-level scrolling. Do not trap normal content inside fixed-height or flex-compressed inner panes just to avoid page scroll.
- Reserve pane-local scrolling for clearly dedicated surfaces only, such as the dashboard activity rail, overlay studio panes, or the wheel segment list/editor where an isolated scroll region is part of the actual interaction model.
- For persistence work, follow `apps/desktop/docs/persistence-roadmap.md` in order and keep that file updated as part of the same pass. Do not let persistence phases live only in chat context.
