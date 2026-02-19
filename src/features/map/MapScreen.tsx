import { useEffect, useRef, useState } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { haversineMeters } from '../../domain/distance';
import { toDisplayDistance } from '../../domain/units';
import { Card, EmptyState } from '../../ui/components';
import { tileSources, useAppStore } from '../../app/store';
import { buildRasterMapStyle, MAP_MAX_ZOOM } from '../../app/mapStyle';

export function MapScreen() {
  const courses = useAppStore((s) => s.courses);
  const unit = useAppStore((s) => s.unit);
  const tileSourceId = useAppStore((s) => s.tileSourceId);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const mapEl = useRef<HTMLDivElement | null>(null);
  const [userPos, setUserPos] = useState<{ lat: number; lng: number }>();
  const [measure, setMeasure] = useState<number>();
  const [gpsError, setGpsError] = useState<string>('');

  useEffect(() => {
    if (!mapEl.current || mapRef.current) return;
    const tile = tileSources.find((t) => t.id === tileSourceId) ?? tileSources[0];
    mapRef.current = new maplibregl.Map({
      container: mapEl.current,
      style: buildRasterMapStyle(tile),
      center: [-122.68, 45.52],
      zoom: 14,
      maxZoom: MAP_MAX_ZOOM,
      pitch: 28,
      bearing: -12,
    });

    mapRef.current.on('click', (e) => {
      if (!userPos) return;
      setMeasure(haversineMeters(userPos, { lat: e.lngLat.lat, lng: e.lngLat.lng }));
    });

    return () => mapRef.current?.remove();
  }, [tileSourceId, userPos]);

  useEffect(() => {
    const id = navigator.geolocation.watchPosition(
      (pos) => {
        const coord = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        setUserPos(coord);
        setGpsError('');
      },
      () => setGpsError('GPS denied or unavailable.'),
      { enableHighAccuracy: true },
    );
    return () => navigator.geolocation.clearWatch(id);
  }, []);

  const course = courses[0];
  const hole = course?.holes[0];
  const toGreen = userPos && hole ? {
    front: haversineMeters(userPos, hole.green.front),
    middle: haversineMeters(userPos, hole.green.middle),
    back: haversineMeters(userPos, hole.green.back),
  } : undefined;

  if (!course) return <EmptyState title="No cached course" desc="Create/select a course first." />;

  return (
    <div className="space-y-3 pb-20">
      {gpsError && <Card className="border border-red-200 text-red-700">{gpsError}</Card>}
      <div ref={mapEl} className="h-80 overflow-hidden rounded-card shadow-soft" />
      {toGreen && <Card><p>Front: {toDisplayDistance(toGreen.front, unit)} {unit}</p><p>Middle: {toDisplayDistance(toGreen.middle, unit)} {unit}</p><p>Back: {toDisplayDistance(toGreen.back, unit)} {unit}</p></Card>}
      {measure !== undefined && <Card>Tap measure: {toDisplayDistance(measure, unit)} {unit}</Card>}
      <Card>
        <h3 className="font-semibold">Hazards</h3>
        <ul className="text-sm text-gray-600">{hole?.hazards.map((h) => <li key={h.id}>{h.name} {userPos ? `· ${toDisplayDistance(haversineMeters(userPos, h.location), unit)} ${unit}` : ''}</li>)}</ul>
      </Card>
    </div>
  );
}
