import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

const appRoot = resolve(import.meta.dirname, '..')
const versionFile = resolve(appRoot, 'VERSION')
const packageJsonFile = resolve(appRoot, 'package.json')
const tauriConfigFile = resolve(appRoot, 'src-tauri', 'tauri.conf.json')
const cargoTomlFile = resolve(appRoot, 'src-tauri', 'Cargo.toml')
const changelogFile = resolve(appRoot, 'CHANGELOG.md')
const patchNotesFile = resolve(appRoot, 'PATCH_NOTES.md')

const command = process.argv[2] ?? 'check'
const nextVersionArg = process.argv[3] ?? null

const currentVersion = readVersionFile()

switch (command) {
  case 'check':
    runCheck(currentVersion)
    break
  case 'check-notes':
    runNotesCheck(currentVersion)
    break
  case 'sync':
    writeAllTargets(currentVersion)
    logSuccess(`Synced desktop version ${currentVersion}.`)
    break
  case 'patch':
  case 'minor':
  case 'major': {
    const nextVersion = bumpVersion(currentVersion, command)
    writeVersionFile(nextVersion)
    writeAllTargets(nextVersion)
    logSuccess(`Bumped desktop version to ${nextVersion}.`)
    break
  }
  case 'set': {
    if (!nextVersionArg) {
      fail('Provide a version, for example: node ./scripts/version.mjs set 0.2.0')
    }

    assertSemver(nextVersionArg)
    writeVersionFile(nextVersionArg)
    writeAllTargets(nextVersionArg)
    logSuccess(`Set desktop version to ${nextVersionArg}.`)
    break
  }
  default:
    fail(`Unknown version command "${command}". Use check, check-notes, sync, patch, minor, major, or set.`)
}

function runCheck(expectedVersion) {
  const packageJsonVersion = readJson(packageJsonFile).version
  const tauriVersion = readJson(tauriConfigFile).version
  const cargoVersion = readCargoPackageVersion()

  const mismatches = [
    ['VERSION', expectedVersion],
    ['apps/desktop/package.json', packageJsonVersion],
    ['apps/desktop/src-tauri/tauri.conf.json', tauriVersion],
    ['apps/desktop/src-tauri/Cargo.toml', cargoVersion],
  ].filter(([, value]) => value !== expectedVersion)

  if (mismatches.length > 0) {
    const lines = mismatches.map(([label, value]) => `- ${label}: ${value ?? 'missing'}`)
    fail(`Desktop versions are out of sync.\nExpected: ${expectedVersion}\n${lines.join('\n')}`)
  }

  logSuccess(`Desktop versions are in sync at ${expectedVersion}.`)
}

function writeAllTargets(version) {
  updatePackageJsonVersion(version)
  updateTauriConfigVersion(version)
  updateCargoTomlVersion(version)
}

function runNotesCheck(expectedVersion) {
  const missing = [
    ['apps/desktop/CHANGELOG.md', fileContainsVersionHeading(changelogFile, expectedVersion)],
    ['apps/desktop/PATCH_NOTES.md', fileContainsVersionHeading(patchNotesFile, expectedVersion)],
  ].filter(([, hasVersion]) => !hasVersion)

  if (missing.length > 0) {
    const lines = missing.map(([label]) => `- ${label}`)
    fail(`Desktop release notes are missing version ${expectedVersion}.\n${lines.join('\n')}`)
  }

  logSuccess(`Desktop release notes include ${expectedVersion}.`)
}

function updatePackageJsonVersion(version) {
  const payload = readJson(packageJsonFile)
  payload.version = version
  writeJson(packageJsonFile, payload)
}

function updateTauriConfigVersion(version) {
  const payload = readJson(tauriConfigFile)
  payload.version = version
  writeJson(tauriConfigFile, payload)
}

function updateCargoTomlVersion(version) {
  const source = readFileSync(cargoTomlFile, 'utf8')
  const packageSectionPattern = /(\[package\][\s\S]*?\nversion\s*=\s*")([^"]+)(")/

  if (!packageSectionPattern.test(source)) {
    fail('Unable to find the [package] version entry in src-tauri/Cargo.toml.')
  }

  const nextSource = source.replace(packageSectionPattern, `$1${version}$3`)
  writeFileSync(cargoTomlFile, nextSource)
}

function readCargoPackageVersion() {
  const source = readFileSync(cargoTomlFile, 'utf8')
  const match = source.match(/(\[package\][\s\S]*?\nversion\s*=\s*")([^"]+)(")/)
  return match?.[2] ?? null
}

function readVersionFile() {
  const value = readFileSync(versionFile, 'utf8').trim()
  assertSemver(value)
  return value
}

function writeVersionFile(version) {
  writeFileSync(versionFile, `${version}\n`)
}

function bumpVersion(version, mode) {
  const [major, minor, patch] = version.split('.').map((part) => Number.parseInt(part, 10))

  if (mode === 'major') {
    return `${major + 1}.0.0`
  }

  if (mode === 'minor') {
    return `${major}.${minor + 1}.0`
  }

  return `${major}.${minor}.${patch + 1}`
}

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'))
}

function fileContainsVersionHeading(path, version) {
  try {
    const source = readFileSync(path, 'utf8')
    return new RegExp(`^##\\s+${escapeRegExp(version)}\\b`, 'm').test(source)
  } catch {
    return false
  }
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function writeJson(path, value) {
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`)
}

function assertSemver(value) {
  if (!/^\d+\.\d+\.\d+$/.test(value)) {
    fail(`Invalid version "${value}". Expected a simple semver like 0.1.0.`)
  }
}

function logSuccess(message) {
  console.log(message)
}

function fail(message) {
  console.error(message)
  process.exit(1)
}
