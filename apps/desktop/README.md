# Subathon Timer Desktop

The desktop app is the active implementation of `subathon_timer`. It combines a Tauri shell, React frontend, native Twitch session storage, EventSub runtime, and OBS-ready overlay hosting.

## Stack

- Tauri 2
- React 19
- TypeScript
- Zustand

## Development

Install dependencies:

```bash
bun install --frozen-lockfile
```

Run browser dev mode:

```bash
bun run dev
```

Run the full desktop app:

```bash
bun run tauri:dev
```

## Core Commands

- `bun run build`: Type-check and build the frontend bundle
- `bun run test`: Run unit tests with Vitest
- `bun run version:check`: Confirm desktop version files are in sync
- `bun run version:check-notes`: Confirm release notes include the active version
- `bun run version:patch|minor|major`: Bump `VERSION` and sync package metadata
- `cargo check --manifest-path src-tauri/Cargo.toml`: Validate the native layer

## Twitch Setup

The desktop app uses Twitch device auth from the `Connections` page.

Expected verification flow:

1. Start the app.
2. Open `Connections`.
3. Choose `Connect Twitch`.
4. Complete the device-code flow in the browser.
5. Return to the app and confirm:
   - Twitch status is connected
   - EventSub session is established
   - Core subscriptions were created

If moderation-based wheel outcomes are enabled, reconnect after scope changes so the saved session includes the required moderator scopes.

## Overlay Setup

The desktop app serves overlay HTML from a loopback HTTP server when running in Tauri.

Use the `Overlays` page to:

- copy the direct timer and reason overlay URLs
- toggle LAN access for dual-PC OBS setups
- adjust overlay transform values and theme

In browser-only dev mode, overlay previews fall back to route-based previews instead of the native loopback server.

## Tip Providers

The desktop app can now add time from StreamElements and Streamlabs tips.

- StreamElements uses the Astro websocket `channel.tips` topic.
- Streamlabs uses the official donations API plus the auth bridge in `apps/auth-bridge`.
- Setup details and the 2026 provider docs are in [docs/tip-providers.md](/E:/git/subathon_timer/apps/desktop/docs/tip-providers.md).

For public-user Streamlabs auth, the desktop app expects a bridge URL via `VITE_TIP_AUTH_BRIDGE_URL`. In local development it defaults to `http://127.0.0.1:8788`.

## Manual Smoke Tests

After changes to auth, runtime, overlays, or timer behavior, validate:

1. `bun run build`
2. `cargo check --manifest-path src-tauri/Cargo.toml`
3. Twitch connect and reconnect on `Connections`
4. EventSub session/subscription health after auth
5. Dashboard timer/activity updates after Twitch events
6. Overlay preview parity with dashboard state
7. Wheel spin and applied outcome behavior
8. Tip provider connect flow plus timer updates after a test donation

## Release Workflow

`VERSION` is the source of truth for the desktop app version.

Typical release preparation:

```bash
bun run version:patch
bun run version:check
bun run version:check-notes
bun run build
cargo check --manifest-path src-tauri/Cargo.toml
```

Update `CHANGELOG.md` and `PATCH_NOTES.md` in the same pass as the version bump.
