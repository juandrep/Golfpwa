import { useEffect, useMemo, useRef, useState } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import type { Hole, LatLng, TeeOption } from '../../domain/types';
import { haversineMeters, metersToYards } from '../../domain/distance';
import { toDisplayDistance } from '../../domain/units';
import { closeRing, isPointInPolygon } from '../../domain/geo';
import { Card, Toggle } from '../../ui/components';
import { tileSources, useAppStore } from '../../app/store';
import { buildRasterMapStyle, MAP_MAX_ZOOM } from '../../app/mapStyle';
import { getHoleTeePoint, getTeeDisplay } from '../../domain/tee';
import { useI18n } from '../../app/i18n';

interface Props {
  hole: Hole;
  teeOption?: TeeOption | null;
}

type Zone = 'tee' | 'fairway' | 'green';

const TRACK_MAX_POINTS = 80;

function recommendClubKey(distanceMeters: number): string {
  const distanceYards = metersToYards(distanceMeters);
  if (distanceYards > 220) return 'courseMap.clubDriver';
  if (distanceYards > 185) return 'courseMap.club3Wood';
  if (distanceYards > 160) return 'courseMap.club5Iron';
  if (distanceYards > 140) return 'courseMap.club7Iron';
  if (distanceYards > 115) return 'courseMap.club9Iron';
  if (distanceYards > 80) return 'courseMap.clubPitchingWedge';
  if (distanceYards > 45) return 'courseMap.clubSandWedge';
  return 'courseMap.clubPutter';
}

function getHoleZones(hole: Hole) {
  return {
    fairway: hole.areas?.fairway ?? [],
    green: hole.areas?.green ?? [],
    hazards: hole.areas?.hazards ?? [],
  };
}

function interpolatePoint(from: LatLng, to: LatLng, t: number): LatLng {
  return {
    lat: from.lat + (to.lat - from.lat) * t,
    lng: from.lng + (to.lng - from.lng) * t,
  };
}

function getHoleBearing(from: LatLng, to: LatLng): number {
  const dLng = to.lng - from.lng;
  const dLat = to.lat - from.lat;
  return (Math.atan2(dLng, dLat) * 180) / Math.PI;
}

export function LiveHolePanel({ hole, teeOption = null }: Props) {
  const { t } = useI18n();
  const unit = useAppStore((state) => state.unit);
  const tileSourceId = useAppStore((state) => state.tileSourceId);
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const userMarkerRef = useRef<maplibregl.Marker | null>(null);
  const teeMarkerRef = useRef<maplibregl.Marker | null>(null);
  const greenMarkerRef = useRef<maplibregl.Marker | null>(null);
  const hazardMarkersRef = useRef<maplibregl.Marker[]>([]);
  const dashTimerRef = useRef<number | null>(null);
  const cinematicTimersRef = useRef<number[]>([]);
  const layupModeRef = useRef(false);
  const [userPos, setUserPos] = useState<LatLng | null>(null);
  const [trailPoints, setTrailPoints] = useState<LatLng[]>([]);
  const [gpsError, setGpsError] = useState<string>('');
  const [altitude, setAltitude] = useState<number | null>(null);
  const [prevAltitude, setPrevAltitude] = useState<number | null>(null);
  const [lockNorth, setLockNorth] = useState(true);
  const [followMe, setFollowMe] = useState(false);
  const [layupMode, setLayupMode] = useState(false);
  const [layupPoint, setLayupPoint] = useState<LatLng | null>(null);
  const [mapReadyToken, setMapReadyToken] = useState(0);
  const [holeTransitioning, setHoleTransitioning] = useState(true);

  const teeDisplay = useMemo(() => getTeeDisplay(teeOption), [teeOption]);
  const teePoint = useMemo(() => getHoleTeePoint(hole, teeOption), [hole, teeOption]);
  const zones = useMemo(() => getHoleZones(hole), [hole]);
  const holeBearing = useMemo(
    () => getHoleBearing(teePoint, hole.green.middle),
    [teePoint, hole.green.middle],
  );

  const toTee = userPos ? haversineMeters(userPos, teePoint) : null;
  const toGreen = userPos ? haversineMeters(userPos, hole.green.middle) : null;
  const inGreenPolygon = userPos && zones.green.length >= 3 ? isPointInPolygon(userPos, zones.green) : false;
  const inFairwayPolygon = userPos && zones.fairway.length >= 3 ? isPointInPolygon(userPos, zones.fairway) : false;
  const zone: Zone = !toTee || !toGreen
    ? 'fairway'
    : inGreenPolygon
      ? 'green'
      : toTee < 35
        ? 'tee'
        : inFairwayPolygon || toGreen >= 28
          ? 'fairway'
          : 'green';
  const zoneLabel = zone === 'tee'
    ? t('liveHole.zoneTee')
    : zone === 'fairway'
      ? t('liveHole.zoneFairway')
      : t('liveHole.zoneGreen');

  const nearestHazard = useMemo(() => {
    if (!userPos || hole.hazards.length === 0) return null;

    const [closest] = [...hole.hazards]
      .map((hazard) => ({ hazard, distance: haversineMeters(userPos, hazard.location) }))
      .sort((a, b) => a.distance - b.distance);

    if (!closest || closest.distance > 180) return null;
    return `${closest.hazard.name} ${t('liveHole.at')} ${toDisplayDistance(closest.distance, unit)} ${unit}`;
  }, [hole.hazards, t, unit, userPos]);

  const slopeText = useMemo(() => {
    if (altitude === null || prevAltitude === null) return null;
    const delta = altitude - prevAltitude;
    if (delta > 1.5) return t('liveHole.uphillLie');
    if (delta < -1.5) return t('liveHole.downhillLie');
    return null;
  }, [altitude, prevAltitude, t]);

  const recommendedClub = toGreen === null ? null : t(recommendClubKey(toGreen));
  const tip = useMemo(() => {
    if (toGreen === null) return t('liveHole.enableGpsTips');
    const hazard = nearestHazard ? ` ${nearestHazard}.` : '';
    const slope = slopeText ? ` ${slopeText}` : '';
    if (zone === 'tee') {
      return `${t('liveHole.tipTeePrefix')} ${Math.round(metersToYards(toGreen))}y ${t('liveHole.tipToMiddle')}.${hazard}${slope}`;
    }
    if (zone === 'green') {
      return `${t('liveHole.tipGreen')}.${slope}`;
    }
    return `${t('liveHole.tipApproachPrefix')} ${Math.round(metersToYards(toGreen))}y ${t('liveHole.tipLikely')} ${recommendedClub}. ${t('liveHole.tipCenterMiss')}.${hazard}${slope}`;
  }, [nearestHazard, recommendedClub, slopeText, t, toGreen, zone]);
  const frontDistance = userPos ? haversineMeters(userPos, hole.green.front) : null;
  const middleDistance = userPos ? haversineMeters(userPos, hole.green.middle) : null;
  const backDistance = userPos ? haversineMeters(userPos, hole.green.back) : null;
  const toLayup = userPos && layupPoint ? haversineMeters(userPos, layupPoint) : null;
  const layupToGreen = layupPoint ? haversineMeters(layupPoint, hole.green.middle) : null;

  const frameHoleCamera = (map: maplibregl.Map, duration = 700) => {
    const bounds = new maplibregl.LngLatBounds();
    bounds.extend([teePoint.lng, teePoint.lat]);
    bounds.extend([hole.green.middle.lng, hole.green.middle.lat]);
    bounds.extend([hole.green.front.lng, hole.green.front.lat]);
    bounds.extend([hole.green.back.lng, hole.green.back.lat]);
    zones.fairway.forEach((point) => bounds.extend([point.lng, point.lat]));
    zones.green.forEach((point) => bounds.extend([point.lng, point.lat]));
    hole.hazards.forEach((hazard) => bounds.extend([hazard.location.lng, hazard.location.lat]));

    map.fitBounds(bounds, {
      padding: { top: 96, bottom: 120, left: 36, right: 36 },
      maxZoom: 17.4,
      duration,
      bearing: lockNorth ? 0 : holeBearing,
      pitch: 52,
    });
  };

  const frameGreenCamera = (map: maplibregl.Map, duration = 520) => {
    const bounds = new maplibregl.LngLatBounds();
    bounds.extend([hole.green.front.lng, hole.green.front.lat]);
    bounds.extend([hole.green.middle.lng, hole.green.middle.lat]);
    bounds.extend([hole.green.back.lng, hole.green.back.lat]);
    zones.green.forEach((point) => bounds.extend([point.lng, point.lat]));
    zones.hazards.forEach((hazard) => {
      hazard.points.forEach((point) => {
        const distanceToGreen = haversineMeters(point, hole.green.middle);
        if (distanceToGreen <= 90) bounds.extend([point.lng, point.lat]);
      });
    });

    map.fitBounds(bounds, {
      padding: { top: 88, bottom: 112, left: 34, right: 34 },
      maxZoom: 19.2,
      duration,
      bearing: lockNorth ? 0 : holeBearing,
      pitch: 58,
    });
  };

  const frameLayupCamera = (map: maplibregl.Map, point: LatLng, duration = 560) => {
    const bounds = new maplibregl.LngLatBounds();
    bounds.extend([point.lng, point.lat]);
    bounds.extend([hole.green.front.lng, hole.green.front.lat]);
    bounds.extend([hole.green.middle.lng, hole.green.middle.lat]);
    bounds.extend([hole.green.back.lng, hole.green.back.lat]);
    zones.green.forEach((zonePoint) => bounds.extend([zonePoint.lng, zonePoint.lat]));
    zones.hazards.forEach((hazard) => {
      hazard.points.forEach((hazardPoint) => {
        const distanceToGreen = haversineMeters(hazardPoint, hole.green.middle);
        if (distanceToGreen <= 90) bounds.extend([hazardPoint.lng, hazardPoint.lat]);
      });
    });

    map.fitBounds(bounds, {
      padding: { top: 88, bottom: 112, left: 34, right: 34 },
      maxZoom: 18.8,
      duration,
      bearing: lockNorth ? 0 : holeBearing,
      pitch: 56,
    });
  };

  const clearCinematicTimers = () => {
    cinematicTimersRef.current.forEach((timer) => window.clearTimeout(timer));
    cinematicTimersRef.current = [];
  };

  const runCinematicHoleIntro = (map: maplibregl.Map) => {
    if (followMe) return;
    clearCinematicTimers();

    const holeMeters = haversineMeters(teePoint, hole.green.middle);
    const longHoleFactor = holeMeters > 260 ? Math.min(1.35, holeMeters / 260) : 1;
    const teeStopDuration = Math.round(900 * longHoleFactor);
    const teePause = 260;
    const greenMoveDuration = Math.round(1050 * longHoleFactor);
    const greenPause = 300;
    const settleDuration = Math.round(760 * longHoleFactor);
    const previewBearing = lockNorth ? 0 : holeBearing - 12;
    const finalBearing = lockNorth ? 0 : holeBearing;
    const teeZoom = holeMeters > 260 ? 17.15 : 17.45;
    const greenZoom = holeMeters > 260 ? 17.65 : 18.05;

    map.stop();
    map.easeTo({
      center: [teePoint.lng, teePoint.lat],
      zoom: teeZoom,
      pitch: 62,
      bearing: previewBearing,
      duration: teeStopDuration,
    });

    const greenStartAt = teeStopDuration + teePause;
    cinematicTimersRef.current.push(window.setTimeout(() => {
      map.easeTo({
        center: [hole.green.middle.lng, hole.green.middle.lat],
        zoom: greenZoom,
        pitch: 58,
        bearing: finalBearing,
        duration: greenMoveDuration,
      });
    }, greenStartAt));

    const settleAt = greenStartAt + greenMoveDuration + greenPause;
    cinematicTimersRef.current.push(window.setTimeout(() => {
      frameHoleCamera(map, settleDuration);
    }, settleAt));
  };

  useEffect(() => {
    const watchId = navigator.geolocation.watchPosition(
      (position) => {
        setPrevAltitude((current) => current ?? position.coords.altitude ?? null);
        setAltitude(position.coords.altitude ?? null);
        const nextPos = { lat: position.coords.latitude, lng: position.coords.longitude };
        setUserPos(nextPos);
        setTrailPoints((previous) => [...previous.slice(-TRACK_MAX_POINTS + 1), nextPos]);
        setGpsError('');
      },
      () => {
        setGpsError(t('liveHole.gpsUnavailableManual'));
      },
      { enableHighAccuracy: true },
    );

    return () => {
      navigator.geolocation.clearWatch(watchId);
    };
  }, []);

  useEffect(() => {
    layupModeRef.current = layupMode;
  }, [layupMode]);

  useEffect(() => {
    if (!mapContainerRef.current) return;
    setHoleTransitioning(true);
    mapRef.current?.remove();
    mapRef.current = null;
    const tileSource = tileSources.find((tile) => tile.id === tileSourceId) ?? tileSources[0];
    let readyFallbackTimer: number | null = null;
    let didReveal = false;
    const revealHoleMap = () => {
      if (didReveal) return;
      didReveal = true;
      if (readyFallbackTimer) {
        window.clearTimeout(readyFallbackTimer);
        readyFallbackTimer = null;
      }
      window.requestAnimationFrame(() => {
        setHoleTransitioning(false);
      });
    };

    const map = new maplibregl.Map({
      container: mapContainerRef.current,
      style: buildRasterMapStyle(tileSource),
      center: [(teePoint.lng + hole.green.middle.lng) / 2, (teePoint.lat + hole.green.middle.lat) / 2],
      zoom: 15,
      maxZoom: MAP_MAX_ZOOM,
      pitch: 48,
      bearing: lockNorth ? 0 : holeBearing,
      touchPitch: true,
    });
    mapRef.current = map;

    map.on('load', () => {
      setMapReadyToken((previous) => previous + 1);
      map.addSource('hole-zones', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] },
      });
      map.addLayer({
        id: 'hole-zones-fill',
        type: 'fill',
        source: 'hole-zones',
        paint: {
          'fill-color': ['get', 'color'],
          'fill-opacity': 0.24,
        },
      });
      map.addLayer({
        id: 'hole-zones-line',
        type: 'line',
        source: 'hole-zones',
        paint: {
          'line-color': ['get', 'lineColor'],
          'line-width': 2,
        },
      });

      map.addSource('hole-guides', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] },
      });
      map.addLayer({
        id: 'hole-guides-line',
        type: 'line',
        source: 'hole-guides',
        paint: {
          'line-color': '#ffffff',
          'line-width': 2.4,
          'line-dasharray': [2, 2],
        },
      });
      map.addLayer({
        id: 'hole-guides-fill',
        type: 'fill',
        source: 'hole-guides',
        paint: {
          'fill-color': '#22c55e',
          'fill-opacity': 0.14,
        },
      });

      map.addSource('distance-nodes', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] },
      });
      map.addLayer({
        id: 'distance-node-circles',
        type: 'circle',
        source: 'distance-nodes',
        paint: {
          'circle-radius': 14,
          'circle-color': ['get', 'nodeColor'],
          'circle-stroke-color': '#ffffff',
          'circle-stroke-width': 1.6,
        },
      });
      map.addLayer({
        id: 'distance-node-labels',
        type: 'symbol',
        source: 'distance-nodes',
        layout: {
          'text-field': ['get', 'label'],
          'text-size': 11,
          'text-font': ['Noto Sans Bold'],
          'text-allow-overlap': true,
        },
        paint: {
          'text-color': '#ffffff',
        },
      });

      map.addSource('player-track', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] },
      });
      map.addLayer({
        id: 'player-track-line',
        type: 'line',
        source: 'player-track',
        paint: {
          'line-color': '#60a5fa',
          'line-width': 3,
          'line-opacity': 0.9,
          'line-dasharray': [1.5, 1.5],
        },
      });

      map.addSource('layup-guide', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] },
      });
      map.addLayer({
        id: 'layup-guide-line',
        type: 'line',
        source: 'layup-guide',
        paint: {
          'line-color': '#f59e0b',
          'line-width': 2.5,
          'line-dasharray': [1.2, 1.8],
        },
      });
      map.addLayer({
        id: 'layup-guide-point',
        type: 'circle',
        source: 'layup-guide',
        paint: {
          'circle-radius': 6,
          'circle-color': '#f59e0b',
          'circle-stroke-width': 2,
          'circle-stroke-color': '#ffffff',
        },
      });

      frameHoleCamera(map, 0);
      runCinematicHoleIntro(map);
      map.once('render', revealHoleMap);
      readyFallbackTimer = window.setTimeout(revealHoleMap, 900);
    });

    map.on('click', (event) => {
      if (!layupModeRef.current) return;
      const nextLayupPoint = { lat: event.lngLat.lat, lng: event.lngLat.lng };
      setLayupPoint(nextLayupPoint);
      setLayupMode(false);
      frameLayupCamera(map, nextLayupPoint, 520);
    });

    return () => {
      teeMarkerRef.current?.remove();
      greenMarkerRef.current?.remove();
      userMarkerRef.current?.remove();
      hazardMarkersRef.current.forEach((marker) => marker.remove());
      if (dashTimerRef.current) window.clearInterval(dashTimerRef.current);
      clearCinematicTimers();
      if (readyFallbackTimer) window.clearTimeout(readyFallbackTimer);
      map.remove();
      mapRef.current = null;
    };
  }, [
    hole.green.middle.lat,
    hole.green.middle.lng,
    holeBearing,
    lockNorth,
    teePoint.lat,
    teePoint.lng,
    tileSourceId,
  ]);

  useEffect(() => {
    if (!mapRef.current) return;
    if (lockNorth) {
      mapRef.current.dragRotate.disable();
      mapRef.current.touchZoomRotate.disableRotation();
      mapRef.current.easeTo({ bearing: 0, duration: 250 });
    } else {
      mapRef.current.dragRotate.enable();
      mapRef.current.touchZoomRotate.enableRotation();
      mapRef.current.easeTo({ bearing: holeBearing, duration: 320 });
    }
  }, [holeBearing, lockNorth]);

  useEffect(() => {
    if (!mapRef.current) return;

    teeMarkerRef.current?.remove();
    greenMarkerRef.current?.remove();
    hazardMarkersRef.current.forEach((marker) => marker.remove());

    teeMarkerRef.current = new maplibregl.Marker({ color: teeDisplay.color })
      .setLngLat([teePoint.lng, teePoint.lat])
      .addTo(mapRef.current);

    greenMarkerRef.current = new maplibregl.Marker({ color: '#16a34a' })
      .setLngLat([hole.green.middle.lng, hole.green.middle.lat])
      .addTo(mapRef.current);

    hazardMarkersRef.current = hole.hazards.map((hazard) =>
      new maplibregl.Marker({ color: '#dc2626' })
        .setLngLat([hazard.location.lng, hazard.location.lat])
        .addTo(mapRef.current!),
    );

    if (!followMe) {
      frameHoleCamera(mapRef.current, 520);
    }
  }, [
    followMe,
    hole.green.middle.lng,
    hole.green.middle.lat,
    hole.hazards,
    mapReadyToken,
    teeDisplay.color,
    teePoint.lng,
    teePoint.lat,
    zones.fairway,
    zones.green,
  ]);

  useEffect(() => {
    if (!mapRef.current || !mapReadyToken || followMe) return;
    frameHoleCamera(mapRef.current, 380);
  }, [followMe, holeBearing, lockNorth, mapReadyToken, zones.fairway, zones.green]);

  useEffect(() => {
    if (!mapRef.current || !mapReadyToken) return;
    runCinematicHoleIntro(mapRef.current);
    return () => {
      clearCinematicTimers();
    };
  }, [hole.number, mapReadyToken]);

  useEffect(() => {
    if (!mapRef.current) return;
    const source = mapRef.current.getSource('hole-zones') as maplibregl.GeoJSONSource | undefined;
    if (!source) return;

    const features: GeoJSON.Feature[] = [];
    if (zones.fairway.length >= 3) {
      features.push({
        type: 'Feature',
        properties: { color: '#38bdf8', lineColor: '#0284c7' },
        geometry: { type: 'Polygon', coordinates: [closeRing(zones.fairway)] },
      });
    }
    if (zones.green.length >= 3) {
      features.push({
        type: 'Feature',
        properties: { color: '#22c55e', lineColor: '#15803d' },
        geometry: { type: 'Polygon', coordinates: [closeRing(zones.green)] },
      });
    }
    zones.hazards.forEach((hazard) => {
      if (hazard.points.length < 3) return;
      features.push({
        type: 'Feature',
        properties: { color: '#ef4444', lineColor: '#991b1b' },
        geometry: { type: 'Polygon', coordinates: [closeRing(hazard.points)] },
      });
    });

    source.setData({ type: 'FeatureCollection', features });
  }, [mapReadyToken, zones]);

  useEffect(() => {
    if (!mapRef.current) return;
    const guideSource = mapRef.current.getSource('hole-guides') as maplibregl.GeoJSONSource | undefined;
    const nodeSource = mapRef.current.getSource('distance-nodes') as maplibregl.GeoJSONSource | undefined;
    if (!guideSource || !nodeSource) return;
    const guideStart = userPos ?? teePoint;

    const radiusLat = 0.00018;
    const radiusLng = 0.00018;
    const ring = Array.from({ length: 20 }, (_, index) => {
      const angle = (Math.PI * 2 * index) / 20;
      return [
        hole.green.middle.lng + Math.cos(angle) * radiusLng,
        hole.green.middle.lat + Math.sin(angle) * radiusLat,
      ] as [number, number];
    });
    ring.push(ring[0]);

    guideSource.setData({
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          geometry: {
            type: 'LineString',
            coordinates: [
              [guideStart.lng, guideStart.lat],
              [hole.green.middle.lng, hole.green.middle.lat],
            ],
          },
          properties: {},
        },
        {
          type: 'Feature',
          geometry: { type: 'Polygon', coordinates: [ring] },
          properties: {},
        },
      ],
    });

    const nodeSpecs = [
      { t: 0.32, color: '#2563eb' },
      { t: 0.52, color: '#ea580c' },
      { t: 0.72, color: '#dc2626' },
    ];
    const nodeFeatures: GeoJSON.Feature[] = nodeSpecs.map((node) => {
      const point = interpolatePoint(guideStart, hole.green.middle, node.t);
      const remaining = haversineMeters(point, hole.green.middle);
      return {
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [point.lng, point.lat] },
        properties: {
          label: `${toDisplayDistance(remaining, unit)}`,
          nodeColor: node.color,
        },
      };
    });
    nodeSource.setData({ type: 'FeatureCollection', features: nodeFeatures });
  }, [
    hole.green.middle.lat,
    hole.green.middle.lng,
    mapReadyToken,
    teePoint.lat,
    teePoint.lng,
    unit,
    userPos,
  ]);

  useEffect(() => {
    if (!mapRef.current) return;
    const source = mapRef.current.getSource('player-track') as maplibregl.GeoJSONSource | undefined;
    if (!source || trailPoints.length < 2) return;

    source.setData({
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          geometry: {
            type: 'LineString',
            coordinates: trailPoints.map((point) => [point.lng, point.lat]),
          },
          properties: {},
        },
      ],
    });
  }, [mapReadyToken, trailPoints]);

  useEffect(() => {
    if (!mapRef.current) return;
    const source = mapRef.current.getSource('layup-guide') as maplibregl.GeoJSONSource | undefined;
    if (!source || !layupPoint) {
      if (source) {
        source.setData({ type: 'FeatureCollection', features: [] });
      }
      return;
    }

    source.setData({
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          geometry: {
            type: 'LineString',
            coordinates: [
              [layupPoint.lng, layupPoint.lat],
              [hole.green.middle.lng, hole.green.middle.lat],
            ],
          },
          properties: {},
        },
        {
          type: 'Feature',
          geometry: {
            type: 'Point',
            coordinates: [layupPoint.lng, layupPoint.lat],
          },
          properties: {},
        },
      ],
    });
  }, [hole.green.middle.lat, hole.green.middle.lng, layupPoint, mapReadyToken]);

  useEffect(() => {
    if (!mapRef.current) return;
    let phase = 0;
    if (dashTimerRef.current) window.clearInterval(dashTimerRef.current);
    dashTimerRef.current = window.setInterval(() => {
      const line = mapRef.current;
      if (!line || !line.getLayer('player-track-line')) return;
      phase = (phase + 0.5) % 6;
      line.setPaintProperty('player-track-line', 'line-dasharray', [1.5, 1.5 + phase / 4]);
    }, 350);

    return () => {
      if (dashTimerRef.current) window.clearInterval(dashTimerRef.current);
      dashTimerRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!mapRef.current || !userPos) return;
    if (!userMarkerRef.current) {
      const el = document.createElement('div');
      el.className = 'gps-puck';
      el.innerHTML = '<span class="gps-puck-core"></span><span class="gps-puck-ring"></span>';
      userMarkerRef.current = new maplibregl.Marker({ element: el })
        .setLngLat([userPos.lng, userPos.lat])
        .addTo(mapRef.current);
    } else {
      userMarkerRef.current.setLngLat([userPos.lng, userPos.lat]);
    }

    if (followMe) {
      mapRef.current.easeTo({ center: [userPos.lng, userPos.lat], duration: 700 });
    }
  }, [followMe, userPos]);

  const recenterNow = () => {
    if (!mapRef.current) return;
    if (followMe && userPos) {
      mapRef.current.easeTo({ center: [userPos.lng, userPos.lat], duration: 400, zoom: Math.max(mapRef.current.getZoom(), 16) });
      return;
    }
    frameHoleCamera(mapRef.current, 420);
  };

  const focusGreenNow = () => {
    if (!mapRef.current) return;
    frameGreenCamera(mapRef.current, 520);
  };

  useEffect(() => {
    if (!mapRef.current || !userPos || !followMe) return;
    mapRef.current.easeTo({ center: [userPos.lng, userPos.lat], duration: 350 });
  }, [followMe, userPos]);

  return (
    <div className="hole-fade-in space-y-3">
      <div className="relative overflow-hidden rounded-2xl border border-stone-300 shadow-md">
        <div
          ref={mapContainerRef}
          className={`live-hole-map-surface h-[56vh] min-h-[300px] max-h-[520px] overflow-hidden sm:h-[62vh] sm:min-h-[360px] sm:max-h-[560px] ${holeTransitioning ? 'is-loading' : ''}`}
        />
        <div className={`live-hole-loading-overlay ${holeTransitioning ? 'is-visible' : ''}`} aria-hidden={!holeTransitioning}>
          <div className="live-hole-loading-panel">
            <p className="live-hole-loading-eyebrow">{t('liveHole.preparingMap')}</p>
            <p className="live-hole-loading-title">{t('score.hole')} {hole.number}</p>
            <p className="live-hole-loading-subtitle">{t('courseMap.par')} {hole.par}</p>
            <div className="live-hole-loading-track" />
          </div>
        </div>

        <div className="absolute inset-x-0 top-0 hidden items-center justify-between bg-gradient-to-b from-black/65 to-transparent px-3 py-2 sm:flex">
          <div className="rounded-full bg-white/92 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-700">
            {t('liveHole.pinSheet')}
          </div>
          <div className="flex items-center gap-1.5">
            <div className="rounded-full bg-white/90 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-700">
              {teeDisplay.label} Tee
            </div>
            <div className="rounded-full bg-gradient-to-r from-cyan-500 to-sky-500 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide text-white">
              {zoneLabel}
            </div>
          </div>
        </div>

        <div className="absolute left-2 top-12 z-10 hidden space-y-2 sm:block">
          <div className="flex items-center gap-2 rounded-lg border border-white/20 bg-slate-900/45 px-2 py-1.5 text-white backdrop-blur">
            <span className="text-[10px] uppercase tracking-wide text-slate-200">{t('liveHole.north')}</span>
            <Toggle checked={lockNorth} onChange={setLockNorth} />
          </div>
          <div className="flex items-center gap-2 rounded-lg border border-white/20 bg-slate-900/45 px-2 py-1.5 text-white backdrop-blur">
            <span className="text-[10px] uppercase tracking-wide text-slate-200">{t('liveHole.follow')}</span>
            <Toggle checked={followMe} onChange={setFollowMe} />
          </div>
        </div>

        <div className="absolute right-2 top-12 z-10 hidden space-y-2 sm:block">
          <button
            type="button"
            className="rounded-lg bg-black/45 px-2 py-1.5 text-[10px] font-semibold uppercase tracking-wide text-white backdrop-blur"
            onClick={recenterNow}
          >
            {t('liveHole.recenter')}
          </button>
          <button
            type="button"
            className="rounded-lg bg-black/45 px-2 py-1.5 text-[10px] font-semibold uppercase tracking-wide text-white backdrop-blur"
            onClick={focusGreenNow}
          >
            {t('liveHole.greenCam')}
          </button>
          <button
            type="button"
            className={`rounded-lg px-2 py-1.5 text-[10px] font-semibold uppercase tracking-wide text-white backdrop-blur ${layupMode ? 'bg-amber-600/90' : 'bg-black/45'}`}
            onClick={() => setLayupMode((current) => !current)}
          >
            {layupMode ? t('liveHole.tapMap') : t('liveHole.markLayup')}
          </button>
          {layupPoint ? (
            <button
              type="button"
              className="rounded-lg bg-black/45 px-2 py-1.5 text-[10px] font-semibold uppercase tracking-wide text-white backdrop-blur"
              onClick={() => setLayupPoint(null)}
            >
                {t('liveHole.clearLayup')}
              </button>
            ) : null}
        </div>

        <div className="absolute inset-x-0 top-2 z-10 px-2 sm:hidden">
          <div className="flex items-center gap-1 overflow-x-auto rounded-xl bg-black/55 p-1.5 text-white backdrop-blur [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            <button
              type="button"
              className={`shrink-0 rounded-md px-2 py-1 text-[10px] font-semibold uppercase tracking-wide ${lockNorth ? 'bg-gradient-to-r from-cyan-500 to-sky-500' : 'bg-white/15'}`}
              onClick={() => setLockNorth((current) => !current)}
            >
              {t('liveHole.north')}
            </button>
            <button
              type="button"
              className={`shrink-0 rounded-md px-2 py-1 text-[10px] font-semibold uppercase tracking-wide ${followMe ? 'bg-gradient-to-r from-cyan-500 to-sky-500' : 'bg-white/15'}`}
              onClick={() => setFollowMe((current) => !current)}
            >
              {t('liveHole.follow')}
            </button>
            <button
              type="button"
              className="shrink-0 rounded-md bg-white/15 px-2 py-1 text-[10px] font-semibold uppercase tracking-wide"
              onClick={recenterNow}
            >
              {t('liveHole.recenter')}
            </button>
            <button
              type="button"
              className="shrink-0 rounded-md bg-white/15 px-2 py-1 text-[10px] font-semibold uppercase tracking-wide"
              onClick={focusGreenNow}
            >
              {t('liveHole.greenCam')}
            </button>
            <button
              type="button"
              className={`shrink-0 rounded-md px-2 py-1 text-[10px] font-semibold uppercase tracking-wide ${layupMode ? 'bg-amber-600/90' : 'bg-white/15'}`}
              onClick={() => setLayupMode((current) => !current)}
            >
              {layupMode ? t('liveHole.tapMap') : t('liveHole.markLayup')}
            </button>
            {layupPoint ? (
              <button
                type="button"
                className="shrink-0 rounded-md bg-white/15 px-2 py-1 text-[10px] font-semibold uppercase tracking-wide"
                onClick={() => setLayupPoint(null)}
              >
                {t('liveHole.clearLayup')}
              </button>
            ) : null}
          </div>
        </div>

        <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/75 via-black/35 to-transparent p-3">
          <div className="grid grid-cols-2 gap-2 text-center text-white sm:grid-cols-4">
            <div className="rounded-lg border border-blue-200/40 bg-blue-500/35 px-2 py-1.5 backdrop-blur-sm">
              <p className="text-[10px] uppercase tracking-[0.14em] text-blue-100">{t('map.front')}</p>
              <p className="text-xs font-semibold sm:text-sm">{frontDistance === null ? '--' : `${toDisplayDistance(frontDistance, unit)} ${unit === 'yards' ? 'y' : 'm'}`}</p>
            </div>
            <div className="rounded-lg border border-amber-200/40 bg-amber-500/35 px-2 py-1.5 backdrop-blur-sm">
              <p className="text-[10px] uppercase tracking-[0.14em] text-amber-100">{t('map.middle')}</p>
              <p className="text-xs font-semibold sm:text-sm">{middleDistance === null ? '--' : `${toDisplayDistance(middleDistance, unit)} ${unit === 'yards' ? 'y' : 'm'}`}</p>
            </div>
            <div className="rounded-lg border border-red-200/40 bg-red-500/35 px-2 py-1.5 backdrop-blur-sm">
              <p className="text-[10px] uppercase tracking-[0.14em] text-red-100">{t('map.back')}</p>
              <p className="text-xs font-semibold sm:text-sm">{backDistance === null ? '--' : `${toDisplayDistance(backDistance, unit)} ${unit === 'yards' ? 'y' : 'm'}`}</p>
            </div>
            <div className="rounded-lg border border-emerald-200/40 bg-emerald-600/85 px-2 py-1.5">
              <p className="text-[10px] uppercase tracking-[0.14em] text-emerald-100">{t('liveHole.club')}</p>
              <p className="text-xs font-semibold sm:text-sm">{toGreen === null ? '--' : recommendedClub}</p>
            </div>
          </div>
        </div>
      </div>

      <Card className="sm:hidden border-stone-200 bg-stone-50">
        <div className="flex items-center justify-between gap-2">
          <p className="rounded-full bg-white px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-stone-700">
            {t('liveHole.pinSheet')}
          </p>
          <div className="flex items-center gap-1.5">
            <p className="rounded-full bg-white px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-stone-700">
              {teeDisplay.label} Tee
            </p>
            <p className="rounded-full bg-emerald-600 px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-white">
              {zoneLabel}
            </p>
          </div>
        </div>
      </Card>

      {gpsError ? <Card className="border-red-200 text-red-700">{gpsError}</Card> : null}

      <Card className="space-y-2 border-stone-200 bg-stone-50">
        <div className="flex items-start justify-between gap-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-stone-700">{t('liveHole.caddieTip')}</p>
          <p className="rounded-full bg-white px-2 py-1 text-xs font-semibold text-stone-700">
            {toGreen === null ? '--' : `${Math.round(metersToYards(toGreen))}y`}
          </p>
        </div>
        <p className="text-sm text-stone-800">{tip}</p>
        <div className="grid grid-cols-2 gap-2 text-sm">
          <div className="rounded-lg border border-stone-200 bg-white px-2 py-2">
            <p className="text-xs text-stone-500">{t('liveHole.toTee')}</p>
            <p className="font-semibold text-stone-900">{toTee === null ? '--' : `${toDisplayDistance(toTee, unit)} ${unit}`}</p>
          </div>
          <div className="rounded-lg border border-stone-200 bg-white px-2 py-2">
            <p className="text-xs text-stone-500">{t('liveHole.nearestHazard')}</p>
            <p className="font-semibold text-stone-900">{nearestHazard ?? t('liveHole.clear')}</p>
          </div>
          <div className="rounded-lg border border-stone-200 bg-white px-2 py-2">
            <p className="text-xs text-stone-500">{t('liveHole.toLayup')}</p>
            <p className="font-semibold text-stone-900">{toLayup === null ? '--' : `${toDisplayDistance(toLayup, unit)} ${unit}`}</p>
          </div>
          <div className="rounded-lg border border-stone-200 bg-white px-2 py-2">
            <p className="text-xs text-stone-500">{t('liveHole.layupToGreen')}</p>
            <p className="font-semibold text-stone-900">{layupToGreen === null ? '--' : `${toDisplayDistance(layupToGreen, unit)} ${unit}`}</p>
          </div>
        </div>
      </Card>
    </div>
  );
}
