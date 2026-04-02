# Tip Providers

This desktop app can add time from third-party tip providers without shipping provider secrets inside the desktop client.

## Quick links

### StreamElements

- Dashboard: https://streamelements.com/dashboard
- Astro websocket docs: https://docs.streamelements.com/websockets
- Tip setup docs: https://docs.streamelements.com/chatbot/commands/default/tip

### Streamlabs

- Dashboard login: https://streamlabs.com/login?r=https%3A%2F%2Fstreamlabs.com%2Fdashboard
- Register your application: https://dev.streamlabs.com/docs/register-your-application
- Connecting users to your app: https://dev.streamlabs.com/docs/connecting-to-an-account
- Obtain an access token: https://dev.streamlabs.com/docs/obtain-an-access_token
- Submit your application: https://dev.streamlabs.com/docs/submit-your-application
- Donations endpoint docs: https://dev.streamlabs.com/reference/donations
- Scope list: https://dev.streamlabs.com/docs/scopes

For end users:

- Streamlabs now uses app-owned OAuth through the auth bridge, so users only approve your app.
- StreamElements still requires a user-specific token until StreamElements provides OAuth2 app access for this project.

## StreamElements

As of March 2026, StreamElements documents tip events on the Astro websocket gateway:

- Websocket docs: https://docs.streamelements.com/websockets
- Tip topic docs: https://docs.streamelements.com/websockets/topics/channel-tips
- Activities topic docs: https://docs.streamelements.com/websockets/topics/channel-activities

The app uses:

- websocket endpoint: `wss://astro.streamelements.com/`
- subscription topic: `channel.tips`
- token types supported by the docs: `apikey`, `jwt`, `oauth2`

Current limitation:

- The public docs support websocket auth with `oauth2`, but StreamElements does not currently provide a self-service public app flow in the docs used for this repo.
- Official StreamElements support indicates OAuth2 credentials require an application/request process rather than a normal public signup flow.
- Until that access is available for this project, the desktop app still uses a user-specific StreamElements token.

Recommended setup in this app:

1. Open the StreamElements dashboard: https://streamelements.com/dashboard
2. Switch to the exact channel you stream from before copying any token.
3. Copy a websocket-capable token for that channel. The docs note that token/channel mismatches are a common source of silent subscriptions.
4. If you need the provider-side tipping page configured, use the official tip setup docs: https://docs.streamelements.com/chatbot/commands/default/tip
5. In `Connections`, choose the StreamElements token type and paste the token.
6. Connect the provider and verify that incoming tips appear in `Recent StreamElements tips`.

## Streamlabs

As of April 2026, Streamlabs still documents realtime donation events through the Socket API, and it also documents `GET /donations` with the `donations.read` scope:

- Donations endpoint: https://dev.streamlabs.com/reference/donations
- OAuth account connection guide: https://dev.streamlabs.com/docs/connecting-to-an-account
- Scope list: https://dev.streamlabs.com/docs/scopes
- Obtain access token: https://dev.streamlabs.com/docs/obtain-an-access_token
- Socket API guide: https://dev.streamlabs.com/docs/socket-api

This app intentionally uses the donations endpoint instead of the legacy Socket.IO sample client, and it now uses a backend auth bridge for token exchange.

The desktop app now supports an app-owned OAuth flow for Streamlabs. That means:

- you register the Streamlabs app once
- you run or deploy the auth bridge with the Streamlabs client ID and client secret
- users click `Connect Streamlabs` instead of pasting raw access tokens
- the desktop app receives the local callback and sends the code to the auth bridge
- the auth bridge exchanges the code with your `client_secret`
- the desktop app stores the resulting user token securely and refreshes it through the bridge when Streamlabs rotates or expires the access token

Required redirect URI for the desktop app:

- `http://127.0.0.1:31847/auth/streamlabs/callback`

Owner setup:

1. Open the Streamlabs dashboard: https://streamlabs.com/login?r=https%3A%2F%2Fstreamlabs.com%2Fdashboard
2. Register a Streamlabs developer app: https://dev.streamlabs.com/docs/register-your-application
3. Add this redirect URI to that app exactly: `http://127.0.0.1:31847/auth/streamlabs/callback`
4. Run or deploy `apps/auth-bridge` with `STREAMLABS_CLIENT_ID` and `STREAMLABS_CLIENT_SECRET`.
5. Build the desktop app with `VITE_TIP_AUTH_BRIDGE_URL` pointing at that bridge.
6. Users click `Connect Streamlabs`.
7. Users approve your app in the browser when Streamlabs opens.
8. The app polls `GET https://streamlabs.com/api/v2.0/donations?limit=10`.
9. Only donation IDs newer than the last seen donation are applied to the timer.

Local development default:

- If `VITE_TIP_AUTH_BRIDGE_URL` is not set, the desktop app expects the bridge at `http://127.0.0.1:8788`.
- In that case, run `cd apps/auth-bridge && bun run dev` before pressing `Connect Streamlabs`.

Why this implementation:

- Streamlabs still recommends the Socket API in docs.
- Their documented sample uses the legacy Socket.IO 2 client.
- This app avoids reintroducing that legacy client dependency and instead uses the official donations endpoint with `donations.read`.
- Streamlabs OAuth still requires a client secret for token exchange, so the clean desktop flow depends on an auth bridge you control.

Approval note:

- Before Streamlabs approves the app, only up to 10 whitelisted users can authorize it.
- For broader/public use, submit the app for review: https://dev.streamlabs.com/docs/submit-your-application

After connecting, verify that incoming donations appear in `Recent Streamlabs tips` on the `Connections` page.

## Timer Rule

Both providers feed the same `Tips / donations` rule in `Rules`:

- `Amount unit`: the money unit the rule is based on
- `Seconds`: how many seconds each unit adds

The app applies tips proportionally:

- example: `Amount unit = 1.00`
- example: `Seconds = 15`
- a `4.20` tip adds `round(4.2 * 15) = 63` seconds

## Testing

Manual smoke path:

1. Connect StreamElements or Streamlabs in `Connections`.
2. Enable `Tips / donations` in `Rules`.
3. Set a clear test value like `1.00 -> 15s`.
4. Send a real or provider-side test donation.
5. Confirm:
   - the provider panel logs the tip
   - the dashboard activity feed records the event
   - the timer moves by the expected amount
