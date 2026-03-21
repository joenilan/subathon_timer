# Desktop Persistence Roadmap

This file is the source of truth for the desktop app persistence migration. Update it whenever a phase meaningfully lands or changes scope. Do not let the implementation drift away from this roadmap without updating the document in the same pass.

## Working Rules

- Land small end-state slices, not throwaway intermediate work.
- Clean up dead code and misleading UI as phases land.
- Prefer removing obsolete persistence paths instead of keeping duplicate systems around.
- Keep React/browser preview behavior and Tauri/native behavior aligned as persistence changes move deeper into the app.

## Final Target

Split persistence by responsibility instead of saving one large renderer-side blob:

- UI preferences:
  - sidebar state
  - dashboard display mode
  - overlay transforms
  - selected timer theme
- Native app data:
  - timer rules
  - wheel configuration
  - timer session state
  - timer event/activity history
- Secure auth/session storage:
  - Twitch access token
  - Twitch refresh token
  - other secrets if provider integrations are added later

The renderer store should not be the durable source of truth for runtime data.

## Phases

### Phase 1: Trim renderer persistence

Status: Complete

Goal:
- Reduce renderer `localStorage` persistence to UI-only state.

Delivered:
- `fdgt.app.state` now stores only UI preferences.
- Volatile runtime fields are no longer intentionally persisted in the renderer store.

Follow-up cleanup still allowed:
- Remove any remaining dead compatibility fields from the renderer store once later phases make them unnecessary.

### Phase 2: Add native snapshot persistence

Status: Complete

Goal:
- Move core desktop state to a native persistence path while keeping browser dev workable.

Delivered:
- Native snapshot load/save path exists for the desktop app.
- Browser dev has a fallback snapshot path for verification without Tauri.
- App bootstrap hydrates from the native snapshot before runtime logic fully starts.

Current limitation:
- This is still a snapshot model, not the final session/event model for the timer.

### Phase 3: Rework the timer into a session + event model

Status: Complete

Goal:
- Replace the mutable countdown snapshot model with a durable timer session model.

Target shape:
- paused:
  - exact remaining seconds
- running:
  - baseline remaining seconds
  - started timestamp
- adjustments/events:
  - append-only event records for manual changes, Twitch events, and wheel results

Delivered:
- Native timer snapshots now store:
  - baseline remaining seconds
  - baseline uptime seconds
  - running anchor timestamp
  - recent timer events
- Timer activity and trend data are derived from recent timer events instead of being persisted as UI arrays.
- Running timers now resume from the persisted session anchor instead of relying on per-second saved countdown state.
- Snapshot shape is stable while the timer runs, so native persistence no longer churns every second just because the countdown is ticking.

### Phase 4: Move Twitch auth/session to native secure storage

Status: Complete

Goal:
- Remove Twitch tokens from renderer persistence.

Target shape:
- Tokens and secrets live in native secure storage or OS credential storage.
- Renderer state keeps only the minimum session metadata needed for UI.

Delivered:
- Twitch auth/session persistence no longer uses renderer-side Zustand `persist`.
- The desktop app now reads and writes Twitch tokens through native commands backed by OS credential storage.
- Browser dev keeps a local fallback path so the auth store can still be exercised outside Tauri.
- The existing device-code auth flow remains intact.

Notes:
- Do not move Twitch tokens into plain SQLite or plain `localStorage`.

### Phase 5: Remove dead legacy compatibility fields from the live model

Status: Complete

Goal:
- Finish removing compatibility baggage that no longer drives the real runtime.

Delivered:
- The `Settings` page was trimmed down to the live theme control plus legacy import.
- Legacy export UI was removed.
- Dead legacy fields were removed from:
  - `useAppStore.ts`
  - `nativeAppState.ts`
  - `App.tsx`
  - legacy import application flow
- Legacy config import now keeps the parts that still drive the desktop app:
  - timer rules
  - wheel segments
- Legacy channel, admin, blacklist, provider, and wheel-enable fields are intentionally ignored.

Post-phase schema updates:
- Native snapshot settings now also persist chat timer command permissions.
- Native snapshot settings now also persist the overlay LAN-access toggle used for dual-PC OBS setups.
- Browser dev and Tauri/native snapshot loading both normalize missing command-permission settings back to safe defaults.

## Current Order Of Work

All planned persistence phases are complete.

## Update Discipline

Whenever a persistence-related pass lands:

- update the phase status in this file
- record what actually shipped
- remove obsolete notes instead of letting the roadmap accumulate stale instructions
