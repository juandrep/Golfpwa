import cors from 'cors';
import express from 'express';
import { MongoClient } from 'mongodb';

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

  await users.createIndex({ uid: 1 }, { unique: true });
  await courseAuditLogs.createIndex({ courseId: 1, timestamp: -1 });
  await productEvents.createIndex({ eventName: 1, timestamp: -1 });
  await roundFeedback.createIndex({ timestamp: -1 });
  await roundFeedback.createIndex({ courseId: 1, timestamp: -1 });

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

  function getAdminEmail(req) {
    const headerEmail = req.headers['x-admin-email'];
    if (typeof headerEmail === 'string') return headerEmail.trim().toLowerCase();
    if (Array.isArray(headerEmail) && headerEmail.length > 0) {
      return String(headerEmail[0]).trim().toLowerCase();
    }
    return String(req.query.adminEmail ?? req.body?.adminEmail ?? '').trim().toLowerCase();
  }

  function ensureAdmin(req, res) {
    const adminEmail = getAdminEmail(req);
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

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true });
  });

  app.get('/api/users/:uid/bootstrap', async (req, res) => {
    try {
      const { uid } = req.params;
      const email = String(req.query.email ?? '');
      const doc = await getOrCreateUser(uid, email);
      res.json(sanitizeUser(doc, uid, email));
    } catch (_error) {
      res.status(500).json({ error: 'Failed to load user data.' });
    }
  });

  app.put('/api/users/:uid/profile', async (req, res) => {
    try {
      const { uid } = req.params;
      const profile = req.body;
      await users.updateOne(
        { uid },
        {
          $set: {
            profile: { ...profile, uid, updatedAt: new Date().toISOString() },
            updatedAt: new Date().toISOString(),
          },
          $setOnInsert: { createdAt: new Date().toISOString(), rounds: [], courses: [] },
        },
        { upsert: true },
      );
      const updated = await users.findOne({ uid });
      res.json(sanitizeUser(updated, uid));
    } catch (_error) {
      res.status(500).json({ error: 'Failed to update profile.' });
    }
  });

  app.put('/api/users/:uid/settings', async (req, res) => {
    try {
      const { uid } = req.params;
      const settings = req.body;
      await users.updateOne(
        { uid },
        {
          $set: {
            settings: { ...settings, id: 'user-settings', updatedAt: new Date().toISOString() },
            updatedAt: new Date().toISOString(),
          },
          $setOnInsert: { createdAt: new Date().toISOString(), rounds: [], courses: [] },
        },
        { upsert: true },
      );
      const updated = await users.findOne({ uid });
      res.json(sanitizeUser(updated, uid));
    } catch (_error) {
      res.status(500).json({ error: 'Failed to update settings.' });
    }
  });

  app.put('/api/users/:uid/courses/:courseId', async (req, res) => {
    try {
      const { uid, courseId } = req.params;
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

  app.get('/api/admin/members', async (req, res) => {
    try {
      const adminEmail = ensureAdmin(req, res);
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
      const adminEmail = ensureAdmin(req, res);
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
      const adminEmail = ensureAdmin(req, res);
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
      const adminEmail = ensureAdmin(req, res);
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
      const adminEmail = ensureAdmin(req, res);
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
        entries: entries.map((entry) => ({
          id: entry.id ?? '',
          uid: entry.uid ?? '',
          email: entry.email ?? '',
          roundId: entry.roundId ?? '',
          courseId: entry.courseId ?? '',
          rating: Number(entry.rating ?? 0),
          note: entry.note ?? '',
          timestamp: entry.timestamp ?? '',
        })),
        requestedBy: adminEmail,
      });
    } catch (_error) {
      res.status(500).json({ error: 'Failed to load round feedback.' });
    }
  });

  app.post('/api/analytics/event', async (req, res) => {
    try {
      const eventName = String(req.body?.eventName ?? '').trim();
      if (!eventName) {
        res.status(400).json({ error: 'eventName is required.' });
        return;
      }

      const payload = {
        id: crypto.randomUUID(),
        eventName,
        stage: String(req.body?.stage ?? ''),
        uid: String(req.body?.uid ?? ''),
        email: String(req.body?.email ?? ''),
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
      const rating = Number(req.body?.rating ?? 0);
      if (!Number.isFinite(rating) || rating < 1 || rating > 5) {
        res.status(400).json({ error: 'rating must be between 1 and 5.' });
        return;
      }

      const payload = {
        id: crypto.randomUUID(),
        uid: String(req.body?.uid ?? ''),
        email: String(req.body?.email ?? ''),
        roundId: String(req.body?.roundId ?? ''),
        courseId: String(req.body?.courseId ?? ''),
        rating,
        note: String(req.body?.note ?? '').slice(0, 1000),
        timestamp: new Date().toISOString(),
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
