"use client";

import {
  getApps,
  initializeApp,
  type FirebaseApp,
  type FirebaseOptions,
} from "firebase/app";
import {
  browserLocalPersistence,
  getAuth,
  setPersistence,
  type Auth,
} from "firebase/auth";
import {
  getDatabase,
  type Database,
} from "firebase/database";

const firebaseConfig: FirebaseOptions = {
  apiKey:
    process.env.NEXT_PUBLIC_FIREBASE_API_KEY ||
    "AIzaSyDHLqwTecK5y8dHponbc67Lavk2UWYy0Uw",
  authDomain:
    process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN ||
    "isda-go.firebaseapp.com",
  databaseURL:
    process.env.NEXT_PUBLIC_FIREBASE_DATABASE_URL ||
    "https://isda-go-default-rtdb.firebaseio.com",
  projectId:
    process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ||
    "isda-go",
  messagingSenderId:
    process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID ||
    "961496839447",
  appId:
    process.env.NEXT_PUBLIC_FIREBASE_APP_ID ||
    "1:961496839447:web:10ccb84a5bf35aa914b352",
};

function validateFirebaseConfig(config: FirebaseOptions) {
  const missingFields: string[] = [];

  if (!config.apiKey) missingFields.push("apiKey");
  if (!config.authDomain) missingFields.push("authDomain");
  if (!config.databaseURL) missingFields.push("databaseURL");
  if (!config.projectId) missingFields.push("projectId");
  if (!config.appId) missingFields.push("appId");

  if (missingFields.length > 0) {
    throw new Error(
      `Firebase configuration is incomplete. Missing: ${missingFields.join(
        ", "
      )}`
    );
  }
}

validateFirebaseConfig(firebaseConfig);

export const app: FirebaseApp =
  getApps().length > 0
    ? getApps()[0]
    : initializeApp(firebaseConfig);

export const auth: Auth = getAuth(app);
export const db: Database = getDatabase(app);

let persistencePromise: Promise<void> | null = null;

/**
 * Persist the Firebase session in browser local storage so that
 * route navigation and page refreshes do not lose the admin session.
 */
export function ensureAuthPersistence(): Promise<void> {
  if (typeof window === "undefined") {
    return Promise.resolve();
  }

  if (!persistencePromise) {
    persistencePromise = setPersistence(
      auth,
      browserLocalPersistence
    ).catch((error) => {
      persistencePromise = null;
      throw error;
    });
  }

  return persistencePromise;
}
