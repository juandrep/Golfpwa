import type { Course, Round, UserProfile, UserSettings } from '../domain/types';

const API_BASE = import.meta.env.VITE_API_BASE_URL || '/api';

type LeaderboardRole = 'combined' | 'members' | 'visitors';

type LeaderboardTimeframe = 'week' | 'month' | 'all';

type MembershipStatusFilter = 'pending' | 'approved' | 'all';

export interface LeaderboardEntry {
  uid: string;
  displayName: string;
  role: 'member' | 'visitor';
  rounds: number;
  bestScore: number;
  averageScore: number;
  position: number;
}

export interface BootstrapResponse {
  uid: string;
  email: string;
  profile: UserProfile;
  settings: UserSettings;
  courses: Course[];
  rounds: Round[];
  activeRoundId: string | null;
}

export interface AdminMember {
  uid: string;
  email: string;
  displayName: string;
  role: 'member' | 'visitor';
  membershipStatus: 'pending' | 'approved';
  updatedAt: string;
}

export interface CourseAuditLogEntry {
  id: string;
  courseId: string;
  action: string;
  details: string;
  adminEmail: string;
  timestamp: string;
}

export interface AnalyticsEventPayload {
  eventName: string;
  stage?: string;
  uid?: string;
  email?: string;
  meta?: Record<string, unknown>;
}

export interface RoundFeedbackPayload {
  uid?: string;
  email?: string;
  roundId: string;
  courseId: string;
  rating: number;
  note?: string;
}

export interface RoundFeedbackEntry {
  id: string;
  uid: string;
  email: string;
  roundId: string;
  courseId: string;
  rating: number;
  note: string;
  timestamp: string;
}

export class ApiConflictError extends Error {
  serverRound: Round;

  constructor(serverRound: Round, message = 'Conflict detected while syncing round.') {
    super(message);
    this.name = 'ApiConflictError';
    this.serverRound = serverRound;
  }
}

async function parseJson<T>(response: Response): Promise<T> {
  if (!response.ok) {
    throw new Error(`API error: ${response.status}`);
  }
  return response.json() as Promise<T>;
}

export const apiClient = {
  async bootstrap(uid: string, email = ''): Promise<BootstrapResponse> {
    const response = await fetch(
      `${API_BASE}/users/${uid}/bootstrap?email=${encodeURIComponent(email)}`,
    );
    return parseJson<BootstrapResponse>(response);
  },

  async saveProfile(uid: string, profile: UserProfile): Promise<BootstrapResponse> {
    const response = await fetch(`${API_BASE}/users/${uid}/profile`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(profile),
    });
    return parseJson<BootstrapResponse>(response);
  },

  async saveSettings(uid: string, settings: UserSettings): Promise<BootstrapResponse> {
    const response = await fetch(`${API_BASE}/users/${uid}/settings`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(settings),
    });
    return parseJson<BootstrapResponse>(response);
  },

  async upsertCourse(uid: string, course: Course): Promise<BootstrapResponse> {
    const response = await fetch(`${API_BASE}/users/${uid}/courses/${course.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(course),
    });
    return parseJson<BootstrapResponse>(response);
  },

  async upsertRound(uid: string, round: Round): Promise<BootstrapResponse> {
    const response = await fetch(`${API_BASE}/users/${uid}/rounds/${round.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(round),
    });
    if (response.status === 409) {
      const payload = (await response.json()) as { error?: string; serverRound?: Round };
      if (payload.serverRound) {
        throw new ApiConflictError(payload.serverRound, payload.error);
      }
      throw new Error(payload.error ?? 'Conflict detected while syncing round.');
    }
    return parseJson<BootstrapResponse>(response);
  },

  async deleteRound(uid: string, roundId: string): Promise<BootstrapResponse> {
    const response = await fetch(`${API_BASE}/users/${uid}/rounds/${roundId}`, {
      method: 'DELETE',
    });
    return parseJson<BootstrapResponse>(response);
  },

  async setActiveRound(uid: string, roundId: string | null): Promise<BootstrapResponse> {
    const response = await fetch(`${API_BASE}/users/${uid}/active-round`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ roundId }),
    });
    return parseJson<BootstrapResponse>(response);
  },

  async leaderboard(
    timeframe: LeaderboardTimeframe,
    courseId: string,
    role: LeaderboardRole,
  ): Promise<LeaderboardEntry[]> {
    const query = new URLSearchParams({ timeframe, courseId, role }).toString();
    const response = await fetch(`${API_BASE}/leaderboard?${query}`);
    const data = await parseJson<{ entries: LeaderboardEntry[] }>(response);
    return data.entries;
  },

  async listMembers(adminEmail: string, status: MembershipStatusFilter = 'pending'): Promise<AdminMember[]> {
    const query = new URLSearchParams({ status }).toString();
    const response = await fetch(`${API_BASE}/admin/members?${query}`, {
      headers: { 'x-admin-email': adminEmail },
    });
    const data = await parseJson<{ members: AdminMember[] }>(response);
    return data.members;
  },

  async setMemberApproval(
    adminEmail: string,
    uid: string,
    status: 'pending' | 'approved',
  ): Promise<AdminMember> {
    const response = await fetch(`${API_BASE}/admin/members/${uid}/approval`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'x-admin-email': adminEmail,
      },
      body: JSON.stringify({ status }),
    });
    const data = await parseJson<{ member: AdminMember }>(response);
    return data.member;
  },

  async listCourseAuditLogs(adminEmail: string, courseId: string, limit = 30): Promise<CourseAuditLogEntry[]> {
    const query = new URLSearchParams({ limit: String(limit) }).toString();
    const response = await fetch(`${API_BASE}/admin/courses/${courseId}/audit?${query}`, {
      headers: { 'x-admin-email': adminEmail },
    });
    const data = await parseJson<{ logs: CourseAuditLogEntry[] }>(response);
    return data.logs;
  },

  async addCourseAuditLog(
    adminEmail: string,
    courseId: string,
    action: string,
    details: string,
  ): Promise<CourseAuditLogEntry> {
    const response = await fetch(`${API_BASE}/admin/courses/${courseId}/audit`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-admin-email': adminEmail,
      },
      body: JSON.stringify({ action, details }),
    });
    const data = await parseJson<{ log: CourseAuditLogEntry }>(response);
    return data.log;
  },

  async trackEvent(payload: AnalyticsEventPayload): Promise<void> {
    const response = await fetch(`${API_BASE}/analytics/event`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    await parseJson<{ ok: boolean }>(response);
  },

  async submitRoundFeedback(payload: RoundFeedbackPayload): Promise<void> {
    const response = await fetch(`${API_BASE}/feedback/round`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    await parseJson<{ ok: boolean }>(response);
  },

  async listRoundFeedback(adminEmail: string, courseId = 'all', limit = 50): Promise<RoundFeedbackEntry[]> {
    const query = new URLSearchParams({
      courseId,
      limit: String(limit),
    }).toString();
    const response = await fetch(`${API_BASE}/admin/feedback/round?${query}`, {
      headers: { 'x-admin-email': adminEmail },
    });
    const data = await parseJson<{ entries: RoundFeedbackEntry[] }>(response);
    return data.entries;
  },
};
