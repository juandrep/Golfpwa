import { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { haversineMeters } from '../../domain/distance';
import { toDisplayDistance } from '../../domain/units';
import { Card, EmptyState } from '../../ui/components';
import { tileSources, useAppStore } from '../../app/store';
import { buildRasterMapStyle, MAP_MAX_ZOOM } from '../../app/mapStyle';
import { useI18n } from '../../app/i18n';

export function MapScreen() {
  const { t } = useI18n();
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
      () => setGpsError(t('map.gpsDenied')),
      { enableHighAccuracy: true },
    );
    return () => navigator.geolocation.clearWatch(id);
  }, [t]);

  const course = courses[0];
  const hole = course?.holes[0];
  const toGreen = userPos && hole ? {
    front: haversineMeters(userPos, hole.green.front),
    middle: haversineMeters(userPos, hole.green.middle),
    back: haversineMeters(userPos, hole.green.back),
  } : undefined;

  if (!course) return <EmptyState title={t('map.noCachedCourse')} desc={t('map.createOrSelectCourse')} />;

  return (
    <div className="space-y-3 pb-20">
      {gpsError && (
        <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }}>
          <Card className="border border-red-200 text-red-700">{gpsError}</Card>
        </motion.div>
      )}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.24, ease: 'easeOut' }}
        ref={mapEl}
        className="h-80 overflow-hidden rounded-card shadow-soft"
      />
      {toGreen && (
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }}>
          <Card>
            <p>{t('map.front')}: {toDisplayDistance(toGreen.front, unit)} {unit}</p>
            <p>{t('map.middle')}: {toDisplayDistance(toGreen.middle, unit)} {unit}</p>
            <p>{t('map.back')}: {toDisplayDistance(toGreen.back, unit)} {unit}</p>
          </Card>
        </motion.div>
      )}
      {measure !== undefined && (
        <motion.div
          key={Math.round(measure)}
          initial={{ opacity: 0, scale: 0.96 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.18, ease: 'easeOut' }}
        >
          <Card>{t('map.tapMeasure')}: {toDisplayDistance(measure, unit)} {unit}</Card>
        </motion.div>
      )}
      <Card>
        <h3 className="font-semibold">{t('map.hazards')}</h3>
        <ul className="text-sm text-gray-600">{hole?.hazards.map((h) => <li key={h.id}>{h.name} {userPos ? `· ${toDisplayDistance(haversineMeters(userPos, h.location), unit)} ${unit}` : ''}</li>)}</ul>
      </Card>
    </div>
  );
}
