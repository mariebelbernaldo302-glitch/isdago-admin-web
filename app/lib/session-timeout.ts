"use client";

export const INACTIVITY_TIMEOUT_MS = 5 * 60 * 1000;

export const LAST_ACTIVITY_STORAGE_KEY =
  "isdago.admin.lastActivityAt";

export const LOGOUT_REASON_SESSION_KEY =
  "isdago.admin.logoutReason";

export const INACTIVITY_LOGOUT_REASON = "inactivity";

export function readLastActivityAt(): number | null {
  if (typeof window === "undefined") {
    return null;
  }

  const rawValue = window.localStorage.getItem(
    LAST_ACTIVITY_STORAGE_KEY
  );

  if (!rawValue) {
    return null;
  }

  const parsedValue = Number(rawValue);

  if (!Number.isFinite(parsedValue) || parsedValue <= 0) {
    return null;
  }

  return parsedValue;
}

export function markLastActivityAt(
  timestamp = Date.now()
): number {
  if (typeof window !== "undefined") {
    window.localStorage.setItem(
      LAST_ACTIVITY_STORAGE_KEY,
      String(timestamp)
    );
  }

  return timestamp;
}

export function clearLastActivityAt() {
  if (typeof window !== "undefined") {
    window.localStorage.removeItem(
      LAST_ACTIVITY_STORAGE_KEY
    );
  }
}

export function setInactivityLogoutReason() {
  if (typeof window === "undefined") {
    return;
  }

  window.sessionStorage.setItem(
    LOGOUT_REASON_SESSION_KEY,
    INACTIVITY_LOGOUT_REASON
  );
}

export function consumeLogoutReason(): string | null {
  if (typeof window === "undefined") {
    return null;
  }

  const reason = window.sessionStorage.getItem(
    LOGOUT_REASON_SESSION_KEY
  );

  if (reason) {
    window.sessionStorage.removeItem(
      LOGOUT_REASON_SESSION_KEY
    );
  }

  return reason;
}
