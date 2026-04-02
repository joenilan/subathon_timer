# Tip Providers

This desktop app keeps tip setup as close as possible to normal streamer tools:

- open the provider dashboard
- copy the token the provider already gives you
- paste it into `Connections`
- click `Connect`

No client IDs, client secrets, or local auth services are required for the supported flows below.

## Quick Links

### StreamElements

- Dashboard: https://streamelements.com/dashboard
- Channel secrets page: https://streamelements.com/dashboard/account/channels
- JWT token help article: https://support.streamelements.com/hc/en-us/articles/10474949304466-How-to-Locate-Your-Account-ID-and-JWT-Token
- Astro websocket docs: https://docs.streamelements.com/websockets
- Tip topic docs: https://docs.streamelements.com/websockets/topics/channel-tips
- Tip setup docs: https://docs.streamelements.com/chatbot/commands/default/tip

### Streamlabs

- Dashboard login: https://streamlabs.com/login?r=https%3A%2F%2Fstreamlabs.com%2Fdashboard
- Socket API docs: https://dev.streamlabs.com/docs/socket-api
- Socket token endpoint reference: https://dev.streamlabs.com/reference/sockettoken
- Streamlabs support article: https://support.streamlabs.com/hc/en-us/articles/115000090014-Alerts-Widget-Troubleshooting
- Streamer.bot Streamlabs guide: https://docs.streamer.bot/guide/integrations/streamlabs

## StreamElements

As of April 2, 2026, StreamElements documents tip events on the Astro websocket gateway:

- websocket endpoint: `wss://astro.streamelements.com/`
- topic: `channel.tips`
- supported token types in the docs: `jwt`, `apikey`, `oauth2`

This app currently uses the simple JWT-token route because it is the clearest normal-user setup available to this project right now.

Recommended setup:

1. Open `https://streamelements.com/dashboard/account/channels`
2. Switch to the exact channel you stream from
3. Show secrets and copy the JWT token for that channel
4. Paste it into `Connections > StreamElements`
5. Click `Connect StreamElements`

Important:

- If you copy the token from the wrong linked account, the app can connect but never receive tips.
- Streamer.bot does document a `Connect to StreamElements` OAuth flow:
  - https://docs.streamer.bot/guide/integrations/streamelements
- For this app, we are not using that path yet because StreamElements app-level OAuth credentials are not currently provisioned for this project.

## Streamlabs

As of April 2, 2026, Streamlabs documents the Socket API and Streamer.bot documents the same end-user setup:

- go to Dashboard > Settings > API Settings > API Tokens
- copy `Your Socket API Token`
- paste it into the app

That is the flow this app now follows.

Recommended setup:

1. Open the Streamlabs dashboard: https://streamlabs.com/login?r=https%3A%2F%2Fstreamlabs.com%2Fdashboard
2. Go to `Settings > API Settings > API Tokens`
3. Copy `Your Socket API Token`
4. Paste it into `Connections > Streamlabs`
5. Click `Connect Streamlabs`

Important:

- Use the Socket API Token, not an OAuth client ID, client secret, or developer app credential.
- This app now matches the simpler Streamer.bot-style Streamlabs setup instead of the earlier overcomplicated OAuth-bridge approach.

## Timer Rule

Both providers feed the same `Tips / donations` rule in `Rules`:

- `Amount unit`: the money unit the rule is based on
- `Seconds`: how many seconds each unit adds

The app applies tips proportionally:

- `Amount unit = 1.00`
- `Seconds = 15`
- a `4.20` tip adds `round(4.2 * 15) = 63` seconds

## Testing

Manual smoke path:

1. Connect StreamElements or Streamlabs in `Connections`
2. Enable `Tips / donations` in `Rules`
3. Set a clear test value like `1.00 -> 15s`
4. Send a real or provider-side test donation
5. Confirm:
   - the provider panel logs the tip
   - the dashboard activity feed records the event
   - the timer moves by the expected amount
