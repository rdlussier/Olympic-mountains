# High Divide and Appleton Pass Loop

> A trail companion web app, and installable PWA, for the High Divide and Appleton Pass loop in the Olympic Mountains.

> [!NOTE]
> The app is built to work offline after the first load. Install it to the home screen and save the map tiles for the trip area before setting out.

## Overview

The app shows the route on an OpenTopoMap base map, with a draggable panel for the day-by-day itinerary, elevation profiles, daylight times, a weather forecast, water sources and a compass. It is a static, framework-free Vite site: the app logic is vanilla JavaScript in `src/`, and Leaflet is bundled from npm.

Trip content comes from a single JSON file. The current trip is `public/trips/olympic/trip.json`, published at a stable URL so the app can fetch it and the service worker can precache it alongside the app shell.

## Getting started

Requires Node.js and npm.

```bash
npm install
npm run dev
```

The dev server runs at <http://127.0.0.1:11100>.

To build and preview the production output:

```bash
npm run build
npm run preview
```

`npm run build` writes the site to `dist/` with content-hashed assets. `npm run preview` serves that build at <http://127.0.0.1:11101>.

## Assets and build

- `index.html` is the Vite entry. It links `/src/style.css`, loads `/src/main.js` as a module, and keeps three small inline bootstrap scripts: the service-worker reset guard, a window error safety net, and a greeting alert.
- `src/` holds processed source. The JavaScript modules are bundled and the stylesheet is processed, with content-hashed output filenames under `dist/assets/`.
- `public/` is copied verbatim. It holds only files that need exact, stable URLs: the PWA icons, `logo.svg`, `manifest.json`, `sw.js`, the trip JSON and `reset.html`.
- `dist/` is generated output. Do not edit it by hand.

The service worker is generated at build time. A `closeBundle` plugin in `vite.config.js` derives an 8-character build id by hashing the build inputs, writes `dist/build.json`, shows the id in the app footer (`dev` in development), and rewrites `dist/sw.js` with the cache name `hdl-app-<id>` and a precache list covering the emitted assets. There is no manual version bump or `?v=` cache-buster: changed content produces a new build id and a new cache. See [Build and assets](docs/1.build.md) for the full pipeline, including `npm run check:build`.

## Testing

`npm test` runs the unit tests, the development end-to-end suite and the build/offline suite.

- `npm run test:unit` — Vitest tests for trip data and map fixtures.
- `npm run test:e2e` — Playwright smoke tests against the dev server, with visual baselines in `docs/screenshots/`.
- `npm run test:build` — builds the site, runs the build check, then tests the built output on port 11101, including a cold offline load.
- `npm run test:e2e:update` — refreshes the visual baselines after an intentional UI change.

## Screenshots

### Desktop landscape

![Desktop landscape screenshot](docs/screenshots/desktop-landscape.png)

### Tablet portrait

![Tablet portrait screenshot](docs/screenshots/tablet-portrait.png)

### Mobile portrait

![Mobile portrait screenshot](docs/screenshots/mobile-portrait.png)

## Further reading

- [Documentation index](docs/README.md)
- [Build and assets](docs/1.build.md)
- [Trip file format](docs/2.trip-format.md)
