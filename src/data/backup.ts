import type { Course, Round } from '../domain/types';

export const BACKUP_SCHEMA = 'greencaddie-backup';
export const BACKUP_VERSION = 1;

export type BackupImportMode = 'merge' | 'replace';

export interface AppBackupV1 {
  schema: typeof BACKUP_SCHEMA;
  version: typeof BACKUP_VERSION;
  exportedAt: string;
  appVersion: string;
  data: {
    courses: Course[];
    rounds: Round[];
  };
}

export interface BackupPreview {
  schema: string;
  version: number;
  exportedAt: string;
  appVersion: string;
  courses: number;
  rounds: number;
}

export interface ParsedBackup {
  payload: AppBackupV1;
  preview: BackupPreview;
  warnings: string[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function parseDateMillis(value: unknown): number {
  if (typeof value !== 'string' || value.trim().length === 0) return NaN;
  return Date.parse(value);
}

function assertValidDate(value: unknown, field: string): void {
  const timestamp = parseDateMillis(value);
  if (!Number.isFinite(timestamp)) {
    throw new Error(`Invalid date in ${field}.`);
  }
}

function courseSortTimestamp(course: Course): number {
  const updated = Date.parse(course.updatedAt ?? '');
  if (Number.isFinite(updated)) return updated;
  const created = Date.parse(course.createdAt ?? '');
  if (Number.isFinite(created)) return created;
  return 0;
}

function roundSortTimestamp(round: Round): number {
  const updated = Date.parse(round.updatedAt ?? '');
  if (Number.isFinite(updated)) return updated;
  const started = Date.parse(round.startedAt ?? '');
  if (Number.isFinite(started)) return started;
  return 0;
}

function dedupeByLatest<T extends { id: string }>(
  entries: T[],
  sortTimestamp: (value: T) => number,
): { values: T[]; removedDuplicates: number } {
  const byId = new Map<string, T>();
  let duplicates = 0;

  entries.forEach((entry) => {
    const previous = byId.get(entry.id);
    if (!previous) {
      byId.set(entry.id, entry);
      return;
    }

    duplicates += 1;
    if (sortTimestamp(entry) >= sortTimestamp(previous)) {
      byId.set(entry.id, entry);
    }
  });

  return {
    values: [...byId.values()],
    removedDuplicates: duplicates,
  };
}

function validateCourse(entry: unknown, index: number): Course {
  if (!isRecord(entry)) throw new Error(`Invalid course at index ${index}.`);
  if (typeof entry.id !== 'string' || !entry.id.trim()) throw new Error(`Invalid course id at index ${index}.`);
  if (typeof entry.name !== 'string' || !entry.name.trim()) throw new Error(`Invalid course name at index ${index}.`);
  if (!Array.isArray(entry.holes)) throw new Error(`Invalid course holes at index ${index}.`);
  if (!Array.isArray(entry.tees)) throw new Error(`Invalid course tees at index ${index}.`);
  assertValidDate(entry.createdAt, `courses[${index}].createdAt`);
  assertValidDate(entry.updatedAt, `courses[${index}].updatedAt`);
  return entry as unknown as Course;
}

function validateRound(entry: unknown, index: number): Round {
  if (!isRecord(entry)) throw new Error(`Invalid round at index ${index}.`);
  if (typeof entry.id !== 'string' || !entry.id.trim()) throw new Error(`Invalid round id at index ${index}.`);
  if (typeof entry.courseId !== 'string' || !entry.courseId.trim()) throw new Error(`Invalid round courseId at index ${index}.`);
  if (!Array.isArray(entry.scores)) throw new Error(`Invalid round scores at index ${index}.`);
  assertValidDate(entry.startedAt, `rounds[${index}].startedAt`);
  if (entry.updatedAt !== undefined && entry.updatedAt !== '') {
    assertValidDate(entry.updatedAt, `rounds[${index}].updatedAt`);
  }
  if (entry.completedAt !== undefined && entry.completedAt !== '') {
    assertValidDate(entry.completedAt, `rounds[${index}].completedAt`);
  }
  return entry as unknown as Round;
}

export function parseBackupText(text: string): ParsedBackup {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text) as unknown;
  } catch {
    throw new Error('Backup file is not valid JSON.');
  }

  if (!isRecord(parsed)) throw new Error('Backup payload is invalid.');
  if (parsed.schema !== BACKUP_SCHEMA) throw new Error('Unknown backup schema.');
  if (parsed.version !== BACKUP_VERSION) throw new Error('Unsupported backup version.');
  assertValidDate(parsed.exportedAt, 'exportedAt');
  if (!isRecord(parsed.data)) throw new Error('Backup data payload is missing.');
  if (!Array.isArray(parsed.data.courses)) throw new Error('Backup courses payload is invalid.');
  if (!Array.isArray(parsed.data.rounds)) throw new Error('Backup rounds payload is invalid.');

  const courses = parsed.data.courses.map((course, index) => validateCourse(course, index));
  const rounds = parsed.data.rounds.map((round, index) => validateRound(round, index));

  const warnings: string[] = [];
  const courseDeduped = dedupeByLatest(courses, courseSortTimestamp);
  if (courseDeduped.removedDuplicates > 0) {
    warnings.push(`Removed ${courseDeduped.removedDuplicates} duplicate course id entries from backup.`);
  }
  const roundDeduped = dedupeByLatest(rounds, roundSortTimestamp);
  if (roundDeduped.removedDuplicates > 0) {
    warnings.push(`Removed ${roundDeduped.removedDuplicates} duplicate round id entries from backup.`);
  }

  const payload: AppBackupV1 = {
    schema: BACKUP_SCHEMA,
    version: BACKUP_VERSION,
    exportedAt: String(parsed.exportedAt),
    appVersion: typeof parsed.appVersion === 'string' ? parsed.appVersion : '',
    data: {
      courses: courseDeduped.values,
      rounds: roundDeduped.values,
    },
  };

  return {
    payload,
    preview: {
      schema: payload.schema,
      version: payload.version,
      exportedAt: payload.exportedAt,
      appVersion: payload.appVersion,
      courses: payload.data.courses.length,
      rounds: payload.data.rounds.length,
    },
    warnings,
  };
}

export function latestCourseTimestamp(course: Course): number {
  return courseSortTimestamp(course);
}

export function latestRoundTimestamp(round: Round): number {
  return roundSortTimestamp(round);
}

export function dedupeCoursesByLatest(courses: Course[]): Course[] {
  return dedupeByLatest(courses, courseSortTimestamp).values;
}

export function dedupeRoundsByLatest(rounds: Round[]): Round[] {
  return dedupeByLatest(rounds, roundSortTimestamp).values;
}
