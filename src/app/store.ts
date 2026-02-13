import { create } from 'zustand';
import type { Course, DistanceUnit, Round, TileSource } from '../domain/types';
import { courseRepository, ensureSeedData, roundRepository, settingsRepository } from '../data';

export type TabKey = 'map' | 'scorecard' | 'history' | 'courses' | 'settings';

export const tileSources: TileSource[] = [
  {
    id: 'osm-standard',
    name: 'OSM Standard',
    urlTemplate: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
    attribution: '© OpenStreetMap contributors',
  },
  {
    id: 'osm-hot',
    name: 'OSM HOT',
    urlTemplate: 'https://a.tile.openstreetmap.fr/hot/{z}/{x}/{y}.png',
    attribution: '© OpenStreetMap contributors, HOT',
  },
];

interface AppState {
  loading: boolean;
  tab: TabKey;
  courses: Course[];
  rounds: Round[];
  activeRound?: Round;
  unit: DistanceUnit;
  tileSourceId: string;
  setTab: (tab: TabKey) => void;
  init: () => Promise<void>;
  refresh: () => Promise<void>;
  saveCourse: (course: Course) => Promise<void>;
  importCourses: (courses: Course[]) => Promise<void>;
  saveRound: (round: Round, setActive?: boolean) => Promise<void>;
  completeRound: (round: Round) => Promise<void>;
  setUnit: (unit: DistanceUnit) => Promise<void>;
  setTileSource: (tileSourceId: string) => Promise<void>;
}

export const useAppStore = create<AppState>((set, get) => ({
  loading: true,
  tab: 'map',
  courses: [],
  rounds: [],
  unit: 'yards',
  tileSourceId: 'osm-standard',
  setTab: (tab) => set({ tab }),
  init: async () => {
    await ensureSeedData();
    await get().refresh();
    set({ loading: false });
  },
  refresh: async () => {
    const [courses, rounds, activeRound, settings] = await Promise.all([
      courseRepository.list(),
      roundRepository.list(),
      roundRepository.getActiveRound(),
      settingsRepository.get(),
    ]);
    set({ courses, rounds, activeRound, unit: settings.distanceUnit, tileSourceId: settings.tileSourceId });
  },
  saveCourse: async (course) => {
    await courseRepository.upsert({ ...course, updatedAt: new Date().toISOString() });
    await get().refresh();
  },
  importCourses: async (courses) => {
    const now = new Date().toISOString();
    await courseRepository.bulkUpsert(
      courses.map((course) => ({ ...course, updatedAt: now })),
    );
    await get().refresh();
  },
  saveRound: async (round, setActive = true) => {
    await roundRepository.save(round);
    if (setActive) await roundRepository.setActiveRound(round.id);
    await get().refresh();
  },
  completeRound: async (round) => {
    await roundRepository.save({ ...round, completedAt: new Date().toISOString() });
    await roundRepository.clearActiveRound();
    await get().refresh();
  },
  setUnit: async (unit) => {
    await settingsRepository.update({ distanceUnit: unit });
    await get().refresh();
  },
  setTileSource: async (tileSourceId) => {
    await settingsRepository.update({ tileSourceId });
    await get().refresh();
  },
}));
