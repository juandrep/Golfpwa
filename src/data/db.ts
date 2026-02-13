import Dexie, { type Table } from 'dexie';
import type { Course, Round, UserSettings } from '../domain/types';

export interface ActiveRound {
  id: string;
  roundId: string;
  updatedAt: string;
}

export class GreenCaddieDB extends Dexie {
  courses!: Table<Course, string>;
  rounds!: Table<Round, string>;
  settings!: Table<UserSettings, 'user-settings'>;
  activeRound!: Table<ActiveRound, string>;

  constructor() {
    super('greenCaddieDb');

    this.version(1).stores({
      courses: 'id, name, updatedAt, isDemo',
      rounds: 'id, courseId, startedAt, completedAt',
      settings: 'id, tileSourceId, updatedAt',
      activeRound: 'id, roundId, updatedAt',
    });
  }
}

export const db = new GreenCaddieDB();
