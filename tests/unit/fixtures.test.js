import { readdirSync, readFileSync } from 'node:fs'
import { join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const fixturesRoot = fileURLToPath(new URL('../fixtures/opentopomap', import.meta.url))
const pngSignature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
const tilePathPattern = /^(\d+)\/(\d+)\/(\d+)\.png$/

const listFiles = (directory) =>
  readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name)
    return entry.isDirectory() ? listFiles(path) : [path]
  })

const pngFiles = listFiles(fixturesRoot).filter((file) => file.endsWith('.png'))

describe('OpenTopoMap fixtures', () => {
  it('provides zoom levels 11 and 12', () => {
    const zooms = new Set(pngFiles.map((file) => relative(fixturesRoot, file).split('/')[0]))

    expect(zooms.has('11')).toBe(true)
    expect(zooms.has('12')).toBe(true)
  })

  it('stores every tile at z/x/y.png with integer coordinates', () => {
    expect(pngFiles.length).toBeGreaterThan(0)

    for (const file of pngFiles) {
      const path = relative(fixturesRoot, file).split('\\').join('/')
      const match = path.match(tilePathPattern)

      expect(match, `${path} should match <z>/<x>/<y>.png`).not.toBeNull()

      for (const coordinate of match.slice(1)) {
        expect(Number.isInteger(Number(coordinate)), `${path} should use integer coordinates`).toBe(true)
      }
    }
  })

  it('stores valid, non-empty PNG files', () => {
    for (const file of pngFiles) {
      const path = relative(fixturesRoot, file)
      const contents = readFileSync(file)

      expect(contents.length, `${path} should not be empty`).toBeGreaterThan(0)
      expect(contents.subarray(0, pngSignature.length).equals(pngSignature), `${path} should have a PNG signature`).toBe(true)
    }
  })
})
