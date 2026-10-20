#!/usr/bin/env node

import { mkdir, readFile, rename, stat, unlink, writeFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url))
const PROJECT_ROOT = resolve(SCRIPT_DIR, '..')
const TRIP_PATH = join(PROJECT_ROOT, 'public/trips/olympic/trip.json')
const FIXTURE_ROOT = join(PROJECT_ROOT, 'tests/fixtures/opentopomap')
const TILE_URL = 'https://a.tile.opentopomap.org/{z}/{x}/{y}.png'
const USER_AGENT = 'high-divide-loop-map-fixtures/1.0'
const THROTTLE_MS = 100
const RETRIES = 3
const ZOOMS = [11, 12]
const LAT_PADDING = 0.1
const LNG_PADDING = 0.2
const TILE_MARGIN = 1
const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])

const sleep = (ms) => new Promise((resolvePromise) => setTimeout(resolvePromise, ms))

const lonToTile = (lon, zoom) => Math.floor(((lon + 180) / 360) * 2 ** zoom)

const latToTile = (lat, zoom) => {
  const radians = (lat * Math.PI) / 180
  return Math.floor(
    ((1 - Math.log(Math.tan(radians) + 1 / Math.cos(radians)) / Math.PI) / 2) * 2 ** zoom
  )
}

const clampTile = (value, zoom) => Math.min(Math.max(value, 0), 2 ** zoom - 1)

function boundsFromRoute(route) {
  const latitudes = route.map((point) => point[0])
  const longitudes = route.map((point) => point[1])

  return {
    minLat: Math.min(...latitudes) - LAT_PADDING,
    maxLat: Math.max(...latitudes) + LAT_PADDING,
    minLng: Math.min(...longitudes) - LNG_PADDING,
    maxLng: Math.max(...longitudes) + LNG_PADDING
  }
}

function tileRanges(bounds, zoom) {
  return {
    xMin: clampTile(lonToTile(bounds.minLng, zoom) - TILE_MARGIN, zoom),
    xMax: clampTile(lonToTile(bounds.maxLng, zoom) + TILE_MARGIN, zoom),
    yMin: clampTile(latToTile(bounds.maxLat, zoom) - TILE_MARGIN, zoom),
    yMax: clampTile(latToTile(bounds.minLat, zoom) + TILE_MARGIN, zoom)
  }
}

async function existingTileSize(path) {
  try {
    const info = await stat(path)
    return info.isFile() && info.size > 0 ? info.size : 0
  } catch {
    return 0
  }
}

async function downloadTile(url, destination) {
  let lastError

  for (let attempt = 0; attempt <= RETRIES; attempt += 1) {
    try {
      const response = await fetch(url, {
        headers: { 'User-Agent': USER_AGENT, Accept: 'image/png,image/*;q=0.8' }
      })

      if (!response.ok) {
        throw new Error(`HTTP ${response.status} ${response.statusText}`)
      }

      const body = Buffer.from(await response.arrayBuffer())

      if (body.length === 0) {
        throw new Error('empty response body')
      }

      if (!body.subarray(0, PNG_SIGNATURE.length).equals(PNG_SIGNATURE)) {
        throw new Error('response is not a PNG')
      }

      const temporaryPath = `${destination}.part`
      await writeFile(temporaryPath, body)
      await rename(temporaryPath, destination)
      return body.length
    } catch (error) {
      lastError = error
      await unlink(`${destination}.part`).catch(() => {})

      if (attempt < RETRIES) {
        await sleep(500 * 2 ** attempt)
      }
    }
  }

  throw lastError
}

async function readRoute() {
  const trip = JSON.parse(await readFile(TRIP_PATH, 'utf8'))

  if (!Array.isArray(trip.route) || trip.route.length === 0) {
    throw new Error(`No route points found in ${TRIP_PATH}`)
  }

  return trip.route
}

async function main() {
  const route = await readRoute()
  const bounds = boundsFromRoute(route)

  let downloaded = 0
  let skipped = 0
  let failed = 0
  let downloadedBytes = 0
  let existingBytes = 0
  const failures = []

  console.log(
    `Route bounds (padded): lat ${bounds.minLat.toFixed(5)}..${bounds.maxLat.toFixed(5)}, ` +
      `lng ${bounds.minLng.toFixed(5)}..${bounds.maxLng.toFixed(5)}`
  )

  for (const zoom of ZOOMS) {
    const { xMin, xMax, yMin, yMax } = tileRanges(bounds, zoom)
    console.log(`z${zoom}: x ${xMin}-${xMax}, y ${yMin}-${yMax}`)

    for (let x = xMin; x <= xMax; x += 1) {
      for (let y = yMin; y <= yMax; y += 1) {
        const directory = join(FIXTURE_ROOT, String(zoom), String(x))
        const destination = join(directory, `${y}.png`)
        const size = await existingTileSize(destination)

        if (size > 0) {
          skipped += 1
          existingBytes += size
          continue
        }

        await mkdir(directory, { recursive: true })

        const url = TILE_URL.replace('{z}', zoom).replace('{x}', x).replace('{y}', y)

        try {
          const bytes = await downloadTile(url, destination)
          downloaded += 1
          downloadedBytes += bytes
          process.stdout.write(`  downloaded z${zoom}/${x}/${y}.png (${bytes} bytes)\n`)
        } catch (error) {
          failed += 1
          failures.push({ url, message: error.message })
          process.stderr.write(`  failed z${zoom}/${x}/${y}.png: ${error.message}\n`)
        }

        await sleep(THROTTLE_MS)
      }
    }
  }

  const totalBytes = downloadedBytes + existingBytes

  console.log('')
  console.log('Map fixture summary')
  console.log(`  downloaded: ${downloaded} tiles (${downloadedBytes} bytes)`)
  console.log(`  skipped:    ${skipped} tiles (${existingBytes} bytes)`)
  console.log(`  failed:     ${failed} tiles`)
  console.log(`  total:      ${downloaded + skipped} files (${totalBytes} bytes)`)

  if (failed > 0) {
    console.error('')
    console.error('Failed tiles:')
    for (const failure of failures) {
      console.error(`  ${failure.url}: ${failure.message}`)
    }
    process.exitCode = 1
  }
}

main().catch((error) => {
  console.error(`Map fixture download failed: ${error.message}`)
  process.exitCode = 1
})
