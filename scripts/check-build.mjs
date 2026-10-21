#!/usr/bin/env node

import { readdir, readFile, stat } from 'node:fs/promises'
import { dirname, join, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url))
const PROJECT_ROOT = resolve(SCRIPT_DIR, '..')
const DIST = join(PROJECT_ROOT, 'dist')
const BUILD_JSON = join(DIST, 'build.json')
const SERVICE_WORKER = join(DIST, 'sw.js')
const IGNORED_NAMES = new Set(['sw.js', 'build.json', '.DS_Store'])
const SOURCE_PATHS = ['/src/', 'lib/leaflet', '?v=']
const PLACEHOLDERS = ['__CACHE_NAME__', '__PRECACHE__']

function fail(title, offenders = []) {
  const detail = offenders.length
    ? '\n' + offenders.map((offender) => `  - ${offender}`).join('\n')
    : ''

  throw new Error(`${title}${detail}`)
}

async function walk(dir, base = dir) {
  const entries = await readdir(dir, { withFileTypes: true })
  const files = []

  for (const entry of entries) {
    if (entry.name === '.DS_Store') continue

    const absolute = join(dir, entry.name)

    if (entry.isDirectory()) {
      files.push(...await walk(absolute, base))
    } else if (entry.isFile()) {
      files.push(relative(base, absolute).split(sep).join('/'))
    }
  }

  return files
}

function isPrecacheFile(file) {
  return !IGNORED_NAMES.has(file.split('/').pop()) && !file.endsWith('.map')
}

function localTarget(reference) {
  const value = reference.trim()

  if (!value) return null
  if (value.startsWith('//')) return null
  if (/^(?:[a-z][a-z0-9+.-]*:)/i.test(value)) return null
  if (value.startsWith('#')) return null

  return decodeURIComponent(value.split(/[?#]/)[0])
}

async function exists(path) {
  try {
    return (await stat(path)).isFile()
  } catch {
    return false
  }
}

async function main() {
  try {
    await stat(DIST)
  } catch {
    fail(`Missing build output: ${relative(PROJECT_ROOT, DIST)}/ does not exist`)
  }

  let build

  try {
    build = JSON.parse(await readFile(BUILD_JSON, 'utf8'))
  } catch (error) {
    fail(`Could not read dist/build.json: ${error.message}`)
  }

  if (!Array.isArray(build.files) || build.files.length === 0) {
    fail('dist/build.json does not contain a files list')
  }

  let serviceWorker

  try {
    serviceWorker = await readFile(SERVICE_WORKER, 'utf8')
  } catch {
    fail('Missing dist/sw.js')
  }

  if (build.files[0] !== './') {
    fail(`The first precache entry must be ./, found ${JSON.stringify(build.files[0])}`)
  }

  const missingPrecache = []

  for (const entry of build.files.slice(1)) {
    if (typeof entry !== 'string' || !entry.startsWith('./')) {
      missingPrecache.push(`invalid entry ${JSON.stringify(entry)}`)
      continue
    }

    if (!await exists(join(DIST, entry.slice(2)))) {
      missingPrecache.push(entry)
    }
  }

  if (missingPrecache.length) {
    fail('Precache entries are missing from dist:', missingPrecache)
  }

  const distFiles = (await walk(DIST)).filter(isPrecacheFile)
  const listed = new Set(build.files.slice(1).map((entry) => entry.slice(2)))
  const unlisted = distFiles.filter((file) => !listed.has(file))

  if (unlisted.length) {
    fail('Files in dist are missing from the precache list:', unlisted)
  }

  const cacheName = `hdl-app-${build.id}`

  if (!serviceWorker.includes(cacheName)) {
    fail(`dist/sw.js does not contain the cache name ${cacheName}`)
  }

  const precacheMatch = /F=(\[[^\]]*\]);/.exec(serviceWorker)

  if (!precacheMatch) {
    fail('Could not find the generated precache array in dist/sw.js')
  }

  let precache

  try {
    precache = JSON.parse(precacheMatch[1])
  } catch (error) {
    fail(`Could not parse the generated precache array in dist/sw.js: ${error.message}`)
  }

  if (JSON.stringify(precache) !== JSON.stringify(build.files)) {
    fail('The precache array in dist/sw.js does not match dist/build.json files')
  }

  const placeholderFiles = []

  for (const file of await walk(DIST)) {
    const contents = await readFile(join(DIST, file))

    for (const placeholder of PLACEHOLDERS) {
      if (contents.includes(placeholder)) {
        placeholderFiles.push(`${file}: ${placeholder}`)
      }
    }
  }

  if (placeholderFiles.length) {
    fail('Unresolved build placeholders remain in dist:', placeholderFiles)
  }

  const sourcePathFiles = []

  for (const file of await walk(DIST)) {
    const contents = await readFile(join(DIST, file), 'utf8')

    for (const sourcePath of SOURCE_PATHS) {
      if (contents.includes(sourcePath)) {
        sourcePathFiles.push(`${file}: ${sourcePath}`)
      }
    }
  }

  if (sourcePathFiles.length) {
    fail('Unresolved source paths remain in dist:', sourcePathFiles)
  }

  const indexHtml = await readFile(join(DIST, 'index.html'), 'utf8')
  const references = [...indexHtml.matchAll(/\b(?:href|src)\s*=\s*["']([^"']+)["']/gi)]
    .map((match) => localTarget(match[1]))
    .filter(Boolean)
  const missingAssets = []

  for (const reference of new Set(references)) {
    const target = reference.startsWith('/') ? reference.slice(1) : reference

    if (!await exists(join(DIST, target))) {
      missingAssets.push(reference)
    }
  }

  if (missingAssets.length) {
    fail('dist/index.html references assets that do not exist:', missingAssets)
  }

  console.log(`build ${build.id}: ${build.files.length} files, OK`)
}

main().catch((error) => {
  console.error(`Build check failed: ${error.message}`)
  process.exitCode = 1
})
