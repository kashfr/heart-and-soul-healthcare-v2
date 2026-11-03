import 'server-only';
import { initializeApp, getApps, applicationDefault, type App } from 'firebase-admin/app';
import { getAuth, type Auth } from 'firebase-admin/auth';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';

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

  // Application Default Credentials: the Cloud Run runtime identity in
  // production, `gcloud auth application-default login` locally.
  const app = initializeApp({
    credential: applicationDefault(),
    projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
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

/** The client-documents bucket (same one the browser uploads to). */
export function adminBucket() {
  const name = process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET || 'heart-and-soul-hc.firebasestorage.app';
  return getStorage(init().app).bucket(name);
}
