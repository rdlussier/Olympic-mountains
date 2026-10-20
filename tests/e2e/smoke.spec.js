import { expect, test } from '@playwright/test'
import { readFile } from 'node:fs/promises'
import path from 'node:path'

const projectRoot = path.resolve(import.meta.dirname, '..', '..')
const tileFixtureRoot = path.join(projectRoot, 'tests', 'fixtures', 'opentopomap')
const appOrigin = 'http://127.0.0.1:11100'

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

test('app shell and map render deterministically', async ({ page }, testInfo) => {
  const unexpectedRequests = []
  const missingTileFixtures = []
  const pageErrors = []
  const consoleErrors = []

  page.on('pageerror', (error) => pageErrors.push(error.message))
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text())
  })

  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'serviceWorker', {
      configurable: true,
      get() {
        return {
          controller: null,
          ready: new Promise(() => {}),
          register: () => new Promise(() => {}),
          getRegistrations: () => Promise.resolve([]),
          addEventListener: () => {},
          removeEventListener: () => {},
        }
      },
    })

    Object.defineProperty(navigator, 'geolocation', {
      configurable: true,
      get() {
        return {
          getCurrentPosition: () => {},
          watchPosition: () => 1,
          clearWatch: () => {},
        }
      },
    })
  })

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
          missingTileFixtures.push(path.relative(projectRoot, fixturePath))
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

    unexpectedRequests.push(requestUrl.href)
    await route.abort('blockedbyclient')
  })

  await page.goto('/', { waitUntil: 'load' })

  await expect(page).toHaveTitle('High Divide Loop')
  await expect(page.locator('#body h2')).toHaveText('High Divide and Appleton Pass Loop')
  await expect(page.locator('#tabs button')).toHaveCount(5)
  await expect(page.locator('.dcard')).toHaveCount(4)
  await expect(page.locator('#tabs button[aria-selected="true"]')).toHaveText('All')

  await expect.poll(() => page.locator('img.leaflet-tile').count(), { timeout: 10000 }).toBeGreaterThan(0)
  await expect
    .poll(
      () =>
        page.$$eval('img.leaflet-tile', (tiles) =>
          tiles.length > 0 && tiles.every((tile) => tile.complete && tile.naturalWidth > 0),
        ),
      { timeout: 10000 },
    )
    .toBe(true)

  await page.waitForTimeout(3600)
  await expect(page.locator('#toast')).toBeHidden({ timeout: 10000 })

  expect(unexpectedRequests, `Unexpected external requests:\n${unexpectedRequests.join('\n')}`).toEqual([])
  expect(missingTileFixtures, `Missing tile fixtures:\n${missingTileFixtures.join('\n')}`).toEqual([])
  expect(pageErrors, `Page errors:\n${pageErrors.join('\n')}`).toEqual([])
  expect(consoleErrors, `Console errors:\n${consoleErrors.join('\n')}`).toEqual([])

  await expect(page).toHaveScreenshot(`${testInfo.project.name}.png`)
})
