import { execSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'
import { basename, resolve } from 'node:path'
import SftpClient from 'ssh2-sftp-client'

const appRoot = resolve(import.meta.dirname, '..')
const repoRoot = resolve(appRoot, '..', '..')
const envFile = process.env.RPI_ENV_FILE ?? resolve(repoRoot, '.env.raspi')
const releaseRoot = resolve(appRoot, 'release', 'windows')
const version = readFileSync(resolve(appRoot, 'VERSION'), 'utf8').trim()
const patchNotesSource = readFileSync(resolve(appRoot, 'PATCH_NOTES.md'), 'utf8')

const env = {
  ...loadEnvFile(envFile),
  ...process.env,
}

const host = requiredEnv(env, 'SSH_HOST')
const username = requiredEnv(env, 'SSH_USER')
const password = requiredEnv(env, 'SSH_PASSWORD')
const port = Number.parseInt(env.SSH_PORT ?? '22', 10)
const appSlug = env.RELEASE_APP_SLUG ?? 'subathon-timer'
const baseDir = env.RPI_RELEASE_BASE_DIR ?? '/mnt/data/sites/apps/public/downloads'
const channel = env.RELEASE_CHANNEL ?? 'stable'
const remoteDir = `${baseDir.replace(/\/+$/, '')}/${appSlug}`

const setupName = `subathon-timer_${version}_x64-setup.exe`
const setupSigName = `${setupName}.sig`
const portableName = `subathon-timer_${version}_x64_portable.zip`
const msiName = `subathon-timer_${version}_x64_en-US.msi`
const manifestName = 'manifest.json'
const notesName = 'notes.md'
const latestName = 'latest.json'
const updaterName = 'updater.json'
const remoteLatestPath = `${remoteDir}/${latestName}`
const remoteArchiveRoot = `${remoteDir}/archive`
const downloadBase = `https://apps.zombie.digital/downloads/${appSlug}`

const notesMarkdown = extractVersionNotes(patchNotesSource, version)

// Sign the NSIS installer for Tauri's updater
const setupPath = resolve(releaseRoot, setupName)
const privateKeyPath = process.env.TAURI_SIGNING_PRIVATE_KEY_PATH
const privateKeyPassword = process.env.TAURI_SIGNING_PRIVATE_KEY_PASSWORD ?? ''
if (!privateKeyPath) throw new Error('TAURI_SIGNING_PRIVATE_KEY_PATH env var is not set')
execSync(
  `bunx tauri signer sign -k "${privateKeyPath}" --password "${privateKeyPassword}" "${setupPath}"`,
  { stdio: 'inherit' },
)
const setupSig = readFileSync(resolve(releaseRoot, setupSigName), 'utf8').trim()

// latest.json — site download button format (unchanged)
const latest = {
  version,
  channel,
  publishedAt: new Date().toISOString(),
  file: setupName,
  notes: summarizeNotes(notesMarkdown),
  notesFile: notesName,
  files: {
    setup: setupName,
    portable: portableName,
    msi: msiName,
  },
}

// updater.json — Tauri plugin format
const updater = {
  version,
  notes: notesMarkdown.trim(),
  pub_date: new Date().toISOString(),
  platforms: {
    'windows-x86_64': {
      signature: setupSig,
      url: `${downloadBase}/${setupName}`,
    },
  },
}

const latestPath = resolve(releaseRoot, latestName)
const updaterPath = resolve(releaseRoot, updaterName)
const notesPath = resolve(releaseRoot, notesName)

writeFileSync(latestPath, `${JSON.stringify(latest, null, 2)}\n`)
writeFileSync(updaterPath, `${JSON.stringify(updater, null, 2)}\n`)
writeFileSync(notesPath, `${notesMarkdown.trim()}\n`)

const uploadPaths = [
  setupName,
  setupSigName,
  `${setupName}.sha256`,
  portableName,
  `${portableName}.sha256`,
  msiName,
  `${msiName}.sha256`,
  manifestName,
  latestName,
  updaterName,
  notesName,
].map((name) => resolve(releaseRoot, name))

for (const path of uploadPaths) {
  readFileSync(path)
}

const sftp = new SftpClient()

try {
  await sftp.connect({
    host,
    port,
    username,
    password,
  })

  await sftp.mkdir(remoteDir, true)
  await archiveCurrentTopLevelRelease(sftp)

  for (const localPath of uploadPaths) {
    const remotePath = `${remoteDir}/${basename(localPath)}`
    await sftp.put(localPath, remotePath)
  }
} finally {
  await sftp.end().catch(() => {})
}

console.log(`Published Subathon Timer ${version} to ${remoteDir}`)
for (const localPath of uploadPaths) {
  console.log(`- ${basename(localPath)}`)
}

async function archiveCurrentTopLevelRelease(sftp) {
  const latestExists = await sftp.exists(remoteLatestPath)
  if (!latestExists) {
    return
  }

  const latestSource = await sftp.get(remoteLatestPath)
  const previousRelease = JSON.parse(bufferToString(latestSource))
  const previousVersion = previousRelease?.version

  if (!previousVersion || previousVersion === version) {
    return
  }

  const archiveDir = `${remoteArchiveRoot}/${previousVersion}`
  await sftp.mkdir(archiveDir, true)

  const entries = await sftp.list(remoteDir)
  for (const entry of entries) {
    if (entry.name === 'archive' || entry.type !== '-') {
      continue
    }

    const from = `${remoteDir}/${entry.name}`
    const to = `${archiveDir}/${entry.name}`
    if (await sftp.exists(to)) {
      await sftp.delete(to)
    }

    await sftp.rename(from, to)
  }
}

function loadEnvFile(path) {
  const source = readFileSync(path, 'utf8')
  const parsed = {}

  for (const rawLine of source.split(/\r?\n/)) {
    const line = rawLine.trim()
    if (!line || line.startsWith('#')) {
      continue
    }

    const separatorIndex = line.indexOf('=')
    if (separatorIndex === -1) {
      continue
    }

    const key = line.slice(0, separatorIndex).trim()
    const value = line.slice(separatorIndex + 1).trim()
    parsed[key] = value
  }

  return parsed
}

function requiredEnv(env, key) {
  const value = env[key]
  if (!value) {
    throw new Error(`Missing required release env: ${key}`)
  }

  return value
}

function extractVersionNotes(source, targetVersion) {
  const sectionPattern = new RegExp(
    `^##\\s+${escapeRegExp(targetVersion)}\\s*$([\\s\\S]*?)(?=^##\\s+\\S|\\s*$)`,
    'm',
  )
  const match = source.match(sectionPattern)

  if (!match) {
    throw new Error(`Unable to find patch notes for version ${targetVersion}`)
  }

  return `## ${targetVersion}\n${match[1].trimEnd()}`
}

function summarizeNotes(notesMarkdown) {
  const bullet = notesMarkdown
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find((line) => line.startsWith('- '))

  return bullet ? bullet.slice(2) : `Subathon Timer ${version}`
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function bufferToString(value) {
  if (typeof value === 'string') {
    return value
  }

  if (Buffer.isBuffer(value)) {
    return value.toString('utf8')
  }

  if (value instanceof Uint8Array) {
    return Buffer.from(value).toString('utf8')
  }

  throw new Error('Unsupported SFTP response when reading latest.json')
}
