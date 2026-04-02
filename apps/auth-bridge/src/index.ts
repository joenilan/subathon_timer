import { loadAuthBridgeConfig } from './config'
import { createAuthBridgeServer } from './server'

const config = loadAuthBridgeConfig()
const server = createAuthBridgeServer(config)

Bun.serve({
  hostname: config.host,
  port: config.port,
  fetch: server.fetch,
})

console.log(
  `[auth-bridge] listening on http://${config.host}:${config.port} (streamlabs ${config.streamlabsClientId ? 'enabled' : 'disabled'})`,
)
