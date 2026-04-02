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
- `bun run release:windows`: Build MSI + NSIS installers, plus a portable zip, then copy them into `release/windows/` with normalized no-space filenames
- `bun run release:publish`: Run `release:windows`, generate `latest.json` + `notes.md`, then upload the release files to the Raspberry Pi target from `.env.raspi`
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
- StreamElements currently uses the channel JWT token path from the channel secrets page.
- Streamlabs uses the Socket API Token flow documented by Streamlabs and Streamer.bot.
- The supported setup paths are end-user paths. No client ID, client secret, or hosted auth bridge is required for the current integrations.
- Setup details and the 2026 provider docs are in [docs/tip-providers.md](/E:/git/subathon_timer/apps/desktop/docs/tip-providers.md).

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
bun run release:windows
bun run release:publish
```

Update `CHANGELOG.md` and `PATCH_NOTES.md` in the same pass as the version bump.

Windows release artifacts are copied to `apps/desktop/release/windows/` as:

- `subathon-timer_<version>_x64_en-US.msi`
- `subathon-timer_<version>_x64-setup.exe`
- `subathon-timer_<version>_x64_portable.zip`
- matching `.sha256` files and a `manifest.json`

The portable zip contains `subathon-timer-portable.exe`. When that exe is launched, the app keeps its state in a local `data/` folder beside the executable instead of the normal Windows app-data location.

`release:publish` expects a local root-level `.env.raspi` file with the Raspberry Pi SSH details. That file is ignored by git and should stay local-only.

## Publish Contract

The public site reads release metadata at runtime from:

- `/downloads/subathon-timer/latest.json`

So a publish from this repo must upload to:

- `/mnt/data/sites/apps/public/downloads/subathon-timer/`

`bun run release:publish` is the canonical path for that. It uploads:

- `subathon-timer_<version>_x64_en-US.msi`
- `subathon-timer_<version>_x64-setup.exe`
- `subathon-timer_<version>_x64_portable.zip`
- matching `.sha256` files
- `manifest.json`
- `latest.json`
- `notes.md`

`latest.json` is the website-facing source of truth for the current release, and the site picks it up without an Astro rebuild.
