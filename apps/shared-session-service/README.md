# Shared Session Service

Small Bun service used by the shared-subathon planning branch.

Current scope:

- create a shared room
- join a shared room by invite code
- keep participant presence live over WebSocket
- broadcast room snapshots back to both desktop apps

This is intentionally Phase 1 only. It does not own timer mutation yet.

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
