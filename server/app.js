import cors from 'cors';
import express from 'express';
import { MongoClient } from 'mongodb';
import { verifyFirebaseIdToken } from './firebaseAdmin.js';

const DEFAULT_SETTINGS = {
  id: 'user-settings',
  distanceUnit: 'yards',
  tileSourceId: 'esri-world-imagery',
  updatedAt: new Date().toISOString(),
};

const DEFAULT_PROFILE = (uid, email = '') => ({
  uid,
  email,
  displayName: email.split('@')[0] || 'Guest Player',
  role: 'member',
  membershipStatus: 'pending',
  handicapIndex: '',
  homeCourse: '',
  onboardingCompletedAt: '',
  updatedAt: new Date().toISOString(),
});

const sanitizeUser = (doc, uid, email = '') => ({
  uid,
  email: doc?.email ?? email,
  profile: doc?.profile ?? DEFAULT_PROFILE(uid, email),
  settings: doc?.settings ?? DEFAULT_SETTINGS,
  courses: Array.isArray(doc?.courses) ? doc.courses : [],
  rounds: Array.isArray(doc?.rounds) ? doc.rounds : [],
  activeRoundId: doc?.activeRoundId ?? null,
});

function mapRoundFeedbackEntry(entry) {
  return {
    id: entry.id ?? '',
    uid: entry.uid ?? '',
    email: entry.email ?? '',
    roundId: entry.roundId ?? '',
    courseId: entry.courseId ?? '',
    rating: Number(entry.rating ?? 0),
    note: entry.note ?? '',
    timestamp: entry.timestamp ?? '',
    adminReply: entry.adminReply ?? '',
    adminReplyAt: entry.adminReplyAt ?? '',
    adminReplyBy: entry.adminReplyBy ?? '',
    userReadAt: entry.userReadAt ?? '',
  };
}

let appPromise;

async function createApp() {
  const {
    MONGODB_URI,
    MONGODB_DB = 'greencaddie',
    CLIENT_ORIGIN = 'http://localhost:5173',
    ADMIN_EMAILS = '',
    VITE_ADMIN_EMAILS = '',
  } = process.env;

  if (!MONGODB_URI) {
    throw new Error('Missing MONGODB_URI in environment.');
  }

  const app = express();
  app.use(cors({ origin: CLIENT_ORIGIN }));
  app.use(express.json({ limit: '1mb' }));

  const client = new MongoClient(MONGODB_URI);
  await client.connect();

  const db = client.db(MONGODB_DB);
  const users = db.collection('users');
  const courseAuditLogs = db.collection('course_audit_logs');
  const productEvents = db.collection('product_events');
  const roundFeedback = db.collection('round_feedback');
  const teams = db.collection('teams');
  const teamEvents = db.collection('team_events');

  await users.createIndex({ uid: 1 }, { unique: true });
  await courseAuditLogs.createIndex({ courseId: 1, timestamp: -1 });
  await productEvents.createIndex({ eventName: 1, timestamp: -1 });
  await roundFeedback.createIndex({ timestamp: -1 });
  await roundFeedback.createIndex({ courseId: 1, timestamp: -1 });
  await roundFeedback.createIndex({ uid: 1, timestamp: -1 });
  await teams.createIndex({ id: 1 }, { unique: true });
  await teams.createIndex({ inviteCode: 1 }, { unique: true });
  await teams.createIndex({ 'members.uid': 1 });
  await teamEvents.createIndex({ id: 1 }, { unique: true });
  await teamEvents.createIndex({ teamId: 1, startsAt: -1 });

  const adminEmailAllowlist = new Set(
    String(ADMIN_EMAILS || VITE_ADMIN_EMAILS)
      .split(',')
      .map((entry) => entry.trim().toLowerCase())
      .filter(Boolean),
  );

  async function getOrCreateUser(uid, email = '') {
    const existing = await users.findOne({ uid });
    if (existing) return existing;

    const now = new Date().toISOString();
    const userDoc = {
      uid,
      email,
      profile: DEFAULT_PROFILE(uid, email),
      settings: DEFAULT_SETTINGS,
      courses: [],
      rounds: [],
      activeRoundId: null,
      createdAt: now,
      updatedAt: now,
    };
    await users.insertOne(userDoc);
    return userDoc;
  }

  function mapTeam(team) {
    return {
      id: team.id ?? '',
      name: team.name ?? '',
      inviteCode: team.inviteCode ?? '',
      ownerUid: team.ownerUid ?? '',
      isPrivate: team.isPrivate !== false,
      members: Array.isArray(team.members)
        ? team.members.map((member) => ({
            uid: member.uid ?? '',
            email: member.email ?? '',
            displayName: member.displayName ?? member.email ?? member.uid ?? 'Player',
            joinedAt: member.joinedAt ?? '',
          }))
        : [],
      createdAt: team.createdAt ?? '',
      updatedAt: team.updatedAt ?? '',
    };
  }

  function mapTeamEvent(event) {
    return {
      id: event.id ?? '',
      teamId: event.teamId ?? '',
      name: event.name ?? '',
      format: event.format ?? 'stroke-play',
      startsAt: event.startsAt ?? '',
      endsAt: event.endsAt ?? '',
      createdByUid: event.createdByUid ?? '',
      createdAt: event.createdAt ?? '',
      updatedAt: event.updatedAt ?? '',
    };
  }

  async function generateInviteCode() {
    for (let attempt = 0; attempt < 10; attempt += 1) {
      const code = Math.random().toString(36).slice(2, 8).toUpperCase();
      const exists = await teams.findOne({ inviteCode: code });
      if (!exists) return code;
    }
    return crypto.randomUUID().slice(0, 6).toUpperCase();
  }

  function getAdminEmail(req) {
    const headerEmail = req.headers['x-admin-email'];
    if (typeof headerEmail === 'string') return headerEmail.trim().toLowerCase();
    if (Array.isArray(headerEmail) && headerEmail.length > 0) {
      return String(headerEmail[0]).trim().toLowerCase();
    }
    return String(req.query.adminEmail ?? req.body?.adminEmail ?? '').trim().toLowerCase();
  }

  function getBearerToken(req) {
    const header = req.headers.authorization;
    if (typeof header !== 'string') return '';
    const [scheme, token] = header.split(' ');
    if (!scheme || !token) return '';
    if (scheme.toLowerCase() !== 'bearer') return '';
    return token.trim();
  }

  async function requireAuth(req, res) {
    const idToken = getBearerToken(req);
    if (!idToken) {
      res.status(401).json({ error: 'Missing bearer token.' });
      return null;
    }

    try {
      const decoded = await verifyFirebaseIdToken(idToken);
      return {
        uid: String(decoded.uid ?? '').trim(),
        email: String(decoded.email ?? '').trim().toLowerCase(),
      };
    } catch (_error) {
      res.status(401).json({ error: 'Invalid or expired authentication token.' });
      return null;
    }
  }

  async function ensureAdmin(req, res) {
    const auth = await requireAuth(req, res);
    if (!auth) return null;

    const requestedEmail = getAdminEmail(req);
    if (requestedEmail && requestedEmail !== auth.email) {
      res.status(403).json({ error: 'Admin identity mismatch.' });
      return null;
    }

    const adminEmail = auth.email || requestedEmail;
    if (!adminEmail) {
      res.status(403).json({ error: 'Missing admin identity.' });
      return null;
    }
    if (!adminEmailAllowlist.has(adminEmail)) {
      res.status(403).json({ error: 'Admin access denied.' });
      return null;
    }
    return adminEmail;
  }

  async function ensureUserAuth(req, res, uid) {
    const auth = await requireAuth(req, res);
    if (!auth) return null;
    if (auth.uid !== uid) {
      res.status(403).json({ error: 'User identity mismatch.' });
      return null;
    }
    return auth;
  }

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true });
  });

  app.get('/api/users/:uid/bootstrap', async (req, res) => {
    try {
      const { uid } = req.params;
      const auth = await ensureUserAuth(req, res, uid);
      if (!auth) return;
      const email = auth.email || String(req.query.email ?? '');
      const doc = await getOrCreateUser(uid, email);
      res.json(sanitizeUser(doc, uid, email));
    } catch (_error) {
      res.status(500).json({ error: 'Failed to load user data.' });
    }
  });

  app.put('/api/users/:uid/profile', async (req, res) => {
    try {
      const { uid } = req.params;
      const auth = await ensureUserAuth(req, res, uid);
      if (!auth) return;
      const profile = req.body;
      await users.updateOne(
        { uid },
        {
          $set: {
            email: auth.email || String(profile?.email ?? ''),
            profile: {
              ...profile,
              uid,
              email: auth.email || String(profile?.email ?? ''),
              updatedAt: new Date().toISOString(),
            },
            updatedAt: new Date().toISOString(),
          },
          $setOnInsert: { createdAt: new Date().toISOString(), rounds: [], courses: [] },
        },
        { upsert: true },
      );
      const updated = await users.findOne({ uid });
      res.json(sanitizeUser(updated, uid, auth.email));
    } catch (_error) {
      res.status(500).json({ error: 'Failed to update profile.' });
    }
  });

  app.put('/api/users/:uid/settings', async (req, res) => {
    try {
      const { uid } = req.params;
      const auth = await ensureUserAuth(req, res, uid);
      if (!auth) return;
      const settings = req.body;
      await users.updateOne(
        { uid },
        {
          $set: {
            settings: { ...settings, id: 'user-settings', updatedAt: new Date().toISOString() },
            ...(auth.email ? { email: auth.email } : {}),
            updatedAt: new Date().toISOString(),
          },
          $setOnInsert: { createdAt: new Date().toISOString(), rounds: [], courses: [] },
        },
        { upsert: true },
      );
      const updated = await users.findOne({ uid });
      res.json(sanitizeUser(updated, uid, auth.email));
    } catch (_error) {
      res.status(500).json({ error: 'Failed to update settings.' });
    }
  });

  app.put('/api/users/:uid/courses/:courseId', async (req, res) => {
    try {
      const { uid, courseId } = req.params;
      if (!await ensureUserAuth(req, res, uid)) return;
      const course = req.body;
      const doc = await getOrCreateUser(uid);
      const nextCourses = (doc.courses ?? []).filter((entry) => entry.id !== courseId);
      nextCourses.push(course);

      await users.updateOne(
        { uid },
        { $set: { courses: nextCourses, updatedAt: new Date().toISOString() } },
      );

      const updated = await users.findOne({ uid });
      res.json(sanitizeUser(updated, uid));
    } catch (_error) {
      res.status(500).json({ error: 'Failed to upsert course.' });
    }
  });

  app.delete('/api/users/:uid/courses/:courseId', async (req, res) => {
    try {
      const { uid, courseId } = req.params;
      if (!await ensureUserAuth(req, res, uid)) return;
      const doc = await getOrCreateUser(uid);
      const nextCourses = (doc.courses ?? []).filter((entry) => entry.id !== courseId);

      await users.updateOne(
        { uid },
        { $set: { courses: nextCourses, updatedAt: new Date().toISOString() } },
      );

      const updated = await users.findOne({ uid });
      res.json(sanitizeUser(updated, uid));
    } catch (_error) {
      res.status(500).json({ error: 'Failed to remove course.' });
    }
  });

  app.put('/api/users/:uid/rounds/:roundId', async (req, res) => {
    try {
      const { uid, roundId } = req.params;
      if (!await ensureUserAuth(req, res, uid)) return;
      const round = req.body;
      const doc = await getOrCreateUser(uid);
      const existingRound = (doc.rounds ?? []).find((entry) => entry.id === roundId);
      if (existingRound) {
        const existingUpdatedAt = Date.parse(existingRound.updatedAt ?? existingRound.startedAt ?? '');
        const incomingUpdatedAt = Date.parse(round.updatedAt ?? round.startedAt ?? '');
        if (
          Number.isFinite(existingUpdatedAt) &&
          Number.isFinite(incomingUpdatedAt) &&
          existingUpdatedAt > incomingUpdatedAt
        ) {
          res.status(409).json({
            error: 'Round conflict detected.',
            serverRound: existingRound,
          });
          return;
        }
      }

      const nextRounds = (doc.rounds ?? []).filter((entry) => entry.id !== roundId);
      nextRounds.push(round);

      await users.updateOne(
        { uid },
        { $set: { rounds: nextRounds, updatedAt: new Date().toISOString() } },
      );

      const updated = await users.findOne({ uid });
      res.json(sanitizeUser(updated, uid));
    } catch (_error) {
      res.status(500).json({ error: 'Failed to upsert round.' });
    }
  });

  app.delete('/api/users/:uid/rounds/:roundId', async (req, res) => {
    try {
      const { uid, roundId } = req.params;
      if (!await ensureUserAuth(req, res, uid)) return;
      const doc = await getOrCreateUser(uid);
      const nextRounds = (doc.rounds ?? []).filter((entry) => entry.id !== roundId);
      const nextActiveRoundId = doc.activeRoundId === roundId ? null : doc.activeRoundId;

      await users.updateOne(
        { uid },
        {
          $set: {
            rounds: nextRounds,
            activeRoundId: nextActiveRoundId,
            updatedAt: new Date().toISOString(),
          },
        },
      );

      const updated = await users.findOne({ uid });
      res.json(sanitizeUser(updated, uid));
    } catch (_error) {
      res.status(500).json({ error: 'Failed to delete round.' });
    }
  });

  app.put('/api/users/:uid/active-round', async (req, res) => {
    try {
      const { uid } = req.params;
      if (!await ensureUserAuth(req, res, uid)) return;
      const { roundId } = req.body;
      await users.updateOne(
        { uid },
        {
          $set: {
            activeRoundId: roundId ?? null,
            updatedAt: new Date().toISOString(),
          },
          $setOnInsert: { createdAt: new Date().toISOString(), rounds: [], courses: [] },
        },
        { upsert: true },
      );
      const updated = await users.findOne({ uid });
      res.json(sanitizeUser(updated, uid));
    } catch (_error) {
      res.status(500).json({ error: 'Failed to update active round.' });
    }
  });

  app.get('/api/leaderboard', async (req, res) => {
    try {
      const timeframe = String(req.query.timeframe ?? 'all');
      const courseId = String(req.query.courseId ?? 'all');
      const role = String(req.query.role ?? 'combined');

      const now = new Date();
      const startDate =
        timeframe === 'week'
          ? new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
          : timeframe === 'month'
            ? new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)
            : null;

      const docs = await users.find({}).toArray();
      const leaderboard = docs
        .map((doc) => {
          const profile = doc.profile ?? DEFAULT_PROFILE(doc.uid, doc.email);
          if (role !== 'combined' && profile.role !== role.slice(0, -1)) {
            return null;
          }

          let rounds = Array.isArray(doc.rounds) ? doc.rounds : [];
          rounds = rounds.filter((round) => {
            if (courseId !== 'all' && round.courseId !== courseId) return false;
            if (!startDate) return true;
            return new Date(round.startedAt) >= startDate;
          });

          if (rounds.length === 0) return null;

          const totals = rounds.map((round) =>
            round.scores.reduce((acc, score) => acc + score.strokes, 0),
          );

          const bestScore = Math.min(...totals);
          const averageScore = totals.reduce((acc, total) => acc + total, 0) / totals.length;

          return {
            uid: doc.uid,
            displayName: profile.displayName || doc.email || 'Player',
            role: profile.role,
            rounds: rounds.length,
            bestScore,
            averageScore,
          };
        })
        .filter(Boolean)
        .sort((a, b) => a.bestScore - b.bestScore)
        .map((entry, index) => ({ ...entry, position: index + 1 }));

      res.json({ entries: leaderboard });
    } catch (_error) {
      res.status(500).json({ error: 'Failed to load leaderboard.' });
    }
  });

  app.get('/api/users/:uid/teams', async (req, res) => {
    try {
      const { uid } = req.params;
      if (!await ensureUserAuth(req, res, uid)) return;
      const docs = await teams.find({ 'members.uid': uid }).sort({ updatedAt: -1 }).toArray();
      res.json({ teams: docs.map(mapTeam) });
    } catch (_error) {
      res.status(500).json({ error: 'Failed to load teams.' });
    }
  });

  app.post('/api/teams', async (req, res) => {
    try {
      const uid = String(req.body?.uid ?? '').trim();
      const name = String(req.body?.name ?? '').trim().slice(0, 120);
      if (!uid || !name) {
        res.status(400).json({ error: 'uid and name are required.' });
        return;
      }
      if (!await ensureUserAuth(req, res, uid)) return;
      await getOrCreateUser(uid, String(req.body?.email ?? ''));

      const createdAt = new Date().toISOString();
      const team = {
        id: crypto.randomUUID(),
        name,
        inviteCode: await generateInviteCode(),
        ownerUid: uid,
        isPrivate: true,
        members: [
          {
            uid,
            email: String(req.body?.email ?? ''),
            displayName: String(req.body?.displayName ?? '') || String(req.body?.email ?? '') || uid,
            joinedAt: createdAt,
          },
        ],
        createdAt,
        updatedAt: createdAt,
      };
      await teams.insertOne(team);
      res.json({ team: mapTeam(team) });
    } catch (_error) {
      res.status(500).json({ error: 'Failed to create team.' });
    }
  });

  app.post('/api/teams/join', async (req, res) => {
    try {
      const uid = String(req.body?.uid ?? '').trim();
      const inviteCode = String(req.body?.inviteCode ?? '').trim().toUpperCase();
      if (!uid || !inviteCode) {
        res.status(400).json({ error: 'uid and inviteCode are required.' });
        return;
      }
      if (!await ensureUserAuth(req, res, uid)) return;
      await getOrCreateUser(uid, String(req.body?.email ?? ''));

      const existing = await teams.findOne({ inviteCode });
      if (!existing) {
        res.status(404).json({ error: 'Team invite not found.' });
        return;
      }

      const alreadyMember = Array.isArray(existing.members) && existing.members.some((member) => member.uid === uid);
      if (!alreadyMember) {
        await teams.updateOne(
          { id: existing.id },
          {
            $set: { updatedAt: new Date().toISOString() },
            $push: {
              members: {
                uid,
                email: String(req.body?.email ?? ''),
                displayName: String(req.body?.displayName ?? '') || String(req.body?.email ?? '') || uid,
                joinedAt: new Date().toISOString(),
              },
            },
          },
        );
      }

      const updated = await teams.findOne({ id: existing.id });
      res.json({ team: mapTeam(updated ?? existing) });
    } catch (_error) {
      res.status(500).json({ error: 'Failed to join team.' });
    }
  });

  app.get('/api/teams/:teamId/events', async (req, res) => {
    try {
      const { teamId } = req.params;
      const auth = await requireAuth(req, res);
      if (!auth) return;
      const uid = auth.uid;
      const membership = await teams.findOne({ id: teamId, 'members.uid': uid });
      if (!membership) {
        res.status(403).json({ error: 'Team access denied.' });
        return;
      }
      const docs = await teamEvents.find({ teamId }).sort({ startsAt: -1 }).toArray();
      res.json({ events: docs.map(mapTeamEvent) });
    } catch (_error) {
      res.status(500).json({ error: 'Failed to load team events.' });
    }
  });

  app.post('/api/teams/:teamId/events', async (req, res) => {
    try {
      const { teamId } = req.params;
      const uid = String(req.body?.uid ?? '').trim();
      const name = String(req.body?.name ?? '').trim().slice(0, 120);
      const format = String(req.body?.format ?? 'stroke-play').trim();
      const startsAt = String(req.body?.startsAt ?? '').trim();
      const endsAt = String(req.body?.endsAt ?? '').trim();
      if (!uid || !name || !startsAt || !endsAt) {
        res.status(400).json({ error: 'uid, name, startsAt, and endsAt are required.' });
        return;
      }
      if (!['stroke-play', 'stableford', 'match-play', 'scramble'].includes(format)) {
        res.status(400).json({ error: 'Invalid event format.' });
        return;
      }
      if (!await ensureUserAuth(req, res, uid)) return;

      const team = await teams.findOne({ id: teamId, 'members.uid': uid });
      if (!team) {
        res.status(403).json({ error: 'Only team members can create events.' });
        return;
      }

      const now = new Date().toISOString();
      const event = {
        id: crypto.randomUUID(),
        teamId,
        name,
        format,
        startsAt,
        endsAt,
        createdByUid: uid,
        createdAt: now,
        updatedAt: now,
      };
      await teamEvents.insertOne(event);
      res.json({ event: mapTeamEvent(event) });
    } catch (_error) {
      res.status(500).json({ error: 'Failed to create team event.' });
    }
  });

  app.get('/api/team-events/:eventId/leaderboard', async (req, res) => {
    try {
      const { eventId } = req.params;
      const auth = await requireAuth(req, res);
      if (!auth) return;
      const uid = auth.uid;
      const event = await teamEvents.findOne({ id: eventId });
      if (!event) {
        res.status(404).json({ error: 'Team event not found.' });
        return;
      }

      const team = await teams.findOne({ id: event.teamId });
      if (!team || !Array.isArray(team.members) || team.members.length === 0) {
        res.json({ entries: [] });
        return;
      }
      if (!team.members.some((member) => member.uid === uid)) {
        res.status(403).json({ error: 'Team event access denied.' });
        return;
      }

      const memberUids = team.members.map((member) => member.uid).filter(Boolean);
      const docs = await users.find({ uid: { $in: memberUids } }).toArray();

      const entries = docs
        .map((doc) => {
          const rounds = (Array.isArray(doc.rounds) ? doc.rounds : []).filter((round) => round.teamEventId === eventId);

          if (rounds.length === 0) return null;
          const totals = rounds.map((round) =>
            (Array.isArray(round.scores) ? round.scores : []).reduce(
              (sum, score) => sum + Number(score.strokes ?? 0),
              0,
            ),
          );
          const eventFormat = String(event.format ?? 'stroke-play');
          const allUserCourses = Array.isArray(doc.courses) ? doc.courses : [];
          const scoreToParList = rounds.map((round) => {
            const course = allUserCourses.find((entry) => entry.id === round.courseId);
            const parsByHole = new Map(
              (Array.isArray(course?.holes) ? course.holes : []).map((hole) => [Number(hole.number), Number(hole.par ?? 0)]),
            );
            const totalPar = (Array.isArray(round.scores) ? round.scores : []).reduce((sum, score) => {
              return sum + Number(parsByHole.get(Number(score.holeNumber)) ?? 0);
            }, 0);
            const totalStrokes = (Array.isArray(round.scores) ? round.scores : []).reduce(
              (sum, score) => sum + Number(score.strokes ?? 0),
              0,
            );
            return totalStrokes - totalPar;
          });

          const stablefordPointsTotals = rounds.map((round) => {
            const course = allUserCourses.find((entry) => entry.id === round.courseId);
            const parsByHole = new Map(
              (Array.isArray(course?.holes) ? course.holes : []).map((hole) => [Number(hole.number), Number(hole.par ?? 4)]),
            );
            return (Array.isArray(round.scores) ? round.scores : []).reduce((sum, score) => {
              const par = Number(parsByHole.get(Number(score.holeNumber)) ?? 4);
              const strokes = Number(score.strokes ?? par);
              const delta = strokes - par;
              if (delta <= -3) return sum + 5;
              if (delta === -2) return sum + 4;
              if (delta === -1) return sum + 3;
              if (delta === 0) return sum + 2;
              if (delta === 1) return sum + 1;
              return sum;
            }, 0);
          });

          let bestScore = 0;
          let averageScore = 0;
          if (eventFormat === 'stableford') {
            bestScore = Math.max(...stablefordPointsTotals);
            averageScore = stablefordPointsTotals.reduce((sum, total) => sum + total, 0) / stablefordPointsTotals.length;
          } else if (eventFormat === 'match-play') {
            bestScore = Math.min(...scoreToParList);
            averageScore = scoreToParList.reduce((sum, total) => sum + total, 0) / scoreToParList.length;
          } else {
            bestScore = Math.min(...totals);
            averageScore = totals.reduce((sum, total) => sum + total, 0) / totals.length;
          }
          return {
            uid: doc.uid,
            displayName:
              doc.profile?.displayName
              || team.members.find((member) => member.uid === doc.uid)?.displayName
              || doc.email
              || 'Player',
            rounds: rounds.length,
            bestScore,
            averageScore,
            sortMetric: bestScore,
          };
        })
        .filter(Boolean)
        .sort((a, b) => {
          const eventFormat = String(event.format ?? 'stroke-play');
          if (eventFormat === 'stableford') return b.sortMetric - a.sortMetric;
          return a.sortMetric - b.sortMetric;
        })
        .map((entry, index) => ({ ...entry, position: index + 1 }))
        .map(({ sortMetric, ...entry }) => entry);

      res.json({ entries, event: mapTeamEvent(event), team: mapTeam(team) });
    } catch (_error) {
      res.status(500).json({ error: 'Failed to load team event leaderboard.' });
    }
  });

  app.get('/api/admin/members', async (req, res) => {
    try {
      const adminEmail = await ensureAdmin(req, res);
      if (!adminEmail) return;

      const status = String(req.query.status ?? 'pending');
      const query = {
        'profile.role': 'member',
        ...(status === 'all' ? {} : { 'profile.membershipStatus': status }),
      };

      const docs = await users.find(query).sort({ updatedAt: -1 }).toArray();
      const members = docs.map((doc) => ({
        uid: doc.uid,
        email: doc.email ?? '',
        displayName: doc.profile?.displayName ?? doc.email ?? 'Player',
        role: doc.profile?.role ?? 'member',
        membershipStatus: doc.profile?.membershipStatus ?? 'pending',
        updatedAt: doc.profile?.updatedAt ?? doc.updatedAt ?? '',
      }));

      res.json({ members, requestedBy: adminEmail });
    } catch (_error) {
      res.status(500).json({ error: 'Failed to load members.' });
    }
  });

  app.put('/api/admin/members/:uid/approval', async (req, res) => {
    try {
      const adminEmail = await ensureAdmin(req, res);
      if (!adminEmail) return;

      const { uid } = req.params;
      const status = String(req.body?.status ?? 'approved');
      if (status !== 'approved' && status !== 'pending') {
        res.status(400).json({ error: 'Invalid membership status.' });
        return;
      }

      const doc = await getOrCreateUser(uid);
      const nextProfile = {
        ...DEFAULT_PROFILE(uid, doc.email),
        ...(doc.profile ?? {}),
        membershipStatus: status,
        updatedAt: new Date().toISOString(),
      };

      await users.updateOne(
        { uid },
        {
          $set: {
            profile: nextProfile,
            updatedAt: new Date().toISOString(),
          },
        },
      );

      const timestamp = new Date().toISOString();
      await courseAuditLogs.insertOne({
        id: crypto.randomUUID(),
        courseId: 'system',
        action: status === 'approved' ? 'member_approved' : 'member_marked_pending',
        details: `${nextProfile.displayName || doc.email || uid} -> ${status}`,
        targetUid: uid,
        adminEmail,
        timestamp,
      });

      res.json({
        member: {
          uid,
          email: doc.email ?? '',
          displayName: nextProfile.displayName ?? doc.email ?? 'Player',
          role: nextProfile.role ?? 'member',
          membershipStatus: nextProfile.membershipStatus,
          updatedAt: nextProfile.updatedAt,
        },
      });
    } catch (_error) {
      res.status(500).json({ error: 'Failed to update member approval.' });
    }
  });

  app.get('/api/admin/courses/:courseId/audit', async (req, res) => {
    try {
      const adminEmail = await ensureAdmin(req, res);
      if (!adminEmail) return;

      const { courseId } = req.params;
      const limit = Math.max(1, Math.min(100, Number(req.query.limit ?? 50)));
      const logs = await courseAuditLogs
        .find({ courseId })
        .sort({ timestamp: -1 })
        .limit(limit)
        .toArray();

      res.json({
        logs: logs.map((entry) => ({
          id: entry.id,
          courseId: entry.courseId,
          action: entry.action,
          details: entry.details ?? '',
          adminEmail: entry.adminEmail ?? '',
          timestamp: entry.timestamp,
        })),
        requestedBy: adminEmail,
      });
    } catch (_error) {
      res.status(500).json({ error: 'Failed to load course audit log.' });
    }
  });

  app.post('/api/admin/courses/:courseId/audit', async (req, res) => {
    try {
      const adminEmail = await ensureAdmin(req, res);
      if (!adminEmail) return;

      const { courseId } = req.params;
      const action = String(req.body?.action ?? '').trim();
      if (!action) {
        res.status(400).json({ error: 'Audit action is required.' });
        return;
      }

      const timestamp = new Date().toISOString();
      const record = {
        id: crypto.randomUUID(),
        courseId,
        action,
        details: String(req.body?.details ?? ''),
        adminEmail,
        timestamp,
      };
      await courseAuditLogs.insertOne(record);
      res.json({ log: record });
    } catch (_error) {
      res.status(500).json({ error: 'Failed to write course audit log.' });
    }
  });

  app.get('/api/admin/feedback/round', async (req, res) => {
    try {
      const adminEmail = await ensureAdmin(req, res);
      if (!adminEmail) return;

      const courseId = String(req.query.courseId ?? 'all').trim();
      const limit = Math.max(1, Math.min(200, Number(req.query.limit ?? 60)));
      const query = courseId === 'all' ? {} : { courseId };

      const entries = await roundFeedback
        .find(query)
        .sort({ timestamp: -1 })
        .limit(limit)
        .toArray();

      res.json({
        entries: entries.map(mapRoundFeedbackEntry),
        requestedBy: adminEmail,
      });
    } catch (_error) {
      res.status(500).json({ error: 'Failed to load round feedback.' });
    }
  });

  app.put('/api/admin/feedback/round/:feedbackId/reply', async (req, res) => {
    try {
      const adminEmail = await ensureAdmin(req, res);
      if (!adminEmail) return;

      const { feedbackId } = req.params;
      const reply = String(req.body?.reply ?? '').trim().slice(0, 1000);
      if (!reply) {
        res.status(400).json({ error: 'Reply is required.' });
        return;
      }

      const adminReplyAt = new Date().toISOString();
      const updateResult = await roundFeedback.updateOne(
        { id: feedbackId },
        {
          $set: {
            adminReply: reply,
            adminReplyAt,
            adminReplyBy: adminEmail,
            userReadAt: '',
          },
        },
      );

      if (updateResult.matchedCount === 0) {
        res.status(404).json({ error: 'Feedback entry not found.' });
        return;
      }

      const updated = await roundFeedback.findOne({ id: feedbackId });
      res.json({ entry: mapRoundFeedbackEntry(updated ?? {}) });
    } catch (_error) {
      res.status(500).json({ error: 'Failed to reply to feedback.' });
    }
  });

  app.get('/api/users/:uid/feedback/round', async (req, res) => {
    try {
      const { uid } = req.params;
      if (!await ensureUserAuth(req, res, uid)) return;
      const limit = Math.max(1, Math.min(200, Number(req.query.limit ?? 60)));
      const entries = await roundFeedback
        .find({ uid })
        .sort({ timestamp: -1 })
        .limit(limit)
        .toArray();

      res.json({
        entries: entries.map(mapRoundFeedbackEntry),
      });
    } catch (_error) {
      res.status(500).json({ error: 'Failed to load your round feedback.' });
    }
  });

  app.put('/api/users/:uid/feedback/round/:feedbackId/read', async (req, res) => {
    try {
      const { uid, feedbackId } = req.params;
      if (!await ensureUserAuth(req, res, uid)) return;

      const entry = await roundFeedback.findOne({ id: feedbackId, uid });
      if (!entry) {
        res.status(404).json({ error: 'Feedback entry not found.' });
        return;
      }

      const alreadyRead = typeof entry.userReadAt === 'string' && entry.userReadAt.trim().length > 0;
      if (!alreadyRead) {
        await roundFeedback.updateOne(
          { id: feedbackId, uid },
          { $set: { userReadAt: new Date().toISOString() } },
        );
      }

      const updated = await roundFeedback.findOne({ id: feedbackId, uid });
      res.json({ entry: mapRoundFeedbackEntry(updated ?? {}) });
    } catch (_error) {
      res.status(500).json({ error: 'Failed to mark feedback notification as read.' });
    }
  });

  app.post('/api/analytics/event', async (req, res) => {
    try {
      const auth = await requireAuth(req, res);
      if (!auth) return;
      const eventName = String(req.body?.eventName ?? '').trim();
      if (!eventName) {
        res.status(400).json({ error: 'eventName is required.' });
        return;
      }

      const payload = {
        id: crypto.randomUUID(),
        eventName,
        stage: String(req.body?.stage ?? ''),
        uid: auth.uid,
        email: auth.email,
        meta: req.body?.meta && typeof req.body.meta === 'object' ? req.body.meta : {},
        timestamp: new Date().toISOString(),
      };
      await productEvents.insertOne(payload);
      res.json({ ok: true });
    } catch (_error) {
      res.status(500).json({ error: 'Failed to record analytics event.' });
    }
  });

  app.post('/api/feedback/round', async (req, res) => {
    try {
      const auth = await requireAuth(req, res);
      if (!auth) return;
      const rating = Number(req.body?.rating ?? 0);
      if (!Number.isFinite(rating) || rating < 1 || rating > 5) {
        res.status(400).json({ error: 'rating must be between 1 and 5.' });
        return;
      }

      const payload = {
        id: crypto.randomUUID(),
        uid: auth.uid,
        email: auth.email,
        roundId: String(req.body?.roundId ?? ''),
        courseId: String(req.body?.courseId ?? ''),
        rating,
        note: String(req.body?.note ?? '').slice(0, 1000),
        timestamp: new Date().toISOString(),
        adminReply: '',
        adminReplyAt: '',
        adminReplyBy: '',
        userReadAt: '',
      };

      await roundFeedback.insertOne(payload);
      res.json({ ok: true });
    } catch (_error) {
      res.status(500).json({ error: 'Failed to submit round feedback.' });
    }
  });

  return app;
}

export function getApp() {
  if (!appPromise) {
    appPromise = createApp();
  }
  return appPromise;
}
