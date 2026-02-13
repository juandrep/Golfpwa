# Map providers and policy

## Default source
- OpenStreetMap Standard
- URL: `https://tile.openstreetmap.org/{z}/{x}/{y}.png`

## Alternative source
- OpenStreetMap HOT
- URL: `https://a.tile.openstreetmap.fr/hot/{z}/{x}/{y}.png`

## Respectful usage
- Algarve course catalog import is sourced from Overpass (`leisure=golf_course`) and then cached in IndexedDB.
- Tile source is user-selectable in Settings.
- Runtime tile caching is enabled with capped entries and age.
- Attribution is configured in style source definitions.
- Avoid aggressive background refresh and over-zooming.

See: <https://operations.osmfoundation.org/policies/tiles/>
