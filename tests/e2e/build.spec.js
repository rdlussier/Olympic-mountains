import { expect, test } from '@playwright/test'
import { readFile } from 'node:fs/promises'
import path from 'node:path'

const projectRoot = path.resolve(import.meta.dirname, '..', '..')
const tileFixtureRoot = path.join(projectRoot, 'tests', 'fixtures', 'opentopomap')
const buildPath = path.join(projectRoot, 'dist', 'build.json')

function dailyForecast(startDate, endDate) {
  const days = []
  const start = new Date(`${startDate}T00:00:00Z`)
  const end = new Date(`${endDate}T00:00:00Z`)

  if (!Number.isNaN(start.getTime()) && !Number.isNaN(end.getTime()) && start <= end) {
    for (const day = new Date(start); day <= end; day.setUTCDate(day.getUTCDate() + 1)) {
      days.push(day.toISOString().slice(0, 10))
    }
  }

  if (!days.length) days.push(startDate || endDate || '1970-01-01')

  const maxima = [16, 14, 12, 15, 17, 13, 11]
  const minima = [7, 6, 5, 8, 9, 6, 4]
  const rain = [20, 45, 60, 30, 15, 55, 35]
  const wind = [12, 18, 22, 15, 11, 20, 16]

  return {
    latitude: 47.955,
    longitude: -123.835,
    timezone: 'America/Los_Angeles',
    daily: {
      time: days,
      temperature_2m_max: days.map((_, index) => maxima[index % maxima.length]),
      temperature_2m_min: days.map((_, index) => minima[index % minima.length]),
      precipitation_probability_max: days.map((_, index) => rain[index % rain.length]),
      wind_speed_10m_max: days.map((_, index) => wind[index % wind.length]),
    },
  }
}

async function blockExternalOrigins(page, appOrigin) {
  await page.route('**/*', async (route) => {
    const requestUrl = new URL(route.request().url())

    if (requestUrl.origin === appOrigin) {
      await route.continue()
      return
    }

    if (
      requestUrl.protocol === 'https:' &&
      /^[abc]\.tile\.opentopomap\.org$/.test(requestUrl.hostname)
    ) {
      const match = requestUrl.pathname.match(/^\/(\d+)\/(\d+)\/(\d+)\.png$/)

      if (match) {
        const [, z, x, y] = match
        const fixturePath = path.join(tileFixtureRoot, z, x, `${y}.png`)

        try {
          const body = await readFile(fixturePath)
          await route.fulfill({ status: 200, contentType: 'image/png', body })
        } catch {
          await route.fulfill({ status: 404, body: 'Missing tile fixture' })
        }
        return
      }
    }

    if (
      requestUrl.origin === 'https://api.open-meteo.com' &&
      requestUrl.pathname === '/v1/forecast'
    ) {
      const startDate = requestUrl.searchParams.get('start_date')
      const endDate = requestUrl.searchParams.get('end_date')

      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(dailyForecast(startDate, endDate)),
      })
      return
    }

    await route.abort('blockedbyclient')
  })
}

async function readBuild() {
  return JSON.parse(await readFile(buildPath, 'utf8'))
}

const TRIP_HEADING = 'High Divide and Appleton Pass Loop'

test.describe('production assets', () => {
  test.use({ serviceWorkers: 'block' })

  test('loads without missing assets', async ({ page }, testInfo) => {
    const appOrigin = new URL(testInfo.project.use.baseURL).origin
    const badResponses = []
    const failedRequests = []
    const sourceRequests = []

    page.on('response', (response) => {
      const url = new URL(response.url())
      if (url.origin === appOrigin && response.status() >= 400) {
        badResponses.push(`${response.status()} ${url.pathname}`)
      }
    })

    page.on('requestfailed', (request) => {
      const url = new URL(request.url())
      if (url.origin === appOrigin) {
        failedRequests.push(`${url.pathname} (${request.failure()?.errorText})`)
      }
    })

    page.on('request', (request) => {
      if (request.url().includes('/src/')) sourceRequests.push(request.url())
    })

    await blockExternalOrigins(page, appOrigin)
    await page.goto('/', { waitUntil: 'load' })
    await expect(page.locator('#body h2')).toHaveText(TRIP_HEADING)

    const assets = await page.evaluate(() => ({
      scripts: [...document.querySelectorAll('script[src]')].map((script) => script.getAttribute('src')),
      styles: [...document.querySelectorAll('link[rel="stylesheet"]')].map((link) => link.getAttribute('href')),
    }))

    expect(badResponses, `Failed responses:\n${badResponses.join('\n')}`).toEqual([])
    expect(failedRequests, `Failed requests:\n${failedRequests.join('\n')}`).toEqual([])
    expect(sourceRequests, `Source requests:\n${sourceRequests.join('\n')}`).toEqual([])
    expect(assets.scripts).toHaveLength(1)
    expect(assets.styles).toHaveLength(1)
    expect(assets.scripts[0]).toMatch(/^\.\/assets\/.+-[A-Za-z0-9_-]+\.js$/)
    expect(assets.styles[0]).toMatch(/^\.\/assets\/.+-[A-Za-z0-9_-]+\.css$/)
  })
})

test.describe('service worker', () => {
  test('serves the app shell from a cold offline cache', async ({ page, context }, testInfo) => {
    const appOrigin = new URL(testInfo.project.use.baseURL).origin
    const { id, files } = await readBuild()
    const cacheName = `hdl-app-${id}`
    const js = files.find((file) => file.startsWith('./assets/') && file.endsWith('.js'))
    const css = files.find((file) => file.startsWith('./assets/') && file.endsWith('.css'))
    const pageErrors = []

    page.on('pageerror', (error) => pageErrors.push(error.message))

    await blockExternalOrigins(page, appOrigin)
    await page.goto('/', { waitUntil: 'load' })
    await page.evaluate(() => navigator.serviceWorker.ready)
    await expect(page.locator('#body h2')).toHaveText(TRIP_HEADING)

    const cacheState = await page.evaluate(
      async ({ name, paths }) => {
        const names = await caches.keys()
        if (!names.includes(name)) return { names, missing: paths }

        const cache = await caches.open(name)
        const missing = []

        for (const path of paths) {
          if (!await cache.match(path)) missing.push(path)
        }

        return { names, missing }
      },
      { name: cacheName, paths: ['./', js, css] },
    )

    expect(cacheState.names).toContain(cacheName)
    expect(cacheState.missing).toEqual([])

    await context.setOffline(true)
    await page.reload({ waitUntil: 'load' })
    await expect(page.locator('#body h2')).toHaveText(TRIP_HEADING)
    expect(pageErrors, `Page errors:\n${pageErrors.join('\n')}`).toEqual([])
  })

  test('reloads safely while online and keeps one app cache', async ({ page }, testInfo) => {
    const appOrigin = new URL(testInfo.project.use.baseURL).origin
    const { id } = await readBuild()
    const pageErrors = []

    page.on('pageerror', (error) => pageErrors.push(error.message))

    await blockExternalOrigins(page, appOrigin)
    await page.goto('/', { waitUntil: 'load' })
    await page.evaluate(() => navigator.serviceWorker.ready)

    await page.reload({ waitUntil: 'load' })
    await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true)
    await expect(page.locator('#body h2')).toHaveText(TRIP_HEADING)

    await page.reload({ waitUntil: 'load' })
    await expect(page.locator('#body h2')).toHaveText(TRIP_HEADING)

    expect(pageErrors, `Page errors:\n${pageErrors.join('\n')}`).toEqual([])

    const appCaches = await page.evaluate(
      () => caches.keys().then((names) => names.filter((name) => name.startsWith('hdl-app-'))),
    )

    expect(appCaches).toEqual([`hdl-app-${id}`])
  })
})
