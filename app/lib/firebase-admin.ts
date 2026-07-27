import "server-only";

import {
  cert,
  getApp,
  getApps,
  initializeApp,
  type App,
  type ServiceAccount,
} from "firebase-admin/app";
import {
  getAuth,
  type Auth,
} from "firebase-admin/auth";
import {
  getDatabase,
  type Database,
} from "firebase-admin/database";

const ADMIN_APP_NAME = "isdago-admin";

export type FirebaseAdminConfigurationStatus = {
  projectId: boolean;
  databaseURL: boolean;
  clientEmail: boolean;
  privateKey: boolean;
  privateKeyFormat: boolean;
};

function cleanEnvironmentValue(
  value: string | undefined
): string {
  if (!value) {
    return "";
  }

  return value
    .trim()
    .replace(/^["']|["']$/g, "");
}

function normalizePrivateKey(
  value: string | undefined
): string {
  return cleanEnvironmentValue(value)
    .replace(/\\n/g, "\n")
    .trim();
}

export function getFirebaseAdminConfigurationStatus():
FirebaseAdminConfigurationStatus {
  const projectId = cleanEnvironmentValue(
    process.env.FIREBASE_ADMIN_PROJECT_ID
  );

  const databaseURL = cleanEnvironmentValue(
    process.env.FIREBASE_ADMIN_DATABASE_URL
  );

  const clientEmail = cleanEnvironmentValue(
    process.env.FIREBASE_ADMIN_CLIENT_EMAIL
  );

  const privateKey = normalizePrivateKey(
    process.env.FIREBASE_ADMIN_PRIVATE_KEY
  );

  return {
    projectId: Boolean(projectId),
    databaseURL: Boolean(databaseURL),
    clientEmail: Boolean(clientEmail),
    privateKey: Boolean(privateKey),
    privateKeyFormat:
      privateKey.includes(
        "-----BEGIN PRIVATE KEY-----"
      ) &&
      privateKey.includes(
        "-----END PRIVATE KEY-----"
      ),
  };
}

function requireEnvironmentValue(
  name:
    | "FIREBASE_ADMIN_PROJECT_ID"
    | "FIREBASE_ADMIN_DATABASE_URL"
    | "FIREBASE_ADMIN_CLIENT_EMAIL"
): string {
  const value = cleanEnvironmentValue(
    process.env[name]
  );

  if (!value) {
    throw new Error(
      `Missing required environment variable: ${name}`
    );
  }

  return value;
}

function requirePrivateKey(): string {
  const privateKey = normalizePrivateKey(
    process.env.FIREBASE_ADMIN_PRIVATE_KEY
  );

  if (!privateKey) {
    throw new Error(
      "Missing required environment variable: FIREBASE_ADMIN_PRIVATE_KEY"
    );
  }

  if (
    !privateKey.includes(
      "-----BEGIN PRIVATE KEY-----"
    ) ||
    !privateKey.includes(
      "-----END PRIVATE KEY-----"
    )
  ) {
    throw new Error(
      "FIREBASE_ADMIN_PRIVATE_KEY has an invalid format."
    );
  }

  return privateKey;
}

function createFirebaseAdminApp(): App {
  const projectId = requireEnvironmentValue(
    "FIREBASE_ADMIN_PROJECT_ID"
  );

  const databaseURL = requireEnvironmentValue(
    "FIREBASE_ADMIN_DATABASE_URL"
  );

  const clientEmail = requireEnvironmentValue(
    "FIREBASE_ADMIN_CLIENT_EMAIL"
  );

  const privateKey = requirePrivateKey();

  const serviceAccount: ServiceAccount = {
    projectId,
    clientEmail,
    privateKey,
  };

  return initializeApp(
    {
      credential: cert(serviceAccount),
      databaseURL,
      projectId,
    },
    ADMIN_APP_NAME
  );
}

export function getFirebaseAdminApp(): App {
  const existingApp = getApps().find(
    (app) => app.name === ADMIN_APP_NAME
  );

  return existingApp
    ? getApp(ADMIN_APP_NAME)
    : createFirebaseAdminApp();
}

export function getAdminAuth(): Auth {
  return getAuth(getFirebaseAdminApp());
}

export function getAdminDatabase(): Database {
  return getDatabase(getFirebaseAdminApp());
}
