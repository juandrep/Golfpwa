# Map providers and policy

## Default source
- Esri World Imagery
- URL: `https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}`
- Label overlay: `https://services.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}`

## Alternative sources
- OpenStreetMap HOT
- URL: `https://a.tile.openstreetmap.fr/hot/{z}/{x}/{y}.png`
- Carto Voyager
- URL: `https://a.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}.png`

## Respectful usage
- Tile source is user-selectable in Settings.
- Runtime tile caching is enabled with capped entries and age (provider-specific caches in Workbox).
- Attribution is configured in style source definitions.
- Avoid aggressive background refresh and over-zooming.

## Course data reference
- Course: Vale da Pinta - Pestana Golf Resort (Portugal)
- Measurement note: all distances are measured from the stone point in the tees to the center of the green.
- Course total:
  - White: 6127 m
  - Yellow: 5769 m
  - Red: 5244 m
  - Orange: 4866 m
  - Par: 71
