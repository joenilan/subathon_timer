import { createSharedSessionServer } from './createServer'

const HOST = process.env.SHARED_SESSION_HOST ?? '127.0.0.1'
const PORT = Number.parseInt(process.env.SHARED_SESSION_PORT ?? '31947', 10)
const MAX_PARTICIPANTS = Number.parseInt(process.env.SHARED_SESSION_MAX_PARTICIPANTS ?? '6', 10)
const DEFAULT_TIMER_SECONDS = Number.parseInt(
  process.env.SHARED_SESSION_DEFAULT_TIMER_SECONDS ?? '21600',
  10,
)

const { port } = createSharedSessionServer({
  host: HOST,
  port: PORT,
  maxParticipants: MAX_PARTICIPANTS,
  defaultTimerSeconds: DEFAULT_TIMER_SECONDS,
})

console.log(`Shared Session Service listening on http://${HOST}:${port}`)
