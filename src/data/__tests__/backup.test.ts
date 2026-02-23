import { describe, expect, test } from 'vitest';
import {
  BACKUP_SCHEMA,
  BACKUP_VERSION,
  parseBackupText,
} from '../backup';

function createBaseBackup() {
  return {
    schema: BACKUP_SCHEMA,
    version: BACKUP_VERSION,
    exportedAt: '2026-02-21T00:00:00.000Z',
    appVersion: '0.2.0',
    data: {
      courses: [
        {
          id: 'course-1',
          name: 'Test Course',
          holes: [],
          tees: [],
          createdAt: '2026-02-20T00:00:00.000Z',
          updatedAt: '2026-02-20T10:00:00.000Z',
        },
      ],
      rounds: [
        {
          id: 'round-1',
          courseId: 'course-1',
          startedAt: '2026-02-21T08:00:00.000Z',
          stablefordEnabled: false,
          scores: [],
          updatedAt: '2026-02-21T10:00:00.000Z',
        },
      ],
    },
  };
}

describe('backup parser', () => {
  test('parses valid backup and builds preview', () => {
    const input = createBaseBackup();
    const parsed = parseBackupText(JSON.stringify(input));

    expect(parsed.preview.schema).toBe(BACKUP_SCHEMA);
    expect(parsed.preview.version).toBe(BACKUP_VERSION);
    expect(parsed.preview.courses).toBe(1);
    expect(parsed.preview.rounds).toBe(1);
    expect(parsed.warnings).toEqual([]);
  });

  test('throws when schema is invalid', () => {
    const input = createBaseBackup();
    input.schema = 'wrong-schema';

    expect(() => parseBackupText(JSON.stringify(input))).toThrowError('Unknown backup schema.');
  });

  test('deduplicates ids and keeps latest entries', () => {
    const input = createBaseBackup();
    input.data.courses.push({
      ...input.data.courses[0],
      name: 'Updated Course',
      updatedAt: '2026-02-21T12:00:00.000Z',
    });
    input.data.rounds.push({
      ...input.data.rounds[0],
      stablefordEnabled: true,
      updatedAt: '2026-02-21T12:00:00.000Z',
    });

    const parsed = parseBackupText(JSON.stringify(input));
    expect(parsed.payload.data.courses).toHaveLength(1);
    expect(parsed.payload.data.courses[0]?.name).toBe('Updated Course');
    expect(parsed.payload.data.rounds).toHaveLength(1);
    expect(parsed.payload.data.rounds[0]?.stablefordEnabled).toBe(true);
    expect(parsed.warnings.length).toBe(2);
  });
});
