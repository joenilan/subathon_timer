# State/Runtime Audit

This document records the focused audit of the active desktop app state/runtime flow after the React 19 blank-screen regression caused by an unstable Zustand selector result.

## Scope

Included:

- Zustand selector stability
- effect-driven runtime orchestration
- cross-store data flow
- overlay/native sync behavior
- high-frequency render-path subscription patterns
- guardrail tests for runtime composition

Excluded:

- visual redesign
- release-process review
- stack replacement

## Runtime Interaction Map

### `useTwitchSessionStore`

- Reads:
  - bootstrapped session state
  - device auth flow state
  - token expiration data
- Writes:
  - auth bootstrap result
  - validate/refresh state
  - device auth poll result
- Re-triggers:
  - `useTwitchSessionLifecycle`
  - `useEventSubLifecycle`
  - sidebar and connections UI

### `useEventSubStore`

- Reads:
  - connected broadcaster auth
- Writes:
  - socket/session state
  - normalized event buffer
  - recent notifications
- Re-triggers:
  - `useEventSubLifecycle`
  - `ConnectionsPage`

### `useAppStore`

- Reads:
  - timer runtime state
  - wheel config/runtime
  - overlay settings
  - processed event ids
- Writes:
  - timer runtime mutations
  - activity/trend derivation
  - overlay bootstrap state
  - persisted UI state
- Re-triggers:
  - overlay pages
  - dashboard
  - snapshot persistence
  - overlay runtime sync

### Native bridges

- `loadNativeAppSnapshot`
  - bootstrap hydration only
- `saveNativeAppSnapshot`
  - writeback from selected app runtime state
- `getOverlayBootstrapState`
  - bootstrap read for overlay URLs
- `setOverlayNetworkMode`
  - reacts to LAN toggle changes
- `syncOverlayRuntime`
  - reflects current timer/overlay state to native overlay server

## Selector Inventory

### Must-fix issue found and corrected

- [useNativeSnapshotPersistence.ts](/E:/git/subathon_timer/apps/desktop/src/hooks/useNativeSnapshotPersistence.ts)
  - Previous issue: selector returned a nested object created inline.
  - Result: React 19 `getSnapshot` infinite-loop protection blanked the app.
  - Fix: selector now returns only flat state fields, and the native snapshot payload is assembled in `useMemo`.

### Hardened during this pass

- [selectors.ts](/E:/git/subathon_timer/apps/desktop/src/state/selectors.ts)
  - Added typed shared selectors for runtime-heavy consumers.
- [AppFrame.tsx](/E:/git/subathon_timer/apps/desktop/src/components/AppFrame.tsx)
- [ConnectionsPage.tsx](/E:/git/subathon_timer/apps/desktop/src/pages/ConnectionsPage.tsx)
- [DashboardPage.tsx](/E:/git/subathon_timer/apps/desktop/src/pages/DashboardPage.tsx)
- [OverlaysPage.tsx](/E:/git/subathon_timer/apps/desktop/src/pages/OverlaysPage.tsx)
- [SettingsPage.tsx](/E:/git/subathon_timer/apps/desktop/src/pages/SettingsPage.tsx)
- [WheelPage.tsx](/E:/git/subathon_timer/apps/desktop/src/pages/WheelPage.tsx)
- [TimerOverlayPage.tsx](/E:/git/subathon_timer/apps/desktop/src/overlays/TimerOverlayPage.tsx)
- [ReasonOverlayPage.tsx](/E:/git/subathon_timer/apps/desktop/src/overlays/ReasonOverlayPage.tsx)

These are now grouped around flat `useShallow` selectors or primitive selectors rather than many independent reads.

### Remaining acceptable patterns

- Primitive selectors such as `useAppStore((state) => state.processTwitchEvent)` remain acceptable where only one stable function is needed.
- `state.activity[0] ?? null` is acceptable when returned through a shared selector because it returns an existing item reference or `null`, not a newly created object.

## Effect Risk Table

| File | Purpose | Write Target | Loop Risk | Strict Mode Risk | Guard |
| --- | --- | --- | --- | --- | --- |
| `useBootstrapRuntime.ts` | bootstrap auth/native overlay state | local component state, app store | low | medium | cancel flags, one-shot bootstrap reads |
| `useNativeSnapshotPersistence.ts` | persist native runtime snapshot | native bridge/localStorage | medium | medium | flat selector inputs, serialized snapshot dedupe, delayed writeback |
| `useOverlayRuntimeSync.ts` | sync overlay URLs/runtime | native overlay bridge, app store bootstrap fields | medium | medium | gated by `nativeStateReady`, LAN-toggle split from runtime sync |
| `useEventSubLifecycle.ts` | connect EventSub and apply normalized events | EventSub store, app store | medium | medium | auth gating, processed event id tracking |
| `useTwitchSessionLifecycle.ts` | validate/refresh/poll Twitch auth | Twitch session store | medium | medium | auth-status guards, timeout/interval cleanup |
| `useTimerRuntimeLifecycle.ts` | timer tick loop | app store | low | low | status guard plus interval cleanup |
| `AppFrame.tsx` | window sizing + sidebar persistence | native window sizing, localStorage | low | low | effect scoped to layout state only |
| `useViewportBoundOverlayTransform.ts` | clamp overlay transforms to viewport | local component state | low | medium | metric equality check before state write |

## Cross-store Data Flow

### Confirmed one-way paths

- `useTwitchSessionStore -> useEventSubStore`
  - auth drives EventSub connect/disconnect
- `useEventSubStore -> useAppStore`
  - normalized Twitch events are consumed and deduped by processed ids
- `useAppStore -> native snapshot`
  - selected runtime state is serialized and written after dedupe
- `useAppStore -> overlay runtime`
  - selected overlay/runtime state is pushed outward to native overlay server

### Risk reviewed

- `useAppStore + useTwitchSessionStore -> wheel moderation outcomes`
  - still async and stateful, but not selector-loop-prone
  - residual risk is mid-flight auth/session drift, not render recursion

## Findings

### High

- Resolved: unstable inline nested selector payload in native snapshot persistence caused a render-loop white screen.

### Medium

- Runtime-heavy pages still had several many-subscription patterns after the initial refactor.
  - Addressed by shared selector helpers and `useShallow` grouping.
- Hook composition had no direct render-smoke coverage.
  - Addressed by extracting [RuntimeLifecycle.tsx](/E:/git/subathon_timer/apps/desktop/src/components/RuntimeLifecycle.tsx) and testing it directly.

### Low

- Selector/effect rules were implicit rather than written down.
  - Addressed by this doc and `AGENTS.md` guidance updates.

## Hard Rules

- No inline nested object or array creation inside Zustand selectors.
- No `map`, `filter`, object spread, or payload assembly inside selectors.
- Build native sync/persistence payloads after selection with `useMemo` or plain render logic.
- Cross-store orchestration belongs in dedicated runtime hooks, not page components.
- Effects that write to stores or native bridges must have an idempotency guard or explicit dependency-shrinking strategy.

## Residual Risk

- Async native bridge calls can still race under rapid toggle/change sequences, especially overlay LAN mode and wheel moderation flows.
- EventSub reconnect behavior still depends on runtime Twitch auth state changing cleanly; this is functionally guarded but should continue to get manual smoke coverage.
- The app still relies on several async side-effect hooks; the new tests reduce risk but do not replace end-to-end Tauri validation.

## Guardrail Coverage Added

- Runtime composition render smoke test
- App store event idempotency test
- Existing timer/event/wheel/config tests retained

## Manual Smoke Checklist

- Browser dev loads without a blank screen
- `tauri:dev` loads without a blank screen
- Connections page connects Twitch and restores EventSub once
- Overlay studio renders and updates transform/LAN state without instability
- Wheel spin/apply still mutates timer/activity once
