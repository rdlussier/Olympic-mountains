import { createHash } from 'node:crypto'
import { readdir, readFile, stat, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'

const root = path.dirname(fileURLToPath(import.meta.url))
const buildInputs = ['index.html', 'vite.config.js', 'src', 'public']
const distIgnores = new Set(['sw.js', 'build.json', '.DS_Store'])

async function walk(dir, base = root) {
  const entries = await readdir(dir, { withFileTypes: true })
  const files = []

  for (const entry of entries) {
    if (entry.name === '.DS_Store') continue

    const absolute = path.join(dir, entry.name)

    if (entry.isDirectory()) {
      files.push(...await walk(absolute, base))
    } else if (entry.isFile()) {
      files.push(path.relative(base, absolute).split(path.sep).join('/'))
    }
  }

  return files
}

async function computeBuildId() {
  const files = []

  for (const input of buildInputs) {
    const absolute = path.join(root, input)
    const info = await stat(absolute)

    if (info.isDirectory()) {
      files.push(...await walk(absolute))
    } else if (info.isFile() && path.basename(absolute) !== '.DS_Store') {
      files.push(path.relative(root, absolute).split(path.sep).join('/'))
    }
  }

  files.sort()

  const hash = createHash('sha256')

  for (const file of files) {
    hash.update(file)
    hash.update('\0')
    hash.update(await readFile(path.join(root, file)))
    hash.update('\0')
  }

  return hash.digest('hex').slice(0, 8)
}

function serviceWorkerPlugin(buildId) {
  const dist = path.join(root, 'dist')

  return {
    name: 'service-worker-build-id',
    apply: 'build',
    async closeBundle() {
      const all = (await walk(dist, dist)).filter((file) => {
        const name = path.posix.basename(file)
        return !distIgnores.has(file) && !distIgnores.has(name) && !name.endsWith('.map')
      })
      all.sort()

      const precache = ['./', ...all.map((file) => './' + file)]
      const distSw = path.join(dist, 'sw.js')
      const buildJson = path.join(dist, 'build.json')

      if (precache[0] !== './') {
        throw new Error('Precache list must start with the scope root ./')
      }

      for (const entry of precache.slice(1)) {
        const file = entry.slice(2)

        try {
          await stat(path.join(dist, file))
        } catch {
          throw new Error(`Precache entry missing from dist: ${file}`)
        }
      }

      let sw

      try {
        sw = await readFile(distSw, 'utf8')
      } catch {
        throw new Error('dist/sw.js is missing; cannot inject build id')
      }

      for (const token of ['__CACHE_NAME__', '__PRECACHE__']) {
        if (!sw.includes(token)) throw new Error(`dist/sw.js is missing the ${token} token`)
      }

      sw = sw
        .split('__CACHE_NAME__').join(buildId)
        .split('__PRECACHE__').join(JSON.stringify(precache))

      await writeFile(distSw, sw)
      await writeFile(buildJson, JSON.stringify({ id: buildId, files: precache }, null, 2) + '\n')
      console.log(`build ${buildId}: cache hdl-app-${buildId}, ${precache.length} files precached`)
    }
  }
}

export default defineConfig(async ({ command }) => {
  if (command === 'serve') {
    return {
      base: './',
      define: { __BUILD_ID__: JSON.stringify('dev') },
      server: {
        host: '127.0.0.1',
        port: 11100
      },
      preview: {
        host: '127.0.0.1',
        port: 11101
      }
    }
  }

  const buildId = await computeBuildId()

  return {
    base: './',
    define: { __BUILD_ID__: JSON.stringify(buildId) },
    plugins: [serviceWorkerPlugin(buildId)],
    server: {
      host: '127.0.0.1',
      port: 11100
    },
    preview: {
      host: '127.0.0.1',
      port: 11101
    }
  }
})
