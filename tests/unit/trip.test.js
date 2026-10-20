import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const tripPath = fileURLToPath(new URL('../../public/trips/olympic/trip.json', import.meta.url))
const trip = JSON.parse(readFileSync(tripPath, 'utf8'))

const isFiniteNumber = (value) => typeof value === 'number' && Number.isFinite(value)
const isNonEmptyString = (value) => typeof value === 'string' && value.trim().length > 0
const isValidLatitude = (value) => isFiniteNumber(value) && value >= -90 && value <= 90
const isValidLongitude = (value) => isFiniteNumber(value) && value >= -180 && value <= 180

const routeKm = trip.route.map((point) => point[2])
const routeLastKm = routeKm[routeKm.length - 1]
const routeLatitudes = trip.route.map((point) => point[0])
const routeLongitudes = trip.route.map((point) => point[1])

describe('trip metadata', () => {
  it('identifies the trip', () => {
    for (const field of ['id', 'name', 'short', 'region', 'activity', 'timezone']) {
      expect(isNonEmptyString(trip[field]), `${field} should be a non-empty string`).toBe(true)
    }
  })

  it('has usable weather and declination values', () => {
    expect(isFiniteNumber(trip.declination)).toBe(true)
    expect(Array.isArray(trip.weather) || typeof trip.weather === 'object').toBe(true)
    expect(isFiniteNumber(trip.weather.lat)).toBe(true)
    expect(isFiniteNumber(trip.weather.lon)).toBe(true)
  })

  it('defines a valid offline tile box', () => {
    expect(trip.offline.mode).toBe('box')
    expect(isFiniteNumber(trip.offline.padding)).toBe(true)
    expect(trip.offline.padding).toBeGreaterThan(0)
    expect(isFiniteNumber(trip.offline.zoomMin)).toBe(true)
    expect(isFiniteNumber(trip.offline.zoomMax)).toBe(true)
    expect(trip.offline.zoomMin).toBeLessThan(trip.offline.zoomMax)
  })
})

describe('route and elevation', () => {
  it('stores matching route and elevation series', () => {
    expect(Array.isArray(trip.route)).toBe(true)
    expect(Array.isArray(trip.elevation)).toBe(true)
    expect(trip.route.length).toBeGreaterThanOrEqual(2)
    expect(trip.elevation.length).toBe(trip.route.length)
    expect(trip.elevation.every(isFiniteNumber)).toBe(true)
  })

  it('has a valid, monotonically increasing route', () => {
    let previousKm = -Infinity

    for (const [index, point] of trip.route.entries()) {
      expect(Array.isArray(point), `route point ${index} should be an array`).toBe(true)
      expect(isValidLatitude(point[0]), `route point ${index} latitude`).toBe(true)
      expect(isValidLongitude(point[1]), `route point ${index} longitude`).toBe(true)
      expect(isFiniteNumber(point[2]), `route point ${index} km`).toBe(true)
      expect(point[2], `route point ${index} km should be non-negative`).toBeGreaterThanOrEqual(0)
      expect(point[2], `route point ${index} km should not decrease`).toBeGreaterThanOrEqual(previousKm)
      previousKm = point[2]
    }

    expect(trip.route[0][2]).toBe(0)
    expect(routeLastKm).toBeGreaterThan(0)
  })
})

describe('days and stops', () => {
  it('covers the route with contiguous days', () => {
    expect(Array.isArray(trip.days)).toBe(true)
    expect(trip.days.length).toBeGreaterThan(0)
    expect(trip.days[0].from).toBe(0)

    for (const [index, day] of trip.days.entries()) {
      expect(isNonEmptyString(day.title), `day ${index + 1} title`).toBe(true)
      expect(isNonEmptyString(day.desc), `day ${index + 1} description`).toBe(true)
      expect(Array.isArray(day.stops), `day ${index + 1} stops`).toBe(true)
      expect(day.stops.length).toBeGreaterThan(0)
      expect(day.from, `day ${index + 1} should start before it ends`).toBeLessThan(day.to)

      if (index > 0) {
        expect(day.from, `day ${index + 1} should start where day ${index} ends`).toBe(trip.days[index - 1].to)
      }
    }

    expect(trip.days[trip.days.length - 1].to).toBe(routeLastKm)
  })

  it('has ordered, in-range stops for every day', () => {
    for (const [dayIndex, day] of trip.days.entries()) {
      let previousKm = -Infinity

      for (const [stopIndex, stop] of day.stops.entries()) {
        const label = `day ${dayIndex + 1} stop ${stopIndex + 1}`

        expect(Array.isArray(stop), `${label} should be an array`).toBe(true)
        expect(isFiniteNumber(stop[0]), `${label} km`).toBe(true)
        expect(isNonEmptyString(stop[1]), `${label} name`).toBe(true)
        expect(isNonEmptyString(stop[2]), `${label} description`).toBe(true)
        expect(['s', 'c', 'e', 'p'], `${label} type`).toContain(stop[3])
        expect(stop[0], `${label} km should be within its day`).toBeGreaterThanOrEqual(day.from)
        expect(stop[0], `${label} km should be within its day`).toBeLessThanOrEqual(day.to)
        expect(stop[0], `${label} km should not decrease`).toBeGreaterThanOrEqual(previousKm)

        if (stop.length > 4 || stop[4] !== undefined) {
          expect(isValidLatitude(stop[4]), `${label} latitude`).toBe(true)
          expect(isValidLongitude(stop[5]), `${label} longitude`).toBe(true)
        }

        previousKm = stop[0]
      }

      expect(day.stops[0][0], `day ${dayIndex + 1} should start at its first stop`).toBe(day.from)
      expect(day.stops[day.stops.length - 1][0], `day ${dayIndex + 1} should end at its last stop`).toBe(day.to)
    }
  })
})

describe('sidetrips', () => {
  it('stays within valid days and coordinate ranges', () => {
    expect(Array.isArray(trip.sidetrips)).toBe(true)

    for (const [index, sidetrip] of trip.sidetrips.entries()) {
      const label = `sidetrip ${index + 1}`

      expect(isNonEmptyString(sidetrip.name), `${label} name`).toBe(true)
      expect(Number.isInteger(sidetrip.day), `${label} day`).toBe(true)
      expect(sidetrip.day).toBeGreaterThanOrEqual(1)
      expect(sidetrip.day).toBeLessThanOrEqual(trip.days.length)
      expect(Array.isArray(sidetrip.points), `${label} points`).toBe(true)
      expect(sidetrip.points.length).toBeGreaterThanOrEqual(2)

      for (const [pointIndex, point] of sidetrip.points.entries()) {
        const pointLabel = `${label} point ${pointIndex + 1}`

        expect(Array.isArray(point), `${pointLabel} should be an array`).toBe(true)
        expect(point.length, `${pointLabel} should be a pair`).toBeGreaterThanOrEqual(2)
        expect(isValidLatitude(point[0]), `${pointLabel} latitude`).toBe(true)
        expect(isValidLongitude(point[1]), `${pointLabel} longitude`).toBe(true)
      }
    }
  })
})

describe('water sources', () => {
  it('are valid and near the route', () => {
    expect(Array.isArray(trip.water)).toBe(true)

    const box = {
      minLat: Math.min(...routeLatitudes),
      maxLat: Math.max(...routeLatitudes),
      minLng: Math.min(...routeLongitudes),
      maxLng: Math.max(...routeLongitudes)
    }
    const margin = 0.01

    for (const [index, water] of trip.water.entries()) {
      const label = `water ${index + 1}`

      expect(isValidLatitude(water.lat), `${label} latitude`).toBe(true)
      expect(isValidLongitude(water.lng), `${label} longitude`).toBe(true)
      expect(isNonEmptyString(water.n), `${label} name`).toBe(true)
      expect(isFiniteNumber(water.d), `${label} distance`).toBe(true)
      expect(water.d, `${label} distance should be non-negative`).toBeGreaterThanOrEqual(0)
      expect(isFiniteNumber(water.km), `${label} km`).toBe(true)
      expect(water.km, `${label} km should be on the route`).toBeGreaterThanOrEqual(0)
      expect(water.km, `${label} km should be on the route`).toBeLessThanOrEqual(routeLastKm)
      expect(water.lat, `${label} latitude should be near the route`).toBeGreaterThanOrEqual(box.minLat - margin)
      expect(water.lat, `${label} latitude should be near the route`).toBeLessThanOrEqual(box.maxLat + margin)
      expect(water.lng, `${label} longitude should be near the route`).toBeGreaterThanOrEqual(box.minLng - margin)
      expect(water.lng, `${label} longitude should be near the route`).toBeLessThanOrEqual(box.maxLng + margin)
    }
  })
})
