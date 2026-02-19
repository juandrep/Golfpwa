import { useEffect, useMemo, useRef, useState } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import type { Course, CourseQaReport, HazardZone, Hole, HoleAreas, LatLng, TeeOption } from '../../domain/types';
import { Button, Card, Input } from '../../ui/components';
import { tileSources, useAppStore } from '../../app/store';
import { useToast } from '../../app/toast';
import { closeRing } from '../../domain/geo';
import { buildRasterMapStyle, MAP_MAX_ZOOM } from '../../app/mapStyle';
import { validateCourseGeometry } from '../../domain/courseQa';
import { useAuth } from '../../app/auth';
import {
  apiClient,
  type AdminMember,
  type CourseAuditLogEntry,
  type RoundFeedbackEntry,
} from '../../data';
import { getTeeDisplay, sortTeeOptions } from '../../domain/tee';

type MarkerTarget = 'green-front' | 'green-middle' | 'green-back';
type PointTarget = 'tee' | MarkerTarget;
type EditorMode = 'points' | 'polygons';
type PolygonTarget = 'fairway' | 'green' | 'hazard';
type HazardEditMode = 'add' | 'delete';
type DraggedVertex = {
  target: PolygonTarget;
  pointIndex: number;
  hazardId?: string;
};

const markerColors: Record<MarkerTarget, string> = {
  'green-front': '#4ade80',
  'green-middle': '#16a34a',
  'green-back': '#166534',
};

function cloneCourse(course: Course): Course {
  return JSON.parse(JSON.stringify(course)) as Course;
}

function ensureAreas(hole: Hole): HoleAreas {
  return {
    fairway: hole.areas?.fairway ?? [],
    green: hole.areas?.green ?? [],
    hazards: hole.areas?.hazards ?? [],
  };
}

function getHoleByNumber(course: Course | null, holeNumber: number): Hole | null {
  if (!course) return null;
  return course.holes.find((hole) => hole.number === holeNumber) ?? null;
}

function slugifyCourseId(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

function buildEmptyCourse(courseName: string, clubName: string, locationName: string, seed?: LatLng): Course {
  const now = new Date().toISOString();
  const baseLat = seed?.lat ?? 37.13;
  const baseLng = seed?.lng ?? -8.49;
  const idBase = slugifyCourseId(courseName) || 'course';

  return {
    id: `${idBase}-${crypto.randomUUID().slice(0, 8)}`,
    name: courseName.trim(),
    clubName: clubName.trim() || undefined,
    locationName: locationName.trim() || undefined,
    holes: Array.from({ length: 18 }, (_, idx) => {
      const number = idx + 1;
      const lat = baseLat + idx * 0.00045;
      const lng = baseLng + idx * 0.00028;
      return {
        number,
        par: number % 5 === 0 ? 5 : number % 3 === 0 ? 3 : 4,
        strokeIndex: number,
        lengthYards: 350 + number * 8,
        tee: { lat: lat - 0.00085, lng: lng - 0.00048 },
        green: {
          front: { lat: lat - 0.00008, lng },
          middle: { lat, lng },
          back: { lat: lat + 0.00008, lng },
        },
        hazards: [],
        areas: { fairway: [], green: [], hazards: [] },
      };
    }),
    tees: sortTeeOptions([
      { id: 'black', name: 'Black' },
      { id: 'white', name: 'White' },
      { id: 'yellow', name: 'Yellow' },
      { id: 'red', name: 'Red' },
      { id: 'orange', name: 'Orange' },
    ]),
    publishStatus: 'draft',
    createdAt: now,
    updatedAt: now,
  };
}

export function AdminPanelScreen() {
  const { showToast } = useToast();
  const { user } = useAuth();
  const { courses, saveCourse, tileSourceId } = useAppStore();
  const [selectedCourseId, setSelectedCourseId] = useState('');
  const [holeNumber, setHoleNumber] = useState(1);
  const [mode, setMode] = useState<EditorMode>('points');
  const [pointTarget, setPointTargetMode] = useState<PointTarget>('tee');
  const [polygonTarget, setPolygonTarget] = useState<PolygonTarget>('fairway');
  const [activeHazardId, setActiveHazardId] = useState('');
  const [newHazardName, setNewHazardName] = useState('Hazard');
  const [newTeeName, setNewTeeName] = useState('');
  const [selectedTeeId, setSelectedTeeId] = useState('');
  const [hazardEditMode, setHazardEditMode] = useState<HazardEditMode>('add');
  const [draftCourse, setDraftCourse] = useState<Course | null>(null);
  const [qaReport, setQaReport] = useState<CourseQaReport | null>(null);
  const [saving, setSaving] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [publishingHole, setPublishingHole] = useState(false);
  const [pendingMembers, setPendingMembers] = useState<AdminMember[]>([]);
  const [membersLoading, setMembersLoading] = useState(false);
  const [approvingUid, setApprovingUid] = useState('');
  const [courseAuditLogs, setCourseAuditLogs] = useState<CourseAuditLogEntry[]>([]);
  const [auditLoading, setAuditLoading] = useState(false);
  const [newCourseName, setNewCourseName] = useState('');
  const [newCourseClubName, setNewCourseClubName] = useState('');
  const [newCourseLocationName, setNewCourseLocationName] = useState('');
  const [creatingCourse, setCreatingCourse] = useState(false);
  const [feedbackEntries, setFeedbackEntries] = useState<RoundFeedbackEntry[]>([]);
  const [feedbackLoading, setFeedbackLoading] = useState(false);
  const [feedbackCourseFilter, setFeedbackCourseFilter] = useState('all');
  const [mapReadyToken, setMapReadyToken] = useState(0);

  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const markersRef = useRef<Partial<Record<MarkerTarget, maplibregl.Marker>>>({});
  const teeMarkersRef = useRef<Record<string, maplibregl.Marker>>({});
  const modeRef = useRef<EditorMode>('points');
  const pointTargetRef = useRef<PointTarget>('tee');
  const polygonTargetRef = useRef<PolygonTarget>('fairway');
  const hazardEditModeRef = useRef<HazardEditMode>('add');
  const holeNumberRef = useRef(1);
  const activeHazardIdRef = useRef('');
  const selectedTeeIdRef = useRef('');
  const draggingVertexRef = useRef<DraggedVertex | null>(null);
  const suppressNextMapClickRef = useRef(false);
  const mapGestureLockCountRef = useRef(0);
  const lastCenteredHoleKeyRef = useRef('');
  const adminEmail = user?.email?.trim().toLowerCase() ?? '';

  const lockMapGestures = () => {
    const map = mapRef.current;
    if (!map) return;
    mapGestureLockCountRef.current += 1;
    if (mapGestureLockCountRef.current > 1) return;
    map.dragPan.disable();
    map.touchZoomRotate.disable();
  };

  const unlockMapGestures = () => {
    const map = mapRef.current;
    if (!map) return;
    mapGestureLockCountRef.current = Math.max(0, mapGestureLockCountRef.current - 1);
    if (mapGestureLockCountRef.current !== 0) return;
    map.dragPan.enable();
    map.touchZoomRotate.enable();
  };

  useEffect(() => {
    modeRef.current = mode;
    pointTargetRef.current = pointTarget;
    polygonTargetRef.current = polygonTarget;
    hazardEditModeRef.current = hazardEditMode;
    holeNumberRef.current = holeNumber;
    activeHazardIdRef.current = activeHazardId;
    selectedTeeIdRef.current = selectedTeeId;
  }, [activeHazardId, hazardEditMode, holeNumber, mode, pointTarget, polygonTarget, selectedTeeId]);

  useEffect(() => {
    if (!selectedCourseId && courses.length > 0) {
      setSelectedCourseId(courses[0].id);
    }
  }, [courses, selectedCourseId]);

  const selectedCourse = useMemo(
    () => courses.find((course) => course.id === selectedCourseId) ?? null,
    [courses, selectedCourseId],
  );

  useEffect(() => {
    if (!selectedCourse) {
      setDraftCourse(null);
      setQaReport(null);
      return;
    }
    const nextDraft = cloneCourse(selectedCourse);
    nextDraft.holes = cloneCourse({
      ...selectedCourse,
      holes: selectedCourse.draftHoles ?? selectedCourse.holes,
    }).holes;
    setDraftCourse(nextDraft);
    setQaReport(selectedCourse.qaReport ?? null);
    setSelectedTeeId(sortTeeOptions(nextDraft.tees)[0]?.id ?? '');
    setNewTeeName('');
    setHoleNumber(1);
  }, [selectedCourse?.id]);

  const currentHole = useMemo(
    () => getHoleByNumber(draftCourse, holeNumber),
    [draftCourse, holeNumber],
  );

  const currentAreas = useMemo(
    () => (currentHole ? ensureAreas(currentHole) : null),
    [currentHole],
  );
  const orderedDraftTees = useMemo(() => sortTeeOptions(draftCourse?.tees ?? []), [draftCourse?.tees]);

  const activeHazard = useMemo(
    () => currentAreas?.hazards.find((hazard) => hazard.id === activeHazardId) ?? null,
    [activeHazardId, currentAreas?.hazards],
  );

  useEffect(() => {
    if (!draftCourse) {
      if (selectedTeeId) setSelectedTeeId('');
      return;
    }
    if (orderedDraftTees.length === 0) {
      if (selectedTeeId) setSelectedTeeId('');
      return;
    }
    if (!selectedTeeId || !orderedDraftTees.some((tee) => tee.id === selectedTeeId)) {
      setSelectedTeeId(orderedDraftTees[0].id);
    }
  }, [draftCourse, orderedDraftTees, selectedTeeId]);

  const refreshPendingMembers = async () => {
    if (!adminEmail) return;
    setMembersLoading(true);
    try {
      const members = await apiClient.listMembers(adminEmail, 'pending');
      setPendingMembers(members);
    } catch {
      showToast('Unable to load pending member approvals.');
    } finally {
      setMembersLoading(false);
    }
  };

  const refreshCourseAuditLogs = async (courseId: string) => {
    if (!adminEmail || !courseId) return;
    setAuditLoading(true);
    try {
      const logs = await apiClient.listCourseAuditLogs(adminEmail, courseId, 40);
      setCourseAuditLogs(logs);
    } catch {
      showToast('Unable to load course audit trail.');
    } finally {
      setAuditLoading(false);
    }
  };

  const refreshRoundFeedback = async (courseId = feedbackCourseFilter) => {
    if (!adminEmail) return;
    setFeedbackLoading(true);
    try {
      const entries = await apiClient.listRoundFeedback(adminEmail, courseId, 80);
      setFeedbackEntries(entries);
    } catch {
      showToast('Unable to load round feedback.');
    } finally {
      setFeedbackLoading(false);
    }
  };

  const appendCourseAuditLog = async (action: string, details: string) => {
    if (!adminEmail || !selectedCourseId) return;
    try {
      const log = await apiClient.addCourseAuditLog(adminEmail, selectedCourseId, action, details);
      setCourseAuditLogs((previous) => [log, ...previous].slice(0, 40));
    } catch {
      showToast('Failed to write audit log.');
    }
  };

  useEffect(() => {
    void refreshPendingMembers();
  }, [adminEmail]);

  useEffect(() => {
    if (!selectedCourseId) {
      setCourseAuditLogs([]);
      return;
    }
    void refreshCourseAuditLogs(selectedCourseId);
  }, [adminEmail, selectedCourseId]);

  useEffect(() => {
    void refreshRoundFeedback(feedbackCourseFilter);
  }, [adminEmail, feedbackCourseFilter]);

  const updateCurrentHole = (updater: (hole: Hole) => Hole) => {
    const selectedHole = holeNumberRef.current;
    setDraftCourse((previous) => {
      if (!previous) return previous;
      return {
        ...previous,
        holes: previous.holes.map((hole) => (
          hole.number === selectedHole
            ? updater(hole)
            : hole
        )),
      };
    });
  };

  const updateDraftTees = (updater: (tees: TeeOption[]) => TeeOption[]) => {
    setDraftCourse((previous) => {
      if (!previous) return previous;
      return {
        ...previous,
        tees: sortTeeOptions(updater(previous.tees)),
      };
    });
  };

  const addTeeOption = () => {
    const name = newTeeName.trim();
    if (!name) {
      showToast('Enter tee name first.');
      return;
    }

    let nextTee: TeeOption = {
      id: name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || crypto.randomUUID(),
      name,
    };

    updateDraftTees((tees) => {
      if (tees.some((tee) => tee.id === nextTee.id)) {
        nextTee = { ...nextTee, id: crypto.randomUUID() };
      }
      return [...tees, nextTee];
    });

    setSelectedTeeId(nextTee.id);
    setNewTeeName('');
  };

  const addPresetTeeOption = (label: string) => {
    const normalized = label.trim().toLowerCase();
    if (!normalized) return;

    const alreadyExists = orderedDraftTees.some((tee) => {
      const key = `${tee.id} ${tee.name}`.trim().toLowerCase();
      return key.includes(normalized);
    });
    if (alreadyExists) {
      showToast(`${label} tee already exists.`);
      return;
    }

    let nextTee: TeeOption = {
      id: normalized.replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || crypto.randomUUID(),
      name: label,
    };
    updateDraftTees((tees) => {
      if (tees.some((tee) => tee.id === nextTee.id)) {
        nextTee = { ...nextTee, id: crypto.randomUUID() };
      }
      return [...tees, nextTee];
    });
    setSelectedTeeId(nextTee.id);
  };

  const removeSelectedTee = () => {
    if (!selectedTeeId) return;
    const removedTeeId = selectedTeeId;
    let fallbackTeeId = '';
    updateDraftTees((tees) => {
      const nextTees = tees.filter((tee) => tee.id !== selectedTeeId);
      fallbackTeeId = nextTees[0]?.id ?? '';
      return nextTees;
    });
    setDraftCourse((previous) => {
      if (!previous) return previous;
      return {
        ...previous,
        holes: previous.holes.map((hole) => {
          if (!hole.teePoints?.[removedTeeId]) return hole;
          const nextTeePoints = { ...hole.teePoints };
          delete nextTeePoints[removedTeeId];
          return { ...hole, teePoints: nextTeePoints };
        }),
      };
    });
    setSelectedTeeId(fallbackTeeId);
  };

  const appendPolygonPoint = (point: LatLng) => {
    const nextTarget = polygonTargetRef.current;
    const hazardId = activeHazardIdRef.current;
    let createdHazardId = '';
    updateCurrentHole((hole) => {
      const areas = ensureAreas(hole);
      if (nextTarget === 'fairway') {
        return { ...hole, areas: { ...areas, fairway: [...areas.fairway, point] } };
      }
      if (nextTarget === 'green') {
        return { ...hole, areas: { ...areas, green: [...areas.green, point] } };
      }
      const hazards = [...areas.hazards];
      const resolvedHazardId = hazardId || crypto.randomUUID();
      if (!hazardId) {
        createdHazardId = resolvedHazardId;
        hazards.push({
          id: resolvedHazardId,
          name: newHazardName.trim() || 'Hazard',
          type: 'other',
          points: [],
        });
      }
      const targetIndex = hazards.findIndex((hazard) => hazard.id === resolvedHazardId);
      if (targetIndex === -1) return hole;
      const targetHazard = hazards[targetIndex];
      hazards[targetIndex] = { ...targetHazard, points: [...targetHazard.points, point] };
      return { ...hole, areas: { ...areas, hazards } };
    });
    if (createdHazardId) {
      setActiveHazardId(createdHazardId);
      setPolygonTarget('hazard');
    }
  };

  const removeNearestHazardVertex = (point: LatLng) => {
    const hazardId = activeHazardIdRef.current;
    if (!hazardId) {
      showToast('Select a hazard zone first.');
      return;
    }

    let removed = false;
    updateCurrentHole((hole) => {
      const areas = ensureAreas(hole);
      const hazards = [...areas.hazards];
      const targetIndex = hazards.findIndex((hazard) => hazard.id === hazardId);
      if (targetIndex === -1) return hole;

      const targetHazard = hazards[targetIndex];
      if (targetHazard.points.length === 0) return hole;

      const metersPerLat = 111320;
      const metersPerLng = 111320 * Math.cos((point.lat * Math.PI) / 180);
      let nearestIndex = -1;
      let nearestDistance = Number.POSITIVE_INFINITY;
      targetHazard.points.forEach((vertex, index) => {
        const dLat = (vertex.lat - point.lat) * metersPerLat;
        const dLng = (vertex.lng - point.lng) * metersPerLng;
        const distance = Math.hypot(dLat, dLng);
        if (distance < nearestDistance) {
          nearestDistance = distance;
          nearestIndex = index;
        }
      });

      if (nearestIndex === -1 || nearestDistance > 35) return hole;
      const nextPoints = targetHazard.points.filter((_, index) => index !== nearestIndex);
      hazards[targetIndex] = { ...targetHazard, points: nextPoints };
      removed = true;
      return { ...hole, areas: { ...areas, hazards } };
    });

    if (!removed) {
      showToast('Tap closer to a hazard vertex to delete it.');
    }
  };

  const setPointReference = (point: LatLng) => {
    const target = pointTargetRef.current;
    updateCurrentHole((hole) => {
      if (target === 'tee') {
        const teeId = selectedTeeIdRef.current;
        if (!teeId) return hole;
        const nextTeePoints = { ...(hole.teePoints ?? {}), [teeId]: point };
        const fallbackTeeId = orderedDraftTees[0]?.id;
        const nextLegacyTee = (!hole.tee || teeId === fallbackTeeId) ? point : hole.tee;
        return { ...hole, tee: nextLegacyTee, teePoints: nextTeePoints };
      }
      if (target === 'green-front') return { ...hole, green: { ...hole.green, front: point } };
      if (target === 'green-middle') return { ...hole, green: { ...hole.green, middle: point } };
      return { ...hole, green: { ...hole.green, back: point } };
    });
  };

  const setPointReferenceByTarget = (target: MarkerTarget, point: LatLng) => {
    updateCurrentHole((hole) => {
      if (target === 'green-front') return { ...hole, green: { ...hole.green, front: point } };
      if (target === 'green-middle') return { ...hole, green: { ...hole.green, middle: point } };
      return { ...hole, green: { ...hole.green, back: point } };
    });
  };

  const setTeeReferenceById = (teeId: string, point: LatLng) => {
    updateCurrentHole((hole) => {
      const nextTeePoints = { ...(hole.teePoints ?? {}), [teeId]: point };
      const fallbackTeeId = orderedDraftTees[0]?.id;
      const nextLegacyTee = (!hole.tee || teeId === fallbackTeeId) ? point : hole.tee;
      return { ...hole, tee: nextLegacyTee, teePoints: nextTeePoints };
    });
  };

  const movePolygonVertex = (dragged: DraggedVertex, point: LatLng) => {
    updateCurrentHole((hole) => {
      const areas = ensureAreas(hole);
      if (dragged.target === 'fairway') {
        if (dragged.pointIndex < 0 || dragged.pointIndex >= areas.fairway.length) return hole;
        const nextFairway = [...areas.fairway];
        nextFairway[dragged.pointIndex] = point;
        return { ...hole, areas: { ...areas, fairway: nextFairway } };
      }
      if (dragged.target === 'green') {
        if (dragged.pointIndex < 0 || dragged.pointIndex >= areas.green.length) return hole;
        const nextGreen = [...areas.green];
        nextGreen[dragged.pointIndex] = point;
        return { ...hole, areas: { ...areas, green: nextGreen } };
      }
      if (!dragged.hazardId) return hole;
      const hazards = areas.hazards.map((hazard) => {
        if (hazard.id !== dragged.hazardId) return hazard;
        if (dragged.pointIndex < 0 || dragged.pointIndex >= hazard.points.length) return hazard;
        const nextPoints = [...hazard.points];
        nextPoints[dragged.pointIndex] = point;
        return { ...hazard, points: nextPoints };
      });
      return { ...hole, areas: { ...areas, hazards } };
    });
  };

  const addHazardZone = () => {
    const name = newHazardName.trim() || 'Hazard';
    const zone: HazardZone = {
      id: crypto.randomUUID(),
      name,
      type: 'other',
      points: [],
    };
    updateCurrentHole((hole) => {
      const areas = ensureAreas(hole);
      return {
        ...hole,
        areas: {
          ...areas,
          hazards: [...areas.hazards, zone],
        },
      };
    });
    setActiveHazardId(zone.id);
    setPolygonTarget('hazard');
  };

  const undoLastPolygonPoint = () => {
    if (!currentHole) return;
    if (polygonTarget === 'fairway') {
      updateCurrentHole((hole) => {
        const areas = ensureAreas(hole);
        return { ...hole, areas: { ...areas, fairway: areas.fairway.slice(0, -1) } };
      });
      return;
    }
    if (polygonTarget === 'green') {
      updateCurrentHole((hole) => {
        const areas = ensureAreas(hole);
        return { ...hole, areas: { ...areas, green: areas.green.slice(0, -1) } };
      });
      return;
    }
    if (!activeHazardId) return;
    updateCurrentHole((hole) => {
      const areas = ensureAreas(hole);
      const hazards = areas.hazards.map((hazard) => (
        hazard.id === activeHazardId
          ? { ...hazard, points: hazard.points.slice(0, -1) }
          : hazard
      ));
      return { ...hole, areas: { ...areas, hazards } };
    });
  };

  const clearPolygon = () => {
    if (polygonTarget === 'fairway') {
      updateCurrentHole((hole) => {
        const areas = ensureAreas(hole);
        return { ...hole, areas: { ...areas, fairway: [] } };
      });
      return;
    }
    if (polygonTarget === 'green') {
      updateCurrentHole((hole) => {
        const areas = ensureAreas(hole);
        return { ...hole, areas: { ...areas, green: [] } };
      });
      return;
    }
    if (!activeHazardId) return;
    updateCurrentHole((hole) => {
      const areas = ensureAreas(hole);
      const hazards = areas.hazards.filter((hazard) => hazard.id !== activeHazardId);
      return { ...hole, areas: { ...areas, hazards } };
    });
    setActiveHazardId('');
  };

  useEffect(() => {
    if (!mapContainerRef.current || !currentHole) return;
    mapRef.current?.remove();
    mapRef.current = null;
    const tile = tileSources.find((entry) => entry.id === tileSourceId) ?? tileSources[0];

    const map = new maplibregl.Map({
      container: mapContainerRef.current,
      style: buildRasterMapStyle(tile),
      center: [currentHole.green.middle.lng, currentHole.green.middle.lat],
      zoom: 17,
      maxZoom: MAP_MAX_ZOOM,
      pitch: 0,
      bearing: 0,
    });

    mapRef.current = map;
    map.on('load', () => {
      setMapReadyToken((previous) => previous + 1);
      if (!map.getSource('admin-areas')) {
        map.addSource('admin-areas', {
          type: 'geojson',
          data: { type: 'FeatureCollection', features: [] },
        });
        map.addLayer({
          id: 'admin-areas-fill',
          type: 'fill',
          source: 'admin-areas',
          paint: {
            'fill-color': ['get', 'color'],
            'fill-opacity': 0.30,
          },
        });
        map.addLayer({
          id: 'admin-areas-line',
          type: 'line',
          source: 'admin-areas',
          paint: {
            'line-color': ['get', 'lineColor'],
            'line-width': 2,
          },
        });
      }

      if (!map.getSource('admin-vertices')) {
        map.addSource('admin-vertices', {
          type: 'geojson',
          data: { type: 'FeatureCollection', features: [] },
        });
        map.addLayer({
          id: 'admin-vertices-circle',
          type: 'circle',
          source: 'admin-vertices',
          paint: {
            'circle-radius': [
              'case',
              ['==', ['get', 'isActive'], true],
              6.5,
              4.8,
            ],
            'circle-color': ['get', 'color'],
            'circle-stroke-color': '#ffffff',
            'circle-stroke-width': 1.6,
          },
        });
        map.addLayer({
          id: 'admin-vertices-label',
          type: 'symbol',
          source: 'admin-vertices',
          layout: {
            'text-field': ['to-string', ['get', 'idx']],
            'text-size': 10,
            'text-offset': [0, -1.25],
            'text-allow-overlap': true,
          },
          paint: {
            'text-color': '#111827',
            'text-halo-color': '#ffffff',
            'text-halo-width': 1,
          },
        });
      }
    });

    map.on('click', (event) => {
      if (suppressNextMapClickRef.current) {
        suppressNextMapClickRef.current = false;
        return;
      }
      const point = { lat: event.lngLat.lat, lng: event.lngLat.lng };
      if (modeRef.current === 'points') {
        if (pointTargetRef.current === 'tee' && !selectedTeeIdRef.current) {
          showToast('Add/select a tee first, then tap map to place tee pin.');
          return;
        }
        setPointReference(point);
      } else {
        if (polygonTargetRef.current === 'hazard' && hazardEditModeRef.current === 'delete') {
          removeNearestHazardVertex(point);
        } else {
          appendPolygonPoint(point);
        }
      }
    });

    map.on('mousedown', 'admin-vertices-circle', (event) => {
      if (modeRef.current !== 'polygons') return;
      const feature = event.features?.[0];
      const properties = feature?.properties as
        | { target?: string; pointIndex?: number | string; hazardId?: string }
        | undefined;
      const target = properties?.target;
      const pointIndex = Number(properties?.pointIndex);
      if (!target || !Number.isFinite(pointIndex)) return;
      if (target !== 'fairway' && target !== 'green' && target !== 'hazard') return;

      draggingVertexRef.current = {
        target,
        pointIndex,
        hazardId: properties?.hazardId ? String(properties.hazardId) : undefined,
      };
      suppressNextMapClickRef.current = true;
      lockMapGestures();
      map.getCanvas().style.cursor = 'grabbing';
    });
    map.on('touchstart', 'admin-vertices-circle', (event) => {
      if (modeRef.current !== 'polygons') return;
      const feature = event.features?.[0];
      const properties = feature?.properties as
        | { target?: string; pointIndex?: number | string; hazardId?: string }
        | undefined;
      const target = properties?.target;
      const pointIndex = Number(properties?.pointIndex);
      if (!target || !Number.isFinite(pointIndex)) return;
      if (target !== 'fairway' && target !== 'green' && target !== 'hazard') return;

      draggingVertexRef.current = {
        target,
        pointIndex,
        hazardId: properties?.hazardId ? String(properties.hazardId) : undefined,
      };
      suppressNextMapClickRef.current = true;
      lockMapGestures();
    });
    map.on('mouseenter', 'admin-vertices-circle', () => {
      if (modeRef.current !== 'polygons') return;
      if (draggingVertexRef.current) return;
      map.getCanvas().style.cursor = 'grab';
    });
    map.on('mouseleave', 'admin-vertices-circle', () => {
      if (draggingVertexRef.current) return;
      map.getCanvas().style.cursor = '';
    });

    map.on('mousemove', (event) => {
      if (!draggingVertexRef.current) return;
      const point = { lat: event.lngLat.lat, lng: event.lngLat.lng };
      movePolygonVertex(draggingVertexRef.current, point);
    });

    const stopVertexDrag = () => {
      if (!draggingVertexRef.current) return;
      draggingVertexRef.current = null;
      unlockMapGestures();
      map.getCanvas().style.cursor = '';
    };
    map.on('mouseup', stopVertexDrag);
    map.on('mouseleave', stopVertexDrag);
    map.on('touchend', stopVertexDrag);
    map.on('touchcancel', stopVertexDrag);

    return () => {
      Object.values(markersRef.current).forEach((marker) => marker?.remove());
      Object.values(teeMarkersRef.current).forEach((marker) => marker.remove());
      markersRef.current = {};
      teeMarkersRef.current = {};
      draggingVertexRef.current = null;
      suppressNextMapClickRef.current = false;
      mapGestureLockCountRef.current = 0;
      map.remove();
      mapRef.current = null;
    };
  }, [currentHole?.number, selectedCourseId, tileSourceId]);

  useEffect(() => {
    if (!currentHole || !mapRef.current) return;
    const holeCenterKey = `${selectedCourseId}:${currentHole.number}:${mapReadyToken}`;
    if (lastCenteredHoleKeyRef.current !== holeCenterKey) {
      mapRef.current.easeTo({
        center: [currentHole.green.middle.lng, currentHole.green.middle.lat],
        duration: 350,
      });
      lastCenteredHoleKeyRef.current = holeCenterKey;
    }

    const points: Partial<Record<MarkerTarget, LatLng | null>> = {
      'green-front': currentHole.green.front,
      'green-middle': currentHole.green.middle,
      'green-back': currentHole.green.back,
    };

    (Object.keys(points) as MarkerTarget[]).forEach((key) => {
      const point = points[key];
      const marker = markersRef.current[key];
      if (!point) {
        marker?.remove();
        delete markersRef.current[key];
        return;
      }

      if (!marker) {
        const nextMarker = new maplibregl.Marker({ color: markerColors[key], draggable: true })
          .setLngLat([point.lng, point.lat])
          .addTo(mapRef.current!);
        nextMarker.on('dragstart', () => {
          lockMapGestures();
        });
        nextMarker.on('dragend', () => {
          const lngLat = nextMarker.getLngLat();
          setPointReferenceByTarget(key, { lat: lngLat.lat, lng: lngLat.lng });
          unlockMapGestures();
        });
        markersRef.current[key] = nextMarker;
      } else {
        marker.setLngLat([point.lng, point.lat]);
      }
    });

    Object.values(teeMarkersRef.current).forEach((marker) => marker.remove());
    teeMarkersRef.current = {};

    const teeOptions = orderedDraftTees;
    teeOptions.forEach((teeOption, index) => {
      const teePoint = currentHole.teePoints?.[teeOption.id]
        ?? (index === 0 ? currentHole.tee ?? null : null);
      if (!teePoint) return;
      const teeDisplay = getTeeDisplay(teeOption);
      const nextTeeMarker = new maplibregl.Marker({ color: teeDisplay.color, draggable: true })
        .setLngLat([teePoint.lng, teePoint.lat])
        .addTo(mapRef.current!);
      nextTeeMarker.on('dragstart', () => {
        lockMapGestures();
      });
      nextTeeMarker.on('dragend', () => {
        const lngLat = nextTeeMarker.getLngLat();
        setTeeReferenceById(teeOption.id, { lat: lngLat.lat, lng: lngLat.lng });
        unlockMapGestures();
      });
      teeMarkersRef.current[teeOption.id] = nextTeeMarker;
    });
  }, [currentHole, mapReadyToken, orderedDraftTees, selectedCourseId]);

  useEffect(() => {
    if (!currentAreas || !mapRef.current) return;
    const source = mapRef.current.getSource('admin-areas') as maplibregl.GeoJSONSource | undefined;
    const vertexSource = mapRef.current.getSource('admin-vertices') as maplibregl.GeoJSONSource | undefined;
    if (!source || !vertexSource) return;

    const features: GeoJSON.Feature[] = [];
    const vertexFeatures: GeoJSON.Feature[] = [];

    const addVertices = (
      points: LatLng[],
      color: string,
      isActive: boolean,
      target: PolygonTarget,
      hazardId?: string,
    ) => {
      points.forEach((point, index) => {
        vertexFeatures.push({
          type: 'Feature',
          properties: {
            color,
            idx: index + 1,
            isActive,
            target,
            pointIndex: index,
            hazardId: hazardId ?? '',
          },
          geometry: { type: 'Point', coordinates: [point.lng, point.lat] },
        });
      });
    };

    if (currentAreas.fairway.length >= 2) {
      features.push({
        type: 'Feature',
        properties: { lineColor: '#0284c7' },
        geometry: {
          type: 'LineString',
          coordinates: currentAreas.fairway.map((point) => [point.lng, point.lat]),
        },
      });
    }
    if (currentAreas.fairway.length >= 3) {
      features.push({
        type: 'Feature',
        properties: { color: '#38bdf8', lineColor: '#0284c7' },
        geometry: { type: 'Polygon', coordinates: [closeRing(currentAreas.fairway)] },
      });
    }
    addVertices(currentAreas.fairway, '#0284c7', polygonTarget === 'fairway', 'fairway');

    if (currentAreas.green.length >= 2) {
      features.push({
        type: 'Feature',
        properties: { lineColor: '#15803d' },
        geometry: {
          type: 'LineString',
          coordinates: currentAreas.green.map((point) => [point.lng, point.lat]),
        },
      });
    }
    if (currentAreas.green.length >= 3) {
      features.push({
        type: 'Feature',
        properties: { color: '#22c55e', lineColor: '#15803d' },
        geometry: { type: 'Polygon', coordinates: [closeRing(currentAreas.green)] },
      });
    }
    addVertices(currentAreas.green, '#15803d', polygonTarget === 'green', 'green');

    currentAreas.hazards.forEach((hazard) => {
      if (hazard.points.length >= 2) {
        features.push({
          type: 'Feature',
          properties: { lineColor: '#991b1b' },
          geometry: {
            type: 'LineString',
            coordinates: hazard.points.map((point) => [point.lng, point.lat]),
          },
        });
      }
      if (hazard.points.length < 3) return;
      features.push({
        type: 'Feature',
        properties: { color: '#ef4444', lineColor: '#991b1b' },
        geometry: { type: 'Polygon', coordinates: [closeRing(hazard.points)] },
      });
    });
    currentAreas.hazards.forEach((hazard) => {
      addVertices(
        hazard.points,
        '#991b1b',
        polygonTarget === 'hazard' && activeHazardId === hazard.id,
        'hazard',
        hazard.id,
      );
    });

    source.setData({
      type: 'FeatureCollection',
      features,
    });
    vertexSource.setData({
      type: 'FeatureCollection',
      features: vertexFeatures,
    });
  }, [activeHazardId, currentAreas, mapReadyToken, polygonTarget]);

  const selectedPoint = useMemo(() => {
    if (!currentHole) return null;
    if (pointTarget === 'tee') {
      if (!selectedTeeId) return null;
      return currentHole.teePoints?.[selectedTeeId]
        ?? (orderedDraftTees[0]?.id === selectedTeeId ? currentHole.tee ?? null : null);
    }
    if (pointTarget === 'green-front') return currentHole.green.front;
    if (pointTarget === 'green-middle') return currentHole.green.middle;
    return currentHole.green.back;
  }, [currentHole, orderedDraftTees, pointTarget, selectedTeeId]);

  const selectedPolygonPointCount = useMemo(() => {
    if (!currentAreas) return 0;
    if (polygonTarget === 'fairway') return currentAreas.fairway.length;
    if (polygonTarget === 'green') return currentAreas.green.length;
    return activeHazard?.points.length ?? 0;
  }, [activeHazard?.points.length, currentAreas, polygonTarget]);

  const saveDraftCourse = async () => {
    if (!draftCourse || !selectedCourse) return;
    const report = validateCourseGeometry(draftCourse.holes);
    setQaReport(report);
    setSaving(true);
    try {
      const now = new Date().toISOString();
      await saveCourse({
        ...selectedCourse,
        tees: sortTeeOptions(draftCourse.tees),
        draftHoles: draftCourse.holes,
        publishStatus: 'draft',
        qaReport: report,
        updatedAt: now,
      });
      await appendCourseAuditLog(
        'save_draft',
        `Saved draft for ${selectedCourse.name}. Hole ${holeNumber} edited in ${mode} mode.`,
      );
      showToast(
        report.errorCount > 0
          ? `Draft saved with ${report.errorCount} error(s) and ${report.warningCount} warning(s).`
          : `Draft saved (${report.warningCount} warning(s)).`,
      );
    } finally {
      setSaving(false);
    }
  };

  const publishDraftCourse = async () => {
    if (!draftCourse || !selectedCourse) return;
    const report = validateCourseGeometry(draftCourse.holes);
    setQaReport(report);
    if (report.errorCount > 0) {
      showToast(`Cannot publish: ${report.errorCount} QA error(s).`);
      return;
    }

    setPublishing(true);
    try {
      const now = new Date().toISOString();
      const publishedCourse: Course = {
        ...selectedCourse,
        tees: sortTeeOptions(draftCourse.tees),
        holes: draftCourse.holes,
        draftHoles: undefined,
        publishStatus: 'published',
        publishedAt: now,
        qaReport: report,
        updatedAt: now,
      };
      await saveCourse(publishedCourse);
      setDraftCourse(cloneCourse(publishedCourse));
      await appendCourseAuditLog(
        'publish_all_holes',
        `Published ${selectedCourse.name} with ${report.warningCount} warning(s) and 0 errors.`,
      );
      showToast('Course mapping published.');
    } finally {
      setPublishing(false);
    }
  };

  const publishCurrentHole = async () => {
    if (!draftCourse || !selectedCourse || !currentHole) return;
    const holeOnlyReport = validateCourseGeometry([currentHole]);
    if (holeOnlyReport.errorCount > 0) {
      showToast(`Cannot publish hole ${currentHole.number}: ${holeOnlyReport.errorCount} QA error(s).`);
      return;
    }

    setPublishingHole(true);
    try {
      const now = new Date().toISOString();
      const mergedPublishedHoles = selectedCourse.holes.map((hole) => (
        hole.number === currentHole.number
          ? currentHole
          : hole
      ));
      const nextCourse: Course = {
        ...selectedCourse,
        tees: sortTeeOptions(draftCourse.tees),
        holes: mergedPublishedHoles,
        draftHoles: draftCourse.holes,
        publishStatus: 'draft',
        publishedAt: selectedCourse.publishedAt ?? now,
        updatedAt: now,
      };
      await saveCourse(nextCourse);
      setDraftCourse((previous) => (
        previous
          ? { ...previous, holes: draftCourse.holes }
          : previous
      ));
      await appendCourseAuditLog(
        'publish_single_hole',
        `Published hole ${currentHole.number} for ${selectedCourse.name}.`,
      );
      showToast(`Hole ${currentHole.number} published.`);
    } finally {
      setPublishingHole(false);
    }
  };

  const discardDraft = async () => {
    if (!selectedCourse) return;
    const restoredHoles = selectedCourse.holes;
    setDraftCourse((previous) => (
      previous
        ? {
            ...previous,
            holes: cloneCourse({ ...selectedCourse, holes: restoredHoles }).holes,
          }
        : previous
    ));
    const now = new Date().toISOString();
    await saveCourse({
      ...selectedCourse,
      tees: sortTeeOptions(draftCourse?.tees ?? selectedCourse.tees),
      draftHoles: undefined,
      publishStatus: selectedCourse.publishedAt ? 'published' : (selectedCourse.publishStatus ?? 'published'),
      updatedAt: now,
    });
    await appendCourseAuditLog('discard_draft', `Discarded draft for ${selectedCourse.name}.`);
    showToast('Draft discarded.');
  };

  const setFromGps = () => {
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const point = { lat: position.coords.latitude, lng: position.coords.longitude };
        if (mode === 'points') setPointReference(point);
        else appendPolygonPoint(point);
      },
      () => showToast('Unable to get GPS position.'),
      { enableHighAccuracy: true },
    );
  };

  const draftExists = Boolean(selectedCourse?.draftHoles && selectedCourse.draftHoles.length > 0);
  const publishStatus = selectedCourse?.publishStatus ?? 'published';
  const currentStatusLabel = draftExists || publishStatus === 'draft' ? 'Draft' : 'Published';

  const createCourseFromPanel = async () => {
    const name = newCourseName.trim();
    if (!name) {
      showToast('Course name is required.');
      return;
    }
    if (courses.some((course) => course.name.trim().toLowerCase() === name.toLowerCase())) {
      showToast('A course with this name already exists.');
      return;
    }

    const seed = selectedCourse?.holes?.[0]?.green.middle;
    const nextCourse = buildEmptyCourse(name, newCourseClubName, newCourseLocationName, seed);
    setCreatingCourse(true);
    try {
      await saveCourse(nextCourse);
      setSelectedCourseId(nextCourse.id);
      setNewCourseName('');
      setNewCourseClubName('');
      setNewCourseLocationName('');
      showToast(`Created course ${nextCourse.name}.`);
    } finally {
      setCreatingCourse(false);
    }
  };

  const approveMember = async (uid: string) => {
    if (!adminEmail) return;
    setApprovingUid(uid);
    try {
      const member = await apiClient.setMemberApproval(adminEmail, uid, 'approved');
      setPendingMembers((previous) => previous.filter((entry) => entry.uid !== uid));
      await appendCourseAuditLog(
        'member_approved',
        `Approved member ${member.displayName || member.email || uid}.`,
      );
      showToast(`${member.displayName || 'Member'} approved.`);
    } catch {
      showToast('Failed to approve member.');
    } finally {
      setApprovingUid('');
    }
  };

  const auditActionLabel = (action: string) => (
    action
      .replace(/_/g, ' ')
      .replace(/\b\w/g, (letter) => letter.toUpperCase())
  );

  return (
    <section className="space-y-4 pb-24">
      <Card>
        <h2 className="text-xl font-semibold">Admin Control Panel</h2>
        <p className="mt-1 text-sm text-gray-600">
          Build accurate hole geometry. Use points for tee/green targets and polygons for fairway, green area, and hazard zones.
        </p>
        <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
          <span className={`rounded-full px-2 py-1 font-semibold ${currentStatusLabel === 'Draft' ? 'bg-amber-100 text-amber-800' : 'bg-emerald-100 text-emerald-800'}`}>
            {currentStatusLabel}
          </span>
          {selectedCourse?.publishedAt ? (
            <span className="rounded-full bg-stone-100 px-2 py-1 text-stone-700">
              Published: {new Date(selectedCourse.publishedAt).toLocaleString()}
            </span>
          ) : null}
        </div>
      </Card>

      <Card className="space-y-3">
        <h3 className="font-semibold">Create Course</h3>
        <div className="grid gap-3 sm:grid-cols-3">
          <label className="text-sm font-medium">
            Course Name
            <Input
              className="mt-1"
              value={newCourseName}
              onChange={(event) => setNewCourseName(event.target.value)}
              placeholder="e.g. Gramacho South"
            />
          </label>
          <label className="text-sm font-medium">
            Club Name
            <Input
              className="mt-1"
              value={newCourseClubName}
              onChange={(event) => setNewCourseClubName(event.target.value)}
              placeholder="Optional"
            />
          </label>
          <label className="text-sm font-medium">
            Location
            <Input
              className="mt-1"
              value={newCourseLocationName}
              onChange={(event) => setNewCourseLocationName(event.target.value)}
              placeholder="Optional"
            />
          </label>
        </div>
        <div className="flex items-center gap-2">
          <Button onClick={() => void createCourseFromPanel()} disabled={creatingCourse}>
            {creatingCourse ? 'Creating...' : 'Create Course'}
          </Button>
          <p className="text-xs text-gray-600">Creates an 18-hole draft template with standard tees.</p>
        </div>
      </Card>

      <Card className="space-y-3">
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="text-sm font-medium">
            Course
            <select
              className="mt-1 w-full rounded-xl border border-gray-200 px-3 py-2"
              value={selectedCourseId}
              onChange={(event) => setSelectedCourseId(event.target.value)}
            >
              {courses.map((course) => (
                <option key={course.id} value={course.id}>{course.name}</option>
              ))}
            </select>
          </label>

          <label className="text-sm font-medium">
            Hole
            <select
              className="mt-1 w-full rounded-xl border border-gray-200 px-3 py-2"
              value={holeNumber}
              onChange={(event) => setHoleNumber(Number(event.target.value))}
            >
              {Array.from({ length: 18 }, (_, idx) => idx + 1).map((value) => (
                <option key={value} value={value}>Hole {value}</option>
              ))}
            </select>
          </label>
        </div>

        <div className="rounded-xl border border-gray-200 bg-gray-50 p-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-600">Course Tees</p>
          <div className="mt-2 grid gap-2 sm:grid-cols-[1fr_auto]">
            <select
              className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm"
              value={selectedTeeId}
              onChange={(event) => setSelectedTeeId(event.target.value)}
            >
              {orderedDraftTees.length === 0 ? (
                <option value="">No tees yet</option>
              ) : (
                orderedDraftTees.map((tee) => (
                  <option key={tee.id} value={tee.id}>{tee.name}</option>
                ))
              )}
            </select>
            <Button
              variant="ghost"
              onClick={removeSelectedTee}
              disabled={!selectedTeeId}
            >
              Remove Tee
            </Button>
          </div>
          <div className="mt-2 grid gap-2 sm:grid-cols-[1fr_auto]">
            <Input
              value={newTeeName}
              onChange={(event) => setNewTeeName(event.target.value)}
              placeholder="New tee name (White, Yellow, Red...)"
            />
            <Button variant="secondary" onClick={addTeeOption}>
              Add Tee
            </Button>
          </div>
          <div className="mt-2 flex flex-wrap gap-2">
            {['Black', 'Blue', 'White', 'Yellow', 'Red', 'Orange'].map((teeLabel) => (
              <Button
                key={teeLabel}
                variant="ghost"
                className="px-2 py-1 text-xs"
                onClick={() => addPresetTeeOption(teeLabel)}
              >
                Add {teeLabel}
              </Button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <button
            type="button"
            className={`rounded-xl border px-3 py-2 text-sm ${mode === 'points' ? 'bg-emerald-700 text-white' : ''}`}
            onClick={() => setMode('points')}
          >
            Edit Points
          </button>
          <button
            type="button"
            className={`rounded-xl border px-3 py-2 text-sm ${mode === 'polygons' ? 'bg-emerald-700 text-white' : ''}`}
            onClick={() => setMode('polygons')}
          >
            Edit Polygons
          </button>
        </div>

        {mode === 'points' ? (
          <div className="space-y-2">
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {(['tee', 'green-front', 'green-middle', 'green-back'] as PointTarget[]).map((entry) => (
                <button
                  key={entry}
                  type="button"
                  className={`rounded-xl border px-3 py-2 text-sm ${pointTarget === entry ? 'bg-emerald-700 text-white' : ''}`}
                  onClick={() => setPointTargetMode(entry)}
                >
                  {entry}
                </button>
              ))}
            </div>
            {pointTarget === 'tee' ? (
              <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
                <select
                  className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm"
                  value={selectedTeeId}
                  onChange={(event) => setSelectedTeeId(event.target.value)}
                >
                  {orderedDraftTees.length === 0 ? (
                    <option value="">No tees configured</option>
                  ) : (
                    orderedDraftTees.map((tee) => (
                      <option key={tee.id} value={tee.id}>{tee.name}</option>
                    ))
                  )}
                </select>
                {selectedTeeId ? (
                  <div className="flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm">
                    <span
                      className="inline-block h-3.5 w-3.5 rounded-full border border-gray-300"
                      style={{ backgroundColor: getTeeDisplay(orderedDraftTees.find((tee) => tee.id === selectedTeeId) ?? null).color }}
                    />
                    <span className="font-medium">Tee Pin Color</span>
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>
        ) : (
          <div className="space-y-2">
            <div className="grid grid-cols-3 gap-2">
              {(['fairway', 'green', 'hazard'] as PolygonTarget[]).map((entry) => (
                <button
                  key={entry}
                  type="button"
                  className={`rounded-xl border px-3 py-2 text-sm ${polygonTarget === entry ? 'bg-emerald-700 text-white' : ''}`}
                  onClick={() => setPolygonTarget(entry)}
                >
                  {entry}
                </button>
              ))}
            </div>
            {polygonTarget === 'hazard' ? (
              <div className="space-y-2">
                <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
                  <select
                    className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm"
                    value={activeHazardId}
                    onChange={(event) => setActiveHazardId(event.target.value)}
                  >
                    <option value="">Select hazard zone</option>
                    {currentAreas?.hazards.map((hazard) => (
                      <option key={hazard.id} value={hazard.id}>{hazard.name}</option>
                    ))}
                  </select>
                  <div className="flex gap-2">
                    <Input
                      value={newHazardName}
                      onChange={(event) => setNewHazardName(event.target.value)}
                      placeholder="Hazard name"
                    />
                    <Button variant="secondary" onClick={addHazardZone}>Add</Button>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    className={`rounded-xl border px-3 py-2 text-sm ${hazardEditMode === 'add' ? 'bg-emerald-700 text-white' : ''}`}
                    onClick={() => setHazardEditMode('add')}
                  >
                    Add Points
                  </button>
                  <button
                    type="button"
                    className={`rounded-xl border px-3 py-2 text-sm ${hazardEditMode === 'delete' ? 'bg-red-700 text-white' : ''}`}
                    onClick={() => setHazardEditMode('delete')}
                  >
                    Delete Points
                  </button>
                </div>
                <p className="text-xs text-gray-600">
                  {hazardEditMode === 'add'
                    ? 'Tap map to append hazard vertices.'
                    : 'Tap near a hazard vertex to delete it.'}
                </p>
              </div>
            ) : null}
            <div className="flex flex-wrap gap-2">
              <Button variant="secondary" onClick={undoLastPolygonPoint}>Undo Last Vertex</Button>
              <Button variant="secondary" onClick={clearPolygon}>Clear Selected Polygon</Button>
              <p className="self-center text-sm text-gray-600">Vertices: {selectedPolygonPointCount}</p>
            </div>
          </div>
        )}

        <div ref={mapContainerRef} className="h-[68vh] min-h-[430px] overflow-hidden rounded-xl border border-gray-200" />

        <div className="rounded-xl border border-gray-200 bg-gray-50 p-3 text-sm">
          <p className="font-semibold">
            Mode: {mode === 'points' ? `point (${pointTarget})` : `polygon (${polygonTarget})`}
          </p>
          {mode === 'points' ? (
            <p>
              Lat: <strong>{selectedPoint?.lat?.toFixed(7) ?? '-'}</strong> | Lng:{' '}
              <strong>{selectedPoint?.lng?.toFixed(7) ?? '-'}</strong>
            </p>
          ) : (
            <p>Click map to append vertices. Use Undo/Clear for corrections.</p>
          )}
        </div>

        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" onClick={setFromGps}>
            {mode === 'points' ? 'Set Point from GPS' : 'Add Polygon Vertex from GPS'}
          </Button>
          <Button onClick={() => void saveDraftCourse()} disabled={saving || !draftCourse || !selectedCourse}>
            {saving ? 'Saving Draft...' : 'Save Draft'}
          </Button>
          <Button
            variant="secondary"
            onClick={() => void publishDraftCourse()}
            disabled={publishing || !draftCourse || !selectedCourse}
          >
            {publishing ? 'Publishing...' : 'Publish All'}
          </Button>
          <Button
            variant="secondary"
            onClick={() => void publishCurrentHole()}
            disabled={publishingHole || !draftCourse || !selectedCourse || !currentHole}
          >
            {publishingHole ? 'Publishing Hole...' : 'Publish Hole'}
          </Button>
          <Button variant="ghost" onClick={() => void discardDraft()} disabled={!draftExists}>
            Discard Draft
          </Button>
        </div>
      </Card>

      <Card className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <h3 className="font-semibold">Round Feedback</h3>
          <div className="flex items-center gap-2">
            <select
              className="rounded-xl border border-gray-200 px-3 py-2 text-sm"
              value={feedbackCourseFilter}
              onChange={(event) => setFeedbackCourseFilter(event.target.value)}
            >
              <option value="all">All courses</option>
              {courses.map((course) => (
                <option key={course.id} value={course.id}>{course.name}</option>
              ))}
            </select>
            <Button variant="ghost" className="px-2 py-1 text-xs" onClick={() => void refreshRoundFeedback()}>
              Refresh
            </Button>
          </div>
        </div>
        {feedbackLoading ? (
          <p className="text-sm text-gray-600">Loading feedback...</p>
        ) : feedbackEntries.length === 0 ? (
          <p className="text-sm text-gray-600">No feedback yet.</p>
        ) : (
          <div className="max-h-72 space-y-2 overflow-auto rounded-xl border border-gray-200 bg-gray-50 p-2">
            {feedbackEntries.map((entry) => {
              const courseName = courses.find((course) => course.id === entry.courseId)?.name ?? entry.courseId;
              return (
                <div key={entry.id} className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm">
                  <div className="flex items-center justify-between gap-2">
                    <p className="font-semibold text-gray-900">{courseName}</p>
                    <p className="text-xs font-semibold text-emerald-700">Rating: {entry.rating}/5</p>
                  </div>
                  <p className="mt-1 text-gray-700">{entry.note || 'No note provided.'}</p>
                  <p className="mt-1 text-xs text-gray-500">
                    {new Date(entry.timestamp).toLocaleString()} · {entry.email || entry.uid || 'anonymous'} · Round {entry.roundId}
                  </p>
                </div>
              );
            })}
          </div>
        )}
      </Card>

      {qaReport ? (
        <Card className="space-y-2">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold">QA Report</h3>
            <p className="text-xs text-gray-500">{new Date(qaReport.checkedAt).toLocaleString()}</p>
          </div>
          <div className="flex gap-2 text-xs">
            <span className={`rounded-full px-2 py-1 font-semibold ${qaReport.errorCount > 0 ? 'bg-red-100 text-red-700' : 'bg-stone-100 text-stone-600'}`}>
              Errors: {qaReport.errorCount}
            </span>
            <span className={`rounded-full px-2 py-1 font-semibold ${qaReport.warningCount > 0 ? 'bg-amber-100 text-amber-700' : 'bg-stone-100 text-stone-600'}`}>
              Warnings: {qaReport.warningCount}
            </span>
          </div>
          {qaReport.issues.length === 0 ? (
            <p className="text-sm text-emerald-700">All QA checks passed.</p>
          ) : (
            <div className="max-h-56 space-y-1 overflow-auto rounded-xl border border-gray-200 bg-gray-50 p-2 text-sm">
              {qaReport.issues.map((issue) => (
                <p key={issue.id} className={issue.severity === 'error' ? 'text-red-700' : 'text-amber-700'}>
                  Hole {issue.holeNumber}: {issue.message}
                </p>
              ))}
            </div>
          )}
        </Card>
      ) : null}

      <Card className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold">Member Approvals</h3>
          <Button variant="ghost" className="px-2 py-1 text-xs" onClick={() => void refreshPendingMembers()}>
            Refresh
          </Button>
        </div>
        {membersLoading ? (
          <p className="text-sm text-gray-600">Loading pending members...</p>
        ) : pendingMembers.length === 0 ? (
          <p className="text-sm text-emerald-700">No pending member approvals.</p>
        ) : (
          <div className="space-y-2">
            {pendingMembers.map((member) => (
              <div
                key={member.uid}
                className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 text-sm"
              >
                <div>
                  <p className="font-medium">{member.displayName || member.email}</p>
                  <p className="text-xs text-gray-600">{member.email}</p>
                </div>
                <Button
                  onClick={() => void approveMember(member.uid)}
                  disabled={approvingUid === member.uid}
                >
                  {approvingUid === member.uid ? 'Approving...' : 'Approve'}
                </Button>
              </div>
            ))}
          </div>
        )}
      </Card>

      <Card className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold">Course Audit Trail</h3>
          <Button
            variant="ghost"
            className="px-2 py-1 text-xs"
            onClick={() => selectedCourseId && void refreshCourseAuditLogs(selectedCourseId)}
            disabled={!selectedCourseId}
          >
            Refresh
          </Button>
        </div>
        {auditLoading ? (
          <p className="text-sm text-gray-600">Loading audit entries...</p>
        ) : courseAuditLogs.length === 0 ? (
          <p className="text-sm text-gray-600">No audit entries for this course yet.</p>
        ) : (
          <div className="max-h-64 space-y-2 overflow-auto rounded-xl border border-gray-200 bg-gray-50 p-2">
            {courseAuditLogs.map((entry) => (
              <div key={entry.id} className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm">
                <p className="font-medium">{auditActionLabel(entry.action)}</p>
                <p className="text-xs text-gray-600">{entry.details}</p>
                <p className="mt-1 text-[11px] text-gray-500">
                  {new Date(entry.timestamp).toLocaleString()} by {entry.adminEmail}
                </p>
              </div>
            ))}
          </div>
        )}
      </Card>
    </section>
  );
}
