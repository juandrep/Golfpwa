import type { StyleSpecification } from 'maplibre-gl';
import type { TileSource } from '../domain/types';

export const MAP_MAX_NATIVE_ZOOM = 19;
export const MAP_MAX_ZOOM = 21;

export function buildRasterMapStyle(tile: TileSource): StyleSpecification {
  if (!tile.urlTemplate) {
    throw new Error(`Tile source "${tile.id}" is missing urlTemplate.`);
  }
  const hasOverlay = Boolean(tile.labelOverlayUrlTemplate);
  return {
    version: 8,
    glyphs: 'https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf',
    sources: {
      base: {
        type: 'raster',
        tiles: [tile.urlTemplate],
        tileSize: 256,
        maxzoom: MAP_MAX_NATIVE_ZOOM,
        attribution: tile.attribution,
      },
      ...(hasOverlay
        ? {
            labels: {
              type: 'raster',
              tiles: [tile.labelOverlayUrlTemplate!],
              tileSize: 256,
              maxzoom: MAP_MAX_NATIVE_ZOOM,
              attribution: tile.attribution,
            },
          }
        : {}),
    },
    layers: [
      { id: 'base', type: 'raster', source: 'base' },
      ...(hasOverlay ? [{ id: 'labels', type: 'raster', source: 'labels' } as const] : []),
    ],
  };
}
