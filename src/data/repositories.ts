import { db, type ActiveRound } from './db';
import type { Course, Round, UserProfile, UserSettings } from '../domain/types';
import { demoCourse, valeDaPintaCourse } from './seedCourse';
import { apiClient, type BootstrapResponse } from './apiClient';

const SETTINGS_KEY = 'user-settings' as const;

const defaultSettings: UserSettings = {
  id: SETTINGS_KEY,
  distanceUnit: 'yards',
  tileSourceId: 'esri-world-imagery',
  updatedAt: new Date().toISOString(),
};

const defaultProfile: UserProfile = {
  uid: 'local-user',
  email: '',
  displayName: 'Guest Player',
  role: 'member',
  membershipStatus: 'pending',
  handicapIndex: '',
  homeCourse: '',
  onboardingCompletedAt: '',
  updatedAt: new Date().toISOString(),
};

async function applyBootstrapData(data: BootstrapResponse): Promise<void> {
  await db.transaction(
    'rw',
    [db.courses, db.rounds, db.settings, db.profiles, db.activeRound],
    async () => {
      await db.courses.clear();
      await db.rounds.clear();
      await db.settings.clear();
      await db.profiles.clear();
      await db.activeRound.clear();

      if (data.courses.length > 0) {
        await db.courses.bulkPut(data.courses);
      } else {
        await db.courses.bulkPut([valeDaPintaCourse, demoCourse]);
      }
      if (data.rounds.length > 0) await db.rounds.bulkPut(data.rounds);
      await db.settings.put(data.settings);
      await db.profiles.put(data.profile);

      if (data.activeRoundId) {
        const activeRound: ActiveRound = {
          id: 'active-round',
          roundId: data.activeRoundId,
          updatedAt: new Date().toISOString(),
        };
        await db.activeRound.put(activeRound);
      }
    },
  );
}

export async function ensureSeedData(): Promise<void> {
  const hasCourses = await db.courses.count();
  if (hasCourses === 0) {
    await db.courses.bulkPut([valeDaPintaCourse, demoCourse]);
  }

  const settings = await db.settings.get(SETTINGS_KEY);
  if (!settings) {
    await db.settings.put(defaultSettings);
  }

  const profile = await db.profiles.get(defaultProfile.uid);
  if (!profile) {
    await db.profiles.put(defaultProfile);
  }
}

export async function syncFromRemote(uid: string, email = ''): Promise<void> {
  const data = await apiClient.bootstrap(uid, email);
  await applyBootstrapData(data);
}

export const courseRepository = {
  async list(): Promise<Course[]> {
    return db.courses.orderBy('name').toArray();
  },

  async getById(id: string): Promise<Course | undefined> {
    return db.courses.get(id);
  },

  async upsert(course: Course): Promise<string> {
    await db.courses.put(course);
    return course.id;
  },

  async remove(id: string): Promise<void> {
    await db.courses.delete(id);
  },
};

export const roundRepository = {
  async list(): Promise<Round[]> {
    return db.rounds.orderBy('startedAt').reverse().toArray();
  },

  async getById(id: string): Promise<Round | undefined> {
    return db.rounds.get(id);
  },

  async save(round: Round): Promise<string> {
    await db.rounds.put(round);
    return round.id;
  },

  async remove(roundId: string): Promise<void> {
    await db.rounds.delete(roundId);
    const state = await db.activeRound.get('active-round');
    if (state?.roundId === roundId) {
      await db.activeRound.delete('active-round');
    }
  },

  async setActiveRound(roundId: string): Promise<void> {
    const activeRound: ActiveRound = {
      id: 'active-round',
      roundId,
      updatedAt: new Date().toISOString(),
    };
    await db.activeRound.put(activeRound);
  },

  async getActiveRound(): Promise<Round | undefined> {
    const state = await db.activeRound.get('active-round');
    return state?.roundId ? db.rounds.get(state.roundId) : undefined;
  },

  async clearActiveRound(): Promise<void> {
    await db.activeRound.delete('active-round');
  },
};

export const settingsRepository = {
  async get(): Promise<UserSettings> {
    const settings = await db.settings.get(SETTINGS_KEY);
    if (settings) return settings;
    await db.settings.put(defaultSettings);
    return defaultSettings;
  },

  async update(patch: Partial<Omit<UserSettings, 'id'>>): Promise<UserSettings> {
    const existing = await this.get();
    const updated: UserSettings = {
      ...existing,
      ...patch,
      id: SETTINGS_KEY,
      updatedAt: new Date().toISOString(),
    };
    await db.settings.put(updated);
    return updated;
  },
};

export const profileRepository = {
  async get(): Promise<UserProfile> {
    const firstProfile = await db.profiles.toCollection().first();
    if (firstProfile) return firstProfile;
    await db.profiles.put(defaultProfile);
    return defaultProfile;
  },

  async save(profile: UserProfile): Promise<UserProfile> {
    const updated = { ...profile, updatedAt: new Date().toISOString() };
    await db.profiles.put(updated);
    return updated;
  },
};
