# Subathon Timer

Desktop-first Twitch subathon timer built with Tauri, React, and TypeScript. The active app lives in `apps/desktop` and includes:

- Twitch device auth with secure native token storage in Tauri
- EventSub-driven timer updates and activity history
- StreamElements and Streamlabs tip support wired into the timer rules
- OBS-ready timer and reason overlays served from the desktop app
- A configurable spin wheel with time and moderation outcomes

The legacy root `src/` and `public/` app is kept as behavior reference only. New work should target `apps/desktop`.

## Repository Layout

- `apps/desktop/`: active desktop app
- `apps/desktop/src/`: React UI, state stores, timer logic, overlays
- `apps/desktop/src-tauri/`: native Tauri shell and loopback overlay server
- `apps/desktop/docs/`: desktop-specific implementation notes and roadmap docs
- `apps/shared-session-service/`: Bun shared-session service scaffold for create/join, presence, server-owned shared timer snapshots, shared Twitch event ingestion, tip-only provider ingestion, and shared wheel runtime

Important planning docs:

- [apps/desktop/docs/persistence-roadmap.md](/E:/git/subathon_timer/apps/desktop/docs/persistence-roadmap.md)
- [apps/desktop/docs/shared-subathon-plan.md](/E:/git/subathon_timer/apps/desktop/docs/shared-subathon-plan.md)

Shared-subathon phase status is tracked directly inside [apps/desktop/docs/shared-subathon-plan.md](/E:/git/subathon_timer/apps/desktop/docs/shared-subathon-plan.md). Keep that document updated as phases start, change scope, or complete.

## Quick Start

### Prerequisites

- Bun 1.2+
- Rust toolchain
- Tauri prerequisites for your platform

### Run The Desktop App

```bash
cd apps/desktop
bun install --frozen-lockfile
bun run dev
```

Browser dev runs on `http://127.0.0.1:1420`.

To run the real desktop shell:

```bash
cd apps/desktop
bun run tauri:dev
```

## Validation

Frontend build:

```bash
cd apps/desktop
bun run build
```

Native layer:

```bash
cargo check --manifest-path apps/desktop/src-tauri/Cargo.toml
```

Unit tests:

```bash
cd apps/desktop
bun run test
```

## Twitch And Overlay Flow

1. Open the desktop app.
2. Connect Twitch from `Connections`.
3. Confirm EventSub shows a live session and active subscriptions.
4. Open `Overlays` and use the generated local or LAN URL in OBS.

## Tip Providers

Tip setup now follows the same simple model many streamer tools use:

1. Open the provider dashboard from `Connections`
2. Copy the provider token they already expose
3. Paste it into the app
4. Click `Connect`

Current provider paths:

- StreamElements: channel JWT token from the channel secrets page
- Streamlabs: Socket API Token from `Dashboard > Settings > API Settings > API Tokens`
- Neither current path requires end users to deal with OAuth app credentials or a separate hosted auth service.

Details and current provider notes are in [apps/desktop/docs/tip-providers.md](/E:/git/subathon_timer/apps/desktop/docs/tip-providers.md).

In browser-only dev mode, overlay previews fall back to in-app routes. In Tauri, the app serves loopback overlay URLs intended for OBS browser sources.

## Release Notes

Desktop app versioning is managed from `apps/desktop/VERSION`.

Useful commands:

```bash
cd apps/desktop
bun run version:check
bun run version:check-notes
bun run version:patch
bun run release:windows
bun run release:publish
```

When preparing a desktop release, update:

- `apps/desktop/CHANGELOG.md`
- `apps/desktop/PATCH_NOTES.md`

`bun run release:windows` builds the Windows installers and a portable zip, then copies normalized artifacts into `apps/desktop/release/windows/`.

`bun run release:publish` uses the local root `.env.raspi` file to upload those release artifacts plus `latest.json` and `notes.md` to the Raspberry Pi-hosted downloads directory.

The public app site now reads `/downloads/<slug>/latest.json` at runtime, so publishing release metadata does not require an Astro rebuild. For this app, the publish target is `/mnt/data/sites/apps/public/downloads/subathon-timer/`.

Publish layout policy:

- keep only the current live release at the top level
- move the previous top-level release into `/mnt/data/sites/apps/public/downloads/subathon-timer/archive/<version>/`
- archive the previous installers, hashes, `manifest.json`, `latest.json`, and `notes.md` together

## License

This project is licensed under the GNU General Public License v3.0. See `LICENSE`.
