import { db, type ActiveRound } from './db';
import type { Course, Round, UserSettings } from '../domain/types';
import { demoCourse } from './seedCourse';

const SETTINGS_KEY = 'user-settings' as const;

const defaultSettings: UserSettings = {
  id: SETTINGS_KEY,
  distanceUnit: 'yards',
  tileSourceId: 'osm-standard',
  updatedAt: new Date().toISOString(),
};

export async function ensureSeedData(): Promise<void> {
  const hasCourses = await db.courses.count();
  if (hasCourses === 0) {
    await db.courses.add(demoCourse);
  }

  const settings = await db.settings.get(SETTINGS_KEY);
  if (!settings) {
    await db.settings.put(defaultSettings);
  }
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
