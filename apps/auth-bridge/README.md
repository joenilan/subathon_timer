# Auth Bridge

This app is the provider-auth backend for the desktop client.

It exists so the desktop app can let end users authorize their own provider accounts without shipping provider client secrets inside the Tauri binary.

## Current Provider Support

- Streamlabs: supported
- StreamElements: not yet supported through the bridge

Streamlabs flow:

1. Desktop app asks the bridge for a Streamlabs authorize URL.
2. User approves your Streamlabs app in the browser.
3. Streamlabs redirects back to the desktop app's local callback.
4. Desktop app sends the returned `code` and `state` to this bridge.
5. The bridge exchanges the code with your `client_secret`.
6. Desktop app stores the user token locally, refreshes it through the bridge when needed, and polls donations.

## Environment

Required for Streamlabs:

- `STREAMLABS_CLIENT_ID`
- `STREAMLABS_CLIENT_SECRET`

Optional:

- `AUTH_BRIDGE_HOST`
  Default: `127.0.0.1`
- `AUTH_BRIDGE_PORT`
  Default: `8788`
- `STREAMLABS_ALLOWED_REDIRECT_HOSTS`
  Default: `127.0.0.1,localhost`
- `STREAMLABS_SCOPES`
  Default: `donations.read`

## Development

Install dependencies:

```bash
cd apps/auth-bridge
bun install --frozen-lockfile
```

Run locally:

```bash
cd apps/auth-bridge
bun run dev
```

Health check:

```bash
curl http://127.0.0.1:8788/health
```

## Streamlabs App Registration

Register one Streamlabs app that you control and add this redirect URI:

- `http://127.0.0.1:31847/auth/streamlabs/callback`

Official docs:

- Register app: https://dev.streamlabs.com/docs/register-your-application
- Connect account: https://dev.streamlabs.com/docs/connecting-to-an-account
- Obtain token: https://dev.streamlabs.com/docs/obtain-an-access_token
- Donations API: https://dev.streamlabs.com/reference/donations

## Notes

- This bridge intentionally does not persist provider user tokens server-side.
- The desktop app stores the user token locally after the bridge returns it.
- The bridge only keeps short-lived pending OAuth `state` entries in memory.
