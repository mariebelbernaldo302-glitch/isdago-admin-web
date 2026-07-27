"use client";

import { useEffect, useMemo, useState } from "react";
import {
  onValue,
  orderByChild,
  query as realtimeQuery,
  ref,
  type DataSnapshot,
} from "firebase/database";

import { db } from "./firebase";

type SortDirection = "asc" | "desc";

type UseRealtimeCollectionOptions = {
  enabled?: boolean;
  sortDirection?: SortDirection;
  limit?: number;
};

type UseCollectionResult<T> = {
  data: T[];
  loading: boolean;
  error: string;
  firebaseReady: boolean;
};

function cleanDatabasePath(path: string) {
  return path.replace(/^\/+|\/+$/g, "");
}

function getNestedValue<T extends Record<string, unknown>>(
  item: T,
  fieldPath: string
): unknown {
  return fieldPath.split(".").reduce<unknown>((currentValue, field) => {
    if (
      currentValue &&
      typeof currentValue === "object" &&
      field in currentValue
    ) {
      return (currentValue as Record<string, unknown>)[field];
    }

    return undefined;
  }, item);
}

function getComparableValue(value: unknown): number | string {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : 0;
  }

  if (typeof value === "string") {
    const trimmedValue = value.trim();

    if (!trimmedValue) {
      return "";
    }

    const numericValue = Number(trimmedValue);

    if (Number.isFinite(numericValue)) {
      return numericValue;
    }

    const dateValue = new Date(trimmedValue).getTime();

    if (Number.isFinite(dateValue)) {
      return dateValue;
    }

    return trimmedValue.toLowerCase();
  }

  if (value instanceof Date) {
    return value.getTime();
  }

  if (value && typeof value === "object") {
    const timestampLikeValue = value as {
      seconds?: number;
      nanoseconds?: number;
      toDate?: () => Date;
    };

    if (typeof timestampLikeValue.toDate === "function") {
      return timestampLikeValue.toDate().getTime();
    }

    if (typeof timestampLikeValue.seconds === "number") {
      return (
        timestampLikeValue.seconds * 1000 +
        Math.floor((timestampLikeValue.nanoseconds || 0) / 1_000_000)
      );
    }
  }

  return 0;
}

function sortRows<T extends { id: string }>(
  rows: T[],
  orderedBy: string | null,
  direction: SortDirection
) {
  if (!orderedBy) {
    return rows;
  }

  return [...rows].sort((a, b) => {
    const firstValue = getComparableValue(
      getNestedValue(a as Record<string, unknown>, orderedBy)
    );

    const secondValue = getComparableValue(
      getNestedValue(b as Record<string, unknown>, orderedBy)
    );

    if (firstValue < secondValue) {
      return direction === "asc" ? -1 : 1;
    }

    if (firstValue > secondValue) {
      return direction === "asc" ? 1 : -1;
    }

    return 0;
  });
}

function snapshotToArray<T extends { id: string }>(
  snapshot: DataSnapshot
): T[] {
  const rows: T[] = [];

  snapshot.forEach((childSnapshot) => {
    const value = childSnapshot.val();

    if (value && typeof value === "object" && !Array.isArray(value)) {
      rows.push({
        id: childSnapshot.key || "",
        ...value,
      } as T);
    } else {
      rows.push({
        id: childSnapshot.key || "",
        value,
      } as unknown as T);
    }
  });

  return rows;
}

export function useRealtimeCollection<T extends { id: string }>(
  collectionPath: string,
  orderedBy: string | null = null,
  options: UseRealtimeCollectionOptions = {}
): UseCollectionResult<T> {
  const {
    enabled = true,
    sortDirection = "desc",
    limit,
  } = options;

  const [data, setData] = useState<T[]>([]);
  const [loading, setLoading] = useState(enabled);
  const [error, setError] = useState("");

  const normalizedPath = useMemo(
    () => cleanDatabasePath(collectionPath),
    [collectionPath]
  );

  useEffect(() => {
    if (!enabled) {
      setData([]);
      setLoading(false);
      setError("");
      return;
    }

    if (!normalizedPath) {
      setData([]);
      setLoading(false);
      setError("Realtime Database path is required.");
      return;
    }

    setLoading(true);
    setError("");

    const collectionRef = ref(db, normalizedPath);

    const databaseQuery = orderedBy
      ? realtimeQuery(collectionRef, orderByChild(orderedBy))
      : collectionRef;

    const unsubscribe = onValue(
      databaseQuery,
      (snapshot) => {
        if (!snapshot.exists()) {
          setData([]);
          setLoading(false);
          setError("");
          return;
        }

        const rows = snapshotToArray<T>(snapshot);
        const sortedRows = sortRows(rows, orderedBy, sortDirection);
        const limitedRows =
          typeof limit === "number" && limit > 0
            ? sortedRows.slice(0, limit)
            : sortedRows;

        setData(limitedRows);
        setLoading(false);
        setError("");
      },
      (firebaseError) => {
        console.error(
          `Failed to load Realtime Database path "${normalizedPath}":`,
          firebaseError
        );

        setData([]);
        setLoading(false);
        setError(firebaseError.message || "Failed to load records.");
      }
    );

    return () => unsubscribe();
  }, [enabled, normalizedPath, orderedBy, sortDirection, limit]);

  return {
    data,
    loading,
    error,
    firebaseReady: true,
  };
}

/**
 * Backward-compatible alias.
 *
 * Old pages may still import:
 * useFirestoreCollection(...)
 *
 * This now reads from Firebase Realtime Database.
 */
export function useFirestoreCollection<T extends { id: string }>(
  collectionPath: string,
  orderedBy: string | null = null
): UseCollectionResult<T> {
  return useRealtimeCollection<T>(collectionPath, orderedBy);
}