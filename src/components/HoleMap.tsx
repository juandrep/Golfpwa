import { useMemo, useState } from 'react';
import type { HoleMapData } from '../data/courseMapData';
import { useI18n } from '../app/i18n';

interface MarkerInfo {
  id: string;
  label: string;
  colorClass: string;
  x: number;
  y: number;
  description: string;
}

export function HoleMap({ hole }: { hole: HoleMapData }) {
  const { t } = useI18n();
  const [activeMarkerId, setActiveMarkerId] = useState<string | null>(null);

  const markers = useMemo<MarkerInfo[]>(() => {
    const teeMarkers: MarkerInfo[] = [
      {
        id: 'white',
        label: t('courseMap.teeWhite'),
        colorClass: 'bg-white border border-gray-400',
        x: hole.coordinates.tees.white.x,
        y: hole.coordinates.tees.white.y,
        description: `${t('courseMap.teeWhite')} – ${hole.yardages.white}m`,
      },
      {
        id: 'yellow',
        label: t('courseMap.teeYellow'),
        colorClass: 'bg-yellow-400 border border-yellow-500',
        x: hole.coordinates.tees.yellow.x,
        y: hole.coordinates.tees.yellow.y,
        description: `${t('courseMap.teeYellow')} – ${hole.yardages.yellow}m`,
      },
    ];

    if (hole.coordinates.tees.red && hole.yardages.red) {
      teeMarkers.push({
        id: 'red',
        label: t('courseMap.teeRed'),
        colorClass: 'bg-red-500 border border-red-600',
        x: hole.coordinates.tees.red.x,
        y: hole.coordinates.tees.red.y,
        description: `${t('courseMap.teeRed')} – ${hole.yardages.red}m`,
      });
    }

    teeMarkers.push({
      id: 'green',
      label: t('courseMap.green'),
      colorClass: 'bg-emerald-500 border border-emerald-600',
      x: hole.coordinates.green.x,
      y: hole.coordinates.green.y,
      description: `${t('courseMap.green')} – ${hole.greenDepth}m`,
    });

    return teeMarkers;
  }, [hole, t]);

  const activeMarker = markers.find((marker) => marker.id === activeMarkerId);

  return (
    <div className="space-y-3">
      <div className="relative overflow-hidden rounded-xl">
        <img
          src={hole.imagePath}
          alt={`Hole ${hole.number}`}
          className="h-auto w-full object-cover"
          onError={(event) => {
            event.currentTarget.src = '/assets/courses/placeholder-hole.svg';
          }}
        />
        {markers.map((marker) => (
          <button
            key={marker.id}
            type="button"
            aria-label={marker.label}
            className={`absolute h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full ${marker.colorClass}`}
            style={{ left: `${marker.x}%`, top: `${marker.y}%`, transform: 'translate(-50%, -50%)' }}
            onClick={() => setActiveMarkerId(marker.id)}
          />
        ))}

        {activeMarker && (
          <div
            className="absolute z-20 hidden rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs shadow-soft md:block"
            style={{ left: `${activeMarker.x}%`, top: `calc(${activeMarker.y}% - 42px)`, transform: 'translate(-50%, -100%)' }}
          >
            {activeMarker.description}
          </div>
        )}
      </div>

      {activeMarker && (
        <div className="fixed inset-x-0 bottom-0 z-30 rounded-t-2xl border border-gray-200 bg-white p-4 shadow-soft md:hidden">
          <p className="text-sm font-medium">{activeMarker.description}</p>
          <button type="button" className="mt-2 text-sm text-emerald-700" onClick={() => setActiveMarkerId(null)}>
            {t('buttons.close')}
          </button>
        </div>
      )}
    </div>
  );
}
