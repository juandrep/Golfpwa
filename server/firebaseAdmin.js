import { applicationDefault, cert, getApps, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';

function getPrivateKey() {
  const raw = process.env.FIREBASE_PRIVATE_KEY;
  if (!raw) return '';
  return raw.replace(/\\n/g, '\n');
}

function ensureFirebaseAdminApp() {
  if (getApps().length > 0) return;

  const projectId = process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const privateKey = getPrivateKey();

  if (projectId && clientEmail && privateKey) {
    initializeApp({
      credential: cert({
        projectId,
        clientEmail,
        privateKey,
      }),
    });
    return;
  }

  initializeApp({
    credential: applicationDefault(),
  });
}

export async function verifyFirebaseIdToken(idToken) {
  ensureFirebaseAdminApp();
  const auth = getAuth();
  return auth.verifyIdToken(idToken);
}
