import { create } from 'zustand';
import type {
  Course,
  DistanceUnit,
  Round,
  TileSource,
  UserProfile,
} from '../domain/types';
import {
  ApiConflictError,
  apiClient,
  courseRepository,
  db,
  ensureSeedData,
  profileRepository,
  roundRepository,
  settingsRepository,
  syncFromRemote,
  type LeaderboardEntry,
} from '../data';

export type TabKey = 'map' | 'scorecard' | 'history' | 'courses' | 'settings';
export type SyncState = 'local_only' | 'syncing' | 'synced' | 'conflict';

export const tileSources: TileSource[] = [
  {
    id: 'esri-world-imagery',
    name: 'Esri World Imagery',
    urlTemplate: 'https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    labelOverlayUrlTemplate:
      'https://services.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}',
    attribution: 'Tiles © Esri',
  },
  {
    id: 'osm-hot',
    name: 'OSM HOT',
    urlTemplate: 'https://a.tile.openstreetmap.fr/hot/{z}/{x}/{y}.png',
    attribution: '© OpenStreetMap contributors, HOT',
  },
  {
    id: 'carto-voyager',
    name: 'Carto Voyager',
    urlTemplate: 'https://a.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}.png',
    attribution: '© OpenStreetMap contributors © CARTO',
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
  authUid?: string;
  authEmail?: string;
  syncState: SyncState;
  syncMessage?: string;
  profile: UserProfile | null;
  leaderboard: LeaderboardEntry[];
  setTab: (tab: TabKey) => void;
  init: () => Promise<void>;
  setAuthSession: (uid?: string, email?: string) => Promise<void>;
  refresh: () => Promise<void>;
  refreshLeaderboard: (
    timeframe: 'week' | 'month' | 'all',
    courseId: string,
    role: 'combined' | 'members' | 'visitors',
  ) => Promise<void>;
  saveCourse: (course: Course) => Promise<void>;
  saveRound: (round: Round, setActive?: boolean) => Promise<void>;
  deleteRound: (roundId: string) => Promise<void>;
  completeRound: (round: Round) => Promise<void>;
  setActiveRoundId: (roundId: string | null) => Promise<void>;
  setUnit: (unit: DistanceUnit) => Promise<void>;
  setTileSource: (tileSourceId: string) => Promise<void>;
  saveProfile: (profilePatch: Partial<UserProfile>) => Promise<void>;
}

async function loadLocalState() {
  const [courses, rounds, activeRound, settings, profile] = await Promise.all([
    courseRepository.list(),
    roundRepository.list(),
    roundRepository.getActiveRound(),
    settingsRepository.get(),
    profileRepository.get(),
  ]);

  return {
    courses,
    rounds,
    activeRound,
    unit: settings.distanceUnit,
    tileSourceId: settings.tileSourceId,
    profile,
  };
}

export const useAppStore = create<AppState>((set, get) => ({
  loading: true,
  tab: 'map',
  courses: [],
  rounds: [],
  unit: 'yards',
  tileSourceId: 'esri-world-imagery',
  syncState: 'local_only',
  profile: null,
  leaderboard: [],
  setTab: (tab) => set({ tab }),
  init: async () => {
    await ensureSeedData();
    await get().refresh();
    set({ loading: false });
  },
  setAuthSession: async (uid, email) => {
    set({ loading: true, authUid: uid, authEmail: email, syncState: uid ? 'syncing' : 'local_only', syncMessage: undefined });

    if (uid) {
      try {
        await syncFromRemote(uid, email);
        await get().refreshLeaderboard('week', 'all', 'combined');
        set({ syncState: 'synced', syncMessage: 'Cloud sync complete.' });
      } catch {
        set({ syncState: 'local_only', syncMessage: 'Sync failed. Working locally.' });
      }
    } else {
      await db.rounds.clear();
      await db.activeRound.clear();
      await db.profiles.clear();
      await ensureSeedData();
      set({ leaderboard: [], syncState: 'local_only', syncMessage: undefined });
    }

    await get().refresh();
    set({ loading: false });
  },
  refresh: async () => {
    const state = await loadLocalState();
    set(state);
  },
  refreshLeaderboard: async (timeframe, courseId, role) => {
    const { authUid } = get();
    if (!authUid) {
      const rounds = await roundRepository.list();
      if (rounds.length === 0) {
        set({ leaderboard: [] });
        return;
      }

      const totals = rounds.map((round) =>
        round.scores.reduce((acc, score) => acc + score.strokes, 0),
      );

      set({
        leaderboard: [
          {
            uid: 'local-user',
            displayName: 'Guest Player',
            role: 'member',
            rounds: rounds.length,
            bestScore: Math.min(...totals),
            averageScore: totals.reduce((acc, score) => acc + score, 0) / totals.length,
            position: 1,
          },
        ],
      });
      return;
    }

    const leaderboard = await apiClient.leaderboard(timeframe, courseId, role);
    set({ leaderboard });
  },
  saveCourse: async (course) => {
    const nextCourse = { ...course, updatedAt: new Date().toISOString() };
    await courseRepository.upsert(nextCourse);

    const { authUid } = get();
    if (authUid) {
      set({ syncState: 'syncing', syncMessage: 'Syncing course changes...' });
      try {
        await apiClient.upsertCourse(authUid, nextCourse);
        set({ syncState: 'synced', syncMessage: 'Course synced.' });
      } catch {
        set({ syncState: 'local_only', syncMessage: 'Course saved locally; cloud sync failed.' });
      }
    }

    await get().refresh();
  },
  saveRound: async (round, setActive = true) => {
    const nextRound: Round = { ...round, updatedAt: new Date().toISOString() };
    await roundRepository.save(nextRound);
    if (setActive) await roundRepository.setActiveRound(nextRound.id);

    const { authUid, authEmail } = get();
    if (authUid) {
      set({ syncState: 'syncing', syncMessage: 'Syncing round...' });
      try {
        await apiClient.upsertRound(authUid, nextRound);
        if (setActive) {
          await apiClient.setActiveRound(authUid, nextRound.id);
        }
        set({ syncState: 'synced', syncMessage: 'Round synced.' });
      } catch (error) {
        if (error instanceof ApiConflictError || (error as { name?: string })?.name === 'ApiConflictError') {
          const conflictCopy: Round = {
            ...nextRound,
            id: crypto.randomUUID(),
            startedAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          };
          await roundRepository.save(conflictCopy);
          try {
            await apiClient.upsertRound(authUid, conflictCopy);
            await syncFromRemote(authUid, authEmail ?? '');
          } catch {
            // keep local conflict copy if cloud save fails
          }
          set({
            syncState: 'conflict',
            syncMessage: 'Round conflict detected. Preserved local edit as a new round.',
          });
        } else {
          set({ syncState: 'local_only', syncMessage: 'Round saved locally; cloud sync failed.' });
        }
      }
    }

    await get().refresh();
  },
  deleteRound: async (roundId) => {
    await roundRepository.remove(roundId);

    const { authUid } = get();
    if (authUid) {
      set({ syncState: 'syncing', syncMessage: 'Syncing round deletion...' });
      try {
        await apiClient.deleteRound(authUid, roundId);
        set({ syncState: 'synced', syncMessage: 'Round deletion synced.' });
      } catch {
        set({ syncState: 'local_only', syncMessage: 'Round deleted locally; cloud sync failed.' });
      }
    }

    await get().refresh();
    await get().refreshLeaderboard('week', 'all', 'combined');
  },
  completeRound: async (round) => {
    const completedRound = { ...round, completedAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
    await roundRepository.save(completedRound);
    await roundRepository.clearActiveRound();

    const { authUid } = get();
    if (authUid) {
      set({ syncState: 'syncing', syncMessage: 'Syncing completed round...' });
      try {
        await apiClient.upsertRound(authUid, completedRound);
        await apiClient.setActiveRound(authUid, null);
        set({ syncState: 'synced', syncMessage: 'Completed round synced.' });
      } catch {
        set({ syncState: 'local_only', syncMessage: 'Round completed locally; cloud sync failed.' });
      }
    }

    await get().refresh();
    await get().refreshLeaderboard('week', 'all', 'combined');
  },
  setActiveRoundId: async (roundId) => {
    if (roundId) {
      await roundRepository.setActiveRound(roundId);
    } else {
      await roundRepository.clearActiveRound();
    }

    const { authUid } = get();
    if (authUid) {
      set({ syncState: 'syncing' });
      try {
        await apiClient.setActiveRound(authUid, roundId);
        set({ syncState: 'synced', syncMessage: 'Active round synced.' });
      } catch {
        set({ syncState: 'local_only', syncMessage: 'Active round updated locally; cloud sync failed.' });
      }
    }

    await get().refresh();
  },
  setUnit: async (unit) => {
    const settings = await settingsRepository.update({ distanceUnit: unit });

    const { authUid } = get();
    if (authUid) {
      set({ syncState: 'syncing' });
      try {
        await apiClient.saveSettings(authUid, settings);
        set({ syncState: 'synced', syncMessage: 'Settings synced.' });
      } catch {
        set({ syncState: 'local_only', syncMessage: 'Settings saved locally; cloud sync failed.' });
      }
    }

    await get().refresh();
  },
  setTileSource: async (tileSourceId) => {
    const settings = await settingsRepository.update({ tileSourceId });

    const { authUid } = get();
    if (authUid) {
      set({ syncState: 'syncing' });
      try {
        await apiClient.saveSettings(authUid, settings);
        set({ syncState: 'synced', syncMessage: 'Map settings synced.' });
      } catch {
        set({ syncState: 'local_only', syncMessage: 'Map settings saved locally; cloud sync failed.' });
      }
    }

    await get().refresh();
  },
  saveProfile: async (profilePatch) => {
    const existing = await profileRepository.get();
    const updatedProfile: UserProfile = {
      ...existing,
      ...profilePatch,
      uid: get().authUid ?? existing.uid,
      email: get().authEmail ?? existing.email,
      updatedAt: new Date().toISOString(),
    };

    await profileRepository.save(updatedProfile);

    const { authUid } = get();
    if (authUid) {
      set({ syncState: 'syncing' });
      try {
        await apiClient.saveProfile(authUid, updatedProfile);
        set({ syncState: 'synced', syncMessage: 'Profile synced.' });
      } catch {
        set({ syncState: 'local_only', syncMessage: 'Profile saved locally; cloud sync failed.' });
      }
    }

    await get().refresh();
    await get().refreshLeaderboard('week', 'all', 'combined');
  },
}));
