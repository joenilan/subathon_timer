# Tip Providers

This desktop app can add time from third-party tip providers without using `.env` files.

## StreamElements

As of March 2026, StreamElements documents tip events on the Astro websocket gateway:

- Websocket docs: https://docs.streamelements.com/websockets
- Tip topic docs: https://docs.streamelements.com/websockets/topics/channel-tips
- Activities topic docs: https://docs.streamelements.com/websockets/topics/channel-activities

The app uses:

- websocket endpoint: `wss://astro.streamelements.com/`
- subscription topic: `channel.tips`
- token types supported by the docs: `apikey`, `jwt`, `oauth2`

Recommended setup in this app:

1. Open the StreamElements dashboard for the correct channel.
2. Copy a websocket-capable token for that channel. The docs note that token/channel mismatches are a common source of silent subscriptions.
3. In `Connections`, choose the StreamElements token type and paste the token.
4. Connect the provider and verify that incoming tips appear in `Recent StreamElements tips`.

## Streamlabs

As of April 2026, Streamlabs still documents realtime donation events through the Socket API, and it also documents `GET /donations` with the `donations.read` scope:

- Donations endpoint: https://dev.streamlabs.com/reference/donations
- OAuth account connection guide: https://dev.streamlabs.com/docs/connecting-to-an-account
- Scope list: https://dev.streamlabs.com/docs/scopes
- Obtain access token: https://dev.streamlabs.com/docs/obtain-an-access_token
- Socket API guide: https://dev.streamlabs.com/docs/socket-api

This app intentionally uses the donations endpoint instead of the legacy Socket.IO sample client:

1. Obtain an OAuth access token for a registered Streamlabs app.
2. Paste that access token into `Connections`.
3. The app polls `GET https://streamlabs.com/api/v2.0/donations?limit=10`.
4. Only donation IDs newer than the last seen donation are applied to the timer.

Why this implementation:

- Streamlabs still recommends the Socket API in docs.
- Their documented sample uses the legacy Socket.IO 2 client.
- This app avoids reintroducing that legacy client dependency and instead uses the official donations endpoint with `donations.read`.

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
