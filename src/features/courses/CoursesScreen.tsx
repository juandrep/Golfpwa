import { useEffect, useRef, useState } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import type { Course, Hole } from '../../domain/types';
import { Button, Card, EmptyState, Input } from '../../ui/components';
import { tileSources, useAppStore } from '../../app/store';
import { importAlgarveCoursesFromOSM } from '../../data';

const emptyHole = (number: number): Hole => ({
  number,
  par: 4,
  green: {
    front: { lat: 45.52, lng: -122.68 },
    middle: { lat: 45.5202, lng: -122.6798 },
    back: { lat: 45.5204, lng: -122.6796 },
  },
  hazards: [],
});

type PickTarget = 'front' | 'middle' | 'back' | 'hazard';

function CourseEditor() {
  const saveCourse = useAppStore((s) => s.saveCourse);
  const importCourses = useAppStore((s) => s.importCourses);
  const tileSourceId = useAppStore((s) => s.tileSourceId);
  const [name, setName] = useState('');
  const [lat, setLat] = useState('45.52');
  const [lng, setLng] = useState('-122.68');
  const [pickTarget, setPickTarget] = useState<PickTarget>('middle');
  const [picked, setPicked] = useState({
    front: { lat: 45.52, lng: -122.68 },
    middle: { lat: 45.5202, lng: -122.6798 },
    back: { lat: 45.5204, lng: -122.6796 },
  });
  const [hazard, setHazard] = useState<{ lat: number; lng: number } | null>(null);
  const [importing, setImporting] = useState(false);
  const [message, setMessage] = useState('');
  const mapEl = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const mapContainer = mapEl.current;
    if (!mapContainer) return;

    const tile = tileSources.find((t) => t.id === tileSourceId) ?? tileSources[0];
    const map = new maplibregl.Map({
      container: mapContainer,
      style: {
        version: 8,
        sources: {
          osm: { type: 'raster', tiles: [tile.urlTemplate], tileSize: 256, attribution: tile.attribution },
        },
        layers: [{ id: 'osm', type: 'raster', source: 'osm' }],
      },
      center: [Number(lng), Number(lat)],
      zoom: 15,
    });

    map.on('click', (e) => {
      const point = { lat: e.lngLat.lat, lng: e.lngLat.lng };
      if (pickTarget === 'hazard') setHazard(point);
      else setPicked((prev) => ({ ...prev, [pickTarget]: point }));
    });

    const resizeMap = () => map.resize();
    const observer = new ResizeObserver(resizeMap);
    observer.observe(mapContainer);
    window.addEventListener('resize', resizeMap);
    window.addEventListener('orientationchange', resizeMap);
    document.addEventListener('visibilitychange', resizeMap);
    const rafId = requestAnimationFrame(resizeMap);

    return () => {
      cancelAnimationFrame(rafId);
      observer.disconnect();
      window.removeEventListener('resize', resizeMap);
      window.removeEventListener('orientationchange', resizeMap);
      document.removeEventListener('visibilitychange', resizeMap);
      map.remove();
    };
  }, [tileSourceId, lat, lng, pickTarget]);

  const createCourse = async () => {
    const now = new Date().toISOString();
    const course: Course = {
      id: crypto.randomUUID(),
      name,
      holes: Array.from({ length: 18 }, (_, i) => {
        const h = emptyHole(i + 1);
        h.green = picked;
        if (hazard)
          h.hazards = [
            { id: `h-${i + 1}`, name: 'Placed hazard', type: 'other', location: hazard },
          ];
        return h;
      }),
      tees: [],
      createdAt: now,
      updatedAt: now,
    };
    await saveCourse(course);
    setName('');
    setMessage('Course saved.');
  };

  const importAlgarve = async () => {
    setImporting(true);
    setMessage('Importing Algarve courses...');
    try {
      const imported = await importAlgarveCoursesFromOSM();
      await importCourses(imported);
      setMessage(`Imported ${imported.length} Algarve courses from OSM.`);
    } catch (error) {
      setMessage(
        `Import failed. ${(error as Error).message || 'Please try again later.'}`,
      );
    } finally {
      setImporting(false);
    }
  };

  return (
    <Card>
      <h3 className="mb-2 font-semibold">Create course</h3>
      <div className="space-y-2">
        <Input
          placeholder="Course name"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <div className="grid grid-cols-2 gap-2">
          <Input
            placeholder="Base lat"
            value={lat}
            onChange={(e) => setLat(e.target.value)}
          />
          <Input
            placeholder="Base lng"
            value={lng}
            onChange={(e) => setLng(e.target.value)}
          />
        </div>
        <div className="grid grid-cols-4 gap-1 text-xs">
          {(['front', 'middle', 'back', 'hazard'] as PickTarget[]).map((t) => (
            <button
              key={t}
              onClick={() => setPickTarget(t)}
              className={`rounded border p-1 ${pickTarget === t ? 'bg-gray-900 text-white' : ''}`}
            >
              Pick {t}
            </button>
          ))}
        </div>
        <div ref={mapEl} className="h-52 rounded-xl" />
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          <Button disabled={!name.trim()} onClick={createCourse}>
            Save course
          </Button>
          <Button
            className="bg-emerald-700"
            disabled={importing}
            onClick={() => {
              void importAlgarve();
            }}
          >
            {importing ? 'Importing...' : 'Import Algarve (OSM)'}
          </Button>
        </div>
        {message && <p className="text-xs text-gray-600">{message}</p>}
      </div>
    </Card>
  );
}

export function CoursesScreen() {
  const courses = useAppStore((s) => s.courses);
  return (
    <div className="space-y-3 pb-20">
      <CourseEditor />
      {courses.length === 0 ? (
        <EmptyState
          title="No courses yet"
          desc="Create your first course or import Algarve courses from OSM."
        />
      ) : (
        courses.map((course) => (
          <Card key={course.id}>
            <h3 className="font-semibold">{course.name}</h3>
            <p className="text-sm text-gray-500">{course.holes.length} holes</p>
            {course.locationName && (
              <p className="text-xs text-gray-500">{course.locationName}</p>
            )}
          </Card>
        ))
      )}
    </div>
  );
}
