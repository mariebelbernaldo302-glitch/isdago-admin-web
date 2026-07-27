"use client";

import {
  get,
  push,
  ref,
  remove,
  set,
  update,
} from "firebase/database";

import { db } from "./firebase";

type FirebasePrimitive = string | number | boolean | null;

type FirebaseValue =
  | FirebasePrimitive
  | FirebaseValue[]
  | {
      [key: string]: FirebaseValue;
    };

type FirebaseObject = Record<string, FirebaseValue>;

type RecordData = Record<string, unknown>;

type WriteOptions = {
  addCreatedAt?: boolean;
  addUpdatedAt?: boolean;
  timestamp?: number;
};

const DEFAULT_CREATE_OPTIONS: Required<WriteOptions> = {
  addCreatedAt: true,
  addUpdatedAt: true,
  timestamp: 0,
};

const DEFAULT_UPDATE_OPTIONS: Required<WriteOptions> = {
  addCreatedAt: false,
  addUpdatedAt: true,
  timestamp: 0,
};

function getTimestamp(timestamp?: number) {
  return timestamp && Number.isFinite(timestamp) ? timestamp : Date.now();
}

function cleanDatabasePath(path: string) {
  return path.replace(/^\/+|\/+$/g, "");
}

function validatePath(path: string) {
  const cleanedPath = cleanDatabasePath(path);

  if (!cleanedPath) {
    throw new Error("Realtime Database path is required.");
  }

  return cleanedPath;
}

function validateRecordId(id: string) {
  const cleanedId = String(id || "").trim();

  if (!cleanedId) {
    throw new Error("Realtime Database record ID is required.");
  }

  if (cleanedId.includes("/")) {
    throw new Error("Realtime Database record ID must not contain '/'.");
  }

  return cleanedId;
}

function sanitizeValue(value: unknown): FirebaseValue {
  if (value === undefined || value === null) {
    return null;
  }

  if (
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return value;
  }

  if (value instanceof Date) {
    return value.getTime();
  }

  if (Array.isArray(value)) {
    return value.map((item) => sanitizeValue(item));
  }

  if (typeof value === "object") {
    return sanitizeObject(value as RecordData);
  }

  return String(value);
}

function sanitizeObject(data: RecordData): FirebaseObject {
  const cleanedObject: FirebaseObject = {};

  Object.entries(data).forEach(([key, value]) => {
    if (value !== undefined) {
      cleanedObject[key] = sanitizeValue(value);
    }
  });

  return cleanedObject;
}

function buildCreatePayload<T extends RecordData>(
  data: T,
  options: WriteOptions = {}
): FirebaseObject {
  const resolvedOptions = {
    ...DEFAULT_CREATE_OPTIONS,
    ...options,
  };

  const now = getTimestamp(resolvedOptions.timestamp);

  const payload: RecordData = {
    ...data,
  };

  if (resolvedOptions.addCreatedAt && payload.createdAt === undefined) {
    payload.createdAt = now;
  }

  if (resolvedOptions.addUpdatedAt) {
    payload.updatedAt = now;
  }

  return sanitizeObject(payload);
}

function buildUpdatePayload<T extends RecordData>(
  data: T,
  options: WriteOptions = {}
): FirebaseObject {
  const resolvedOptions = {
    ...DEFAULT_UPDATE_OPTIONS,
    ...options,
  };

  const now = getTimestamp(resolvedOptions.timestamp);

  const payload: RecordData = {
    ...data,
  };

  if (resolvedOptions.addCreatedAt && payload.createdAt === undefined) {
    payload.createdAt = now;
  }

  if (resolvedOptions.addUpdatedAt) {
    payload.updatedAt = now;
  }

  return sanitizeObject(payload);
}

export async function createRecord<T extends RecordData>(
  path: string,
  data: T,
  options: WriteOptions = {}
) {
  const cleanedPath = validatePath(path);
  const recordRef = push(ref(db, cleanedPath));

  if (!recordRef.key) {
    throw new Error("Failed to generate Realtime Database record ID.");
  }

  await set(recordRef, buildCreatePayload(data, options));

  return recordRef.key;
}

export async function createRecordWithId<T extends RecordData>(
  path: string,
  id: string,
  data: T,
  options: WriteOptions = {}
) {
  const cleanedPath = validatePath(path);
  const cleanedId = validateRecordId(id);

  await set(
    ref(db, `${cleanedPath}/${cleanedId}`),
    buildCreatePayload(data, options)
  );

  return cleanedId;
}

export async function updateRecord<T extends RecordData>(
  path: string,
  id: string,
  data: T,
  options: WriteOptions = {}
) {
  const cleanedPath = validatePath(path);
  const cleanedId = validateRecordId(id);

  await update(
    ref(db, `${cleanedPath}/${cleanedId}`),
    buildUpdatePayload(data, options)
  );
}

/**
 * Applies one atomic multi-location Realtime Database update.
 * Use this for moderation decisions that must keep users, role-specific
 * profiles, applications, and related records in sync.
 */
export async function updatePaths(updates: Record<string, unknown>) {
  const sanitizedUpdates: Record<string, FirebaseValue> = {};

  Object.entries(updates).forEach(([path, value]) => {
    const cleanedPath = validatePath(path);
    sanitizedUpdates[cleanedPath] = sanitizeValue(value);
  });

  if (Object.keys(sanitizedUpdates).length === 0) {
    return;
  }

  await update(ref(db), sanitizedUpdates);
}

export async function deleteRecord(path: string, id: string) {
  const cleanedPath = validatePath(path);
  const cleanedId = validateRecordId(id);

  await remove(ref(db, `${cleanedPath}/${cleanedId}`));
}

export async function getRecord<T extends RecordData>(
  path: string,
  id: string
): Promise<(T & { id: string }) | null> {
  const cleanedPath = validatePath(path);
  const cleanedId = validateRecordId(id);

  const snapshot = await get(ref(db, `${cleanedPath}/${cleanedId}`));

  if (!snapshot.exists()) {
    return null;
  }

  return {
    id: cleanedId,
    ...snapshot.val(),
  } as T & { id: string };
}

export async function recordExists(path: string, id: string) {
  const cleanedPath = validatePath(path);
  const cleanedId = validateRecordId(id);

  const snapshot = await get(ref(db, `${cleanedPath}/${cleanedId}`));

  return snapshot.exists();
}
