import 'server-only';
import { initializeApp, getApps, cert, type App } from 'firebase-admin/app';
import { getAuth, type Auth } from 'firebase-admin/auth';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';

let cached: { app: App; auth: Auth; db: Firestore } | null = null;

function init() {
  if (cached) return cached;

  const existing = getApps()[0];
  if (existing) {
    cached = {
      app: existing,
      auth: getAuth(existing),
      db: getFirestore(existing),
    };
    return cached;
  }

  const projectId = process.env.FIREBASE_ADMIN_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_ADMIN_CLIENT_EMAIL;
  const rawKey = process.env.FIREBASE_ADMIN_PRIVATE_KEY;

  if (!projectId || !clientEmail || !rawKey) {
    throw new Error(
      'Firebase Admin SDK env vars missing. Expected FIREBASE_ADMIN_PROJECT_ID, FIREBASE_ADMIN_CLIENT_EMAIL, and FIREBASE_ADMIN_PRIVATE_KEY.'
    );
  }

  // Env var stores "\n" as the literal characters '\' + 'n'. Convert to real newlines.
  const privateKey = rawKey.replace(/\\n/g, '\n');

  const app = initializeApp({
    credential: cert({ projectId, clientEmail, privateKey }),
    projectId,
  });

  cached = {
    app,
    auth: getAuth(app),
    db: getFirestore(app),
  };
  return cached;
}

export function adminAuth(): Auth {
  return init().auth;
}

export function adminDb(): Firestore {
  return init().db;
}
