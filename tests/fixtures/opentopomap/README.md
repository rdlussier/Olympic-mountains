# OpenTopoMap fixtures

Small test-only excerpts of [OpenTopoMap](https://opentopomap.org/) tiles covering the Olympic Mountains route. They exist so browser tests run entirely from committed fixtures rather than the live tile service.

Coverage spans zoom levels 11 and 12 (the zooms used by the three test viewports) with a one-tile margin around the padded route bounds.

- Map data © [OpenStreetMap contributors](https://www.openstreetmap.org/copyright), SRTM
- Cartography © [OpenTopoMap](https://opentopomap.org/) ([CC-BY-SA 3.0](https://creativecommons.org/licenses/by-sa/3.0/))

Regenerate the fixtures with:

```sh
npm run fixtures:map
```

The downloader is throttled and skips tiles that already exist, so reruns only fill gaps.
