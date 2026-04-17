# Shared Session Service

Small Bun service used by the shared-subathon planning branch.

Current scope:

- create a shared room
- join a shared room by invite code
- keep participant presence live over WebSocket
- own the shared timer snapshot for the room
- accept host-only timer actions over WebSocket
- accept normalized Twitch events from connected participants
- dedupe and apply qualifying Twitch timer events once
- broadcast a shared activity feed with creator labels
- broadcast room snapshots back to both desktop apps
- structurally support up to 6 creators in one room

This scaffold now covers Phase 3 of the shared-subathon plan. It is still intentionally in-memory only and tip-provider ingestion is still deferred to Phase 4.

## Run

```bash
cd apps/shared-session-service
bun run start
```

Default bind:

- `http://127.0.0.1:31947`

## Endpoints

- `GET /health`
- `POST /sessions`
- `POST /sessions/join`
- `GET /ws?token=<joinToken>` (WebSocket upgrade)

## Notes

- state is in-memory only in this scaffold
- invite codes and join tokens are ephemeral
- restarting the service clears active rooms
- `SHARED_SESSION_MAX_PARTICIPANTS` defaults to `6`
