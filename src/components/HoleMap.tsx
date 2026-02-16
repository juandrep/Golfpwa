import { useEffect, useMemo, useRef, useState, type MouseEvent } from 'react';
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

interface BallPoint {
  x: number;
  y: number;
  source: 'manual' | 'gps';
}

interface GpsCoordinates {
  latitude: number;
  longitude: number;
}

function distanceBetween(a: { x: number; y: number }, b: { x: number; y: number }): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function recommendClub(distance: number, t: (key: string) => string): string {
  if (distance > 210) return t('courseMap.clubDriver');
  if (distance > 170) return t('courseMap.club3Wood');
  if (distance > 145) return t('courseMap.club5Iron');
  if (distance > 120) return t('courseMap.club7Iron');
  if (distance > 90) return t('courseMap.club9Iron');
  if (distance > 60) return t('courseMap.clubPitchingWedge');
  if (distance > 30) return t('courseMap.clubSandWedge');
  return t('courseMap.clubPutter');
}

export function HoleMap({ hole }: { hole: HoleMapData }) {
  const { t } = useI18n();
  const mapRef = useRef<HTMLDivElement>(null);
  const [activeMarkerId, setActiveMarkerId] = useState<string | null>(null);
  const [ballPoint, setBallPoint] = useState<BallPoint | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const [gpsCoordinates, setGpsCoordinates] = useState<GpsCoordinates | null>(null);
  const [gpsMessage, setGpsMessage] = useState<string>('');

  useEffect(() => {
    const onFullscreenChange = () => {
      setIsFullscreen(Boolean(document.fullscreenElement));
    };

    document.addEventListener('fullscreenchange', onFullscreenChange);
    return () => {
      document.removeEventListener('fullscreenchange', onFullscreenChange);
    };
  }, []);

  useEffect(() => {
    document.body.classList.toggle('overflow-hidden', isExpanded);
    return () => {
      document.body.classList.remove('overflow-hidden');
    };
  }, [isExpanded]);

  useEffect(() => {
    setBallPoint(null);
    setActiveMarkerId(null);
    setGpsCoordinates(null);
    setGpsMessage('');
  }, [hole.number, hole.imagePath]);

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

  const teeReference = useMemo(() => {
    const tees = [hole.coordinates.tees.white, hole.coordinates.tees.yellow, hole.coordinates.tees.red].filter(Boolean);
    const avgX = tees.reduce((sum, tee) => sum + (tee?.x ?? 0), 0) / tees.length;
    const avgY = tees.reduce((sum, tee) => sum + (tee?.y ?? 0), 0) / tees.length;
    return { x: avgX, y: avgY };
  }, [hole.coordinates.tees.red, hole.coordinates.tees.white, hole.coordinates.tees.yellow]);

  const referenceYardage = useMemo(() => {
    const yardages = [hole.yardages.white, hole.yardages.yellow, hole.yardages.red].filter(Boolean) as number[];
    return Math.round(yardages.reduce((sum, value) => sum + value, 0) / yardages.length);
  }, [hole.yardages.red, hole.yardages.white, hole.yardages.yellow]);

  const ballAdvice = useMemo(() => {
    if (!ballPoint) return null;

    const teeToGreenDistance = distanceBetween(teeReference, hole.coordinates.green);
    if (teeToGreenDistance === 0) return null;

    const pointToGreenDistance = distanceBetween(ballPoint, hole.coordinates.green);
    const scale = referenceYardage / teeToGreenDistance;
    const remainingMeters = Math.max(0, Math.round(pointToGreenDistance * scale));

    return {
      remainingMeters,
      club: recommendClub(remainingMeters, t),
    };
  }, [ballPoint, hole.coordinates.green, referenceYardage, t, teeReference]);

  const toggleFullscreen = async () => {
    if (!mapRef.current) return;

    if (isFullscreen || isExpanded) {
      if (document.fullscreenElement) {
        await document.exitFullscreen();
      }
      setIsExpanded(false);
      setIsFullscreen(false);
      return;
    }

    if (document.fullscreenEnabled && typeof mapRef.current.requestFullscreen === 'function') {
      try {
        await mapRef.current.requestFullscreen();
        setIsFullscreen(true);
        return;
      } catch {
        // Fallback below for environments where Fullscreen API exists but is blocked.
      }
    }

    setIsExpanded(true);
  };

  const enableGps = () => {
    if (!navigator.geolocation) {
      setGpsMessage(t('courseMap.gpsNotSupported'));
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        setGpsCoordinates({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
        });
        setGpsMessage(t('courseMap.gpsSuccess'));
      },
      () => {
        setGpsMessage(t('courseMap.gpsDenied'));
      },
      { enableHighAccuracy: true, timeout: 8000 },
    );
  };

  const handleMapClick = (event: MouseEvent<HTMLDivElement>) => {
    const target = event.target as HTMLElement;
    if (target.closest('[data-map-control="true"]')) {
      return;
    }

    const rect = event.currentTarget.getBoundingClientRect();
    const x = ((event.clientX - rect.left) / rect.width) * 100;
    const y = ((event.clientY - rect.top) / rect.height) * 100;

    setBallPoint({
      x: Number(Math.min(100, Math.max(0, x)).toFixed(2)),
      y: Number(Math.min(100, Math.max(0, y)).toFixed(2)),
      source: gpsCoordinates ? 'gps' : 'manual',
    });
  };

  const isMapExpanded = isFullscreen || isExpanded;

  return (
    <div className="space-y-3">
      <div
        ref={mapRef}
        className={`relative overflow-hidden rounded-xl bg-black/5 ${isMapExpanded ? 'h-[100dvh] w-full rounded-none' : ''} ${isExpanded ? 'fixed inset-0 z-50 bg-black p-2' : ''}`}
        onClick={handleMapClick}
      >
        <img
          src={hole.imagePath}
          alt={`Hole ${hole.number}`}
          className={`w-full object-cover ${isMapExpanded ? 'h-full' : 'h-auto'}`}
          onError={(event) => {
            event.currentTarget.src = '/assets/courses/placeholder-hole.svg';
          }}
        />

        <div className="absolute right-2 top-2 z-20 flex gap-2" data-map-control="true">
          <button
            type="button"
            onClick={() => void toggleFullscreen()}
            className="rounded-lg bg-white/90 px-2.5 py-1.5 text-xs font-semibold text-gray-800 shadow"
          >
            {isMapExpanded ? t('courseMap.exitFullscreen') : t('courseMap.fullscreen')}
          </button>
          <button
            type="button"
            onClick={enableGps}
            className="rounded-lg bg-emerald-700/90 px-2.5 py-1.5 text-xs font-semibold text-white shadow"
          >
            {t('courseMap.enableGps')}
          </button>
        </div>

        {markers.map((marker) => (
          <button
            key={marker.id}
            type="button"
            aria-label={marker.label}
            data-map-control="true"
            className={`absolute z-10 h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full ${marker.colorClass}`}
            style={{ left: `${marker.x}%`, top: `${marker.y}%`, transform: 'translate(-50%, -50%)' }}
            onClick={() => setActiveMarkerId(marker.id)}
          />
        ))}

        {ballPoint && (
          <div
            className="absolute z-20 h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-blue-700 bg-blue-400"
            style={{ left: `${ballPoint.x}%`, top: `${ballPoint.y}%` }}
            title={t('courseMap.ballPoint')}
          />
        )}

        {activeMarker && (
          <div
            className="absolute z-20 hidden rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs shadow-soft md:block"
            style={{ left: `${activeMarker.x}%`, top: `calc(${activeMarker.y}% - 42px)`, transform: 'translate(-50%, -100%)' }}
          >
            {activeMarker.description}
          </div>
        )}
      </div>

      {(ballAdvice || gpsMessage || gpsCoordinates) && (
        <div className="rounded-xl border border-gray-200 bg-white p-3 text-sm">
          {ballAdvice && (
            <>
              <p className="font-semibold">{t('courseMap.ballPoint')}</p>
              <p>{t('courseMap.distanceToGreen')}: {ballAdvice.remainingMeters}m</p>
              <p>{t('courseMap.recommendedClub')}: {ballAdvice.club}</p>
            </>
          )}

          {gpsCoordinates && (
            <p className="text-xs text-gray-500">
              {t('courseMap.gpsCoordinates')}: {gpsCoordinates.latitude.toFixed(5)}, {gpsCoordinates.longitude.toFixed(5)}
            </p>
          )}

          {gpsMessage && <p className="mt-1 text-xs text-gray-600">{gpsMessage}</p>}
        </div>
      )}

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
