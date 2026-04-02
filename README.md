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

In browser-only dev mode, overlay previews fall back to in-app routes. In Tauri, the app serves loopback overlay URLs intended for OBS browser sources.

## Release Notes

Desktop app versioning is managed from `apps/desktop/VERSION`.

Useful commands:

```bash
cd apps/desktop
bun run version:check
bun run version:check-notes
bun run version:patch
```

When preparing a desktop release, update:

- `apps/desktop/CHANGELOG.md`
- `apps/desktop/PATCH_NOTES.md`

## License

This project is licensed under the GNU General Public License v3.0. See `LICENSE`.
