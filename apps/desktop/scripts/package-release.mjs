import { createHash } from 'node:crypto'
import { mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync, copyFileSync } from 'node:fs'
import { resolve, join, basename } from 'node:path'

const appRoot = resolve(import.meta.dirname, '..')
const version = readFileSync(resolve(appRoot, 'VERSION'), 'utf8').trim()
const bundleRoot = resolve(appRoot, 'src-tauri', 'target', 'release', 'bundle')
const releaseRoot = resolve(appRoot, 'release', 'windows')
const releaseSlug = 'subathon-timer'

rmSync(releaseRoot, { recursive: true, force: true })
mkdirSync(releaseRoot, { recursive: true })

const packagedArtifacts = []

for (const spec of [
  { sourceDir: 'msi', extension: '.msi', outputName: `${releaseSlug}_${version}_x64_en-US.msi` },
  { sourceDir: 'nsis', extension: '.exe', outputName: `${releaseSlug}_${version}_x64-setup.exe` },
]) {
  const sourcePath = findBundleArtifact(join(bundleRoot, spec.sourceDir), spec.extension, version)
  const targetPath = join(releaseRoot, spec.outputName)
  copyFileSync(sourcePath, targetPath)

  const fileBuffer = readFileSync(targetPath)
  const sha256 = createHash('sha256').update(fileBuffer).digest('hex')
  writeFileSync(`${targetPath}.sha256`, `${sha256}  ${basename(targetPath)}\n`)

  packagedArtifacts.push({
    kind: spec.sourceDir,
    source: sourcePath,
    output: targetPath,
    size: statSync(targetPath).size,
    sha256,
  })
}

const manifest = {
  version,
  generatedAt: new Date().toISOString(),
  artifacts: packagedArtifacts.map(({ kind, output, size, sha256 }) => ({
    kind,
    file: basename(output),
    size,
    sha256,
  })),
}

writeFileSync(resolve(releaseRoot, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`)

console.log(`Packaged Windows release artifacts for ${version}:`)
for (const artifact of packagedArtifacts) {
  console.log(`- ${basename(artifact.output)}`)
}

function findBundleArtifact(directory, extension, activeVersion) {
  const entries = readdirSync(directory, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith(extension))
    .map((entry) => join(directory, entry.name))

  if (entries.length === 0) {
    throw new Error(`No ${extension} artifact found in ${directory}`)
  }

  const versionedEntries = entries.filter((entry) => basename(entry).includes(`_${activeVersion}_`))

  if (versionedEntries.length === 1) {
    return versionedEntries[0]
  }

  if (versionedEntries.length > 1) {
    throw new Error(`Expected a single ${extension} artifact for ${activeVersion} in ${directory}, found ${versionedEntries.length}`)
  }

  if (entries.length > 1) {
    throw new Error(`Expected a single ${extension} artifact in ${directory}, found ${entries.length}`)
  }

  return entries[0]
}
