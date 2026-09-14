"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  onAuthStateChanged,
  signOut,
  type User,
} from "firebase/auth";

import {
  auth,
  ensureAuthPersistence,
} from "../lib/firebase";
import { authorizeAdminSession } from "../lib/admin-client";
import {
  getRoleForUser,
  type UserRole,
} from "../lib/permissions";
import {
  INACTIVITY_TIMEOUT_MS,
  LAST_ACTIVITY_STORAGE_KEY,
  clearLastActivityAt,
  markLastActivityAt,
  readLastActivityAt,
  setInactivityLogoutReason,
} from "../lib/session-timeout";

type AuthContextType = {
  user: User | null;
  role: UserRole;
  loading: boolean;
  initialized: boolean;
  error: string | null;
  isAuthenticated: boolean;
  isAdmin: boolean;
  refreshRole: (
    currentUserOverride?: User | null,
    authorizeIfMissing?: boolean
  ) => Promise<UserRole>;
};

type AuthProviderProps = {
  children: ReactNode;
};

const AuthContext =
  createContext<AuthContextType | undefined>(undefined);

function readableAuthError(error: unknown): string {
  if (error instanceof Error && error.message.trim()) {
    return error.message;
  }

  return "Unable to restore the administrator session.";
}

export function AuthProvider({
  children,
}: AuthProviderProps) {
  const [user, setUser] = useState<User | null>(null);
  const [role, setRole] = useState<UserRole>(null);
  const [loading, setLoading] = useState(true);
  const [initialized, setInitialized] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const operationIdRef = useRef(0);
  const inactivityTimerRef = useRef<number | null>(null);
  const logoutInProgressRef = useRef(false);
  const lastRecordedInteractionRef = useRef(0);

  const clearInactivityTimer = useCallback(() => {
    if (
      typeof window !== "undefined" &&
      inactivityTimerRef.current !== null
    ) {
      window.clearTimeout(inactivityTimerRef.current);
      inactivityTimerRef.current = null;
    }
  }, []);

  const logoutForInactivity = useCallback(async () => {
    if (logoutInProgressRef.current) {
      return;
    }

    logoutInProgressRef.current = true;
    clearInactivityTimer();

    try {
      setInactivityLogoutReason();
      clearLastActivityAt();
      await signOut(auth);
    } catch (logoutError) {
      console.warn(
        "Unable to complete inactivity sign-out cleanly:",
        logoutError
      );
    } finally {
      if (typeof window !== "undefined") {
        window.location.replace("/login");
      }
    }
  }, [clearInactivityTimer]);

  const armInactivityTimer = useCallback(() => {
    if (typeof window === "undefined") {
      return;
    }

    clearInactivityTimer();

    if (!auth.currentUser || logoutInProgressRef.current) {
      return;
    }

    let lastActivityAt = readLastActivityAt();

    if (!lastActivityAt) {
      lastActivityAt = markLastActivityAt();
    }

    const elapsed = Date.now() - lastActivityAt;

    if (elapsed >= INACTIVITY_TIMEOUT_MS) {
      void logoutForInactivity();
      return;
    }

    const remaining = Math.max(
      250,
      INACTIVITY_TIMEOUT_MS - elapsed
    );

    inactivityTimerRef.current = window.setTimeout(() => {
      const latestActivityAt = readLastActivityAt();

      if (!latestActivityAt) {
        markLastActivityAt();
        armInactivityTimer();
        return;
      }

      if (
        Date.now() - latestActivityAt >=
        INACTIVITY_TIMEOUT_MS
      ) {
        void logoutForInactivity();
        return;
      }

      armInactivityTimer();
    }, remaining);
  }, [clearInactivityTimer, logoutForInactivity]);

  const recordUserInteraction = useCallback(() => {
    if (typeof window === "undefined") {
      return;
    }

    const now = Date.now();

    // Avoid excessive localStorage writes during rapid scroll events.
    if (now - lastRecordedInteractionRef.current < 500) {
      return;
    }

    lastRecordedInteractionRef.current = now;
    markLastActivityAt(now);

    if (auth.currentUser) {
      armInactivityTimer();
    }
  }, [armInactivityTimer]);

  const resolveRole = useCallback(
    async (
      currentUser: User,
      authorizeIfMissing: boolean
    ): Promise<UserRole> => {
      const existingRole = await getRoleForUser(
        currentUser,
        false
      );

      if (existingRole) {
        return existingRole;
      }

      if (!authorizeIfMissing) {
        return null;
      }

      return authorizeAdminSession(currentUser);
    },
    []
  );

  const applyAuthenticatedUser = useCallback(
    async (
      currentUser: User | null,
      authorizeIfMissing: boolean
    ): Promise<UserRole> => {
      const operationId = ++operationIdRef.current;

      setLoading(true);
      setError(null);
      setUser(currentUser);

      if (!currentUser) {
        if (operationId === operationIdRef.current) {
          setRole(null);
          setInitialized(true);
          setLoading(false);
        }

        return null;
      }

      try {
        const resolvedRole = await resolveRole(
          currentUser,
          authorizeIfMissing
        );

        if (operationId === operationIdRef.current) {
          setRole(resolvedRole);
        }

        return resolvedRole;
      } catch (authError) {
        if (operationId === operationIdRef.current) {
          setRole(null);
          setError(readableAuthError(authError));
        }

        return null;
      } finally {
        if (operationId === operationIdRef.current) {
          setInitialized(true);
          setLoading(false);
        }
      }
    },
    [resolveRole]
  );

  const refreshRole = useCallback(
    async (
      currentUserOverride?: User | null,
      authorizeIfMissing = true
    ): Promise<UserRole> => {
      const targetUser =
        currentUserOverride ?? auth.currentUser;

      return applyAuthenticatedUser(
        targetUser,
        authorizeIfMissing
      );
    },
    [applyAuthenticatedUser]
  );

  useEffect(() => {
    let active = true;
    let unsubscribe: (() => void) | undefined;

    async function startAuthentication() {
      try {
        await ensureAuthPersistence();

        if (!active) {
          return;
        }

        unsubscribe = onAuthStateChanged(
          auth,
          (currentUser) => {
            void applyAuthenticatedUser(
              currentUser,
              true
            );
          }
        );
      } catch (startupError) {
        if (!active) {
          return;
        }

        setUser(null);
        setRole(null);
        setError(readableAuthError(startupError));
        setInitialized(true);
        setLoading(false);
      }
    }

    void startAuthentication();

    return () => {
      active = false;
      operationIdRef.current += 1;
      unsubscribe?.();
    };
  }, [applyAuthenticatedUser]);

  /*
   * Global activity tracking. This remains active on the login page too,
   * which means a fresh login always has a recent interaction timestamp.
   * It also prevents an old, timed-out timestamp from immediately expiring
   * a newly authenticated administrator.
   */
  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const handleStorage = (event: StorageEvent) => {
      if (event.key === LAST_ACTIVITY_STORAGE_KEY) {
        armInactivityTimer();
      }
    };

    const handleVisibility = () => {
      if (document.visibilityState === "visible") {
        armInactivityTimer();
      }
    };

    const handleFocus = () => {
      armInactivityTimer();
    };

    window.addEventListener(
      "pointerdown",
      recordUserInteraction,
      { passive: true }
    );
    window.addEventListener("keydown", recordUserInteraction);
    window.addEventListener(
      "touchstart",
      recordUserInteraction,
      { passive: true }
    );
    window.addEventListener("scroll", recordUserInteraction, {
      passive: true,
      capture: true,
    });
    window.addEventListener("storage", handleStorage);
    window.addEventListener("focus", handleFocus);
    document.addEventListener(
      "visibilitychange",
      handleVisibility
    );

    return () => {
      window.removeEventListener(
        "pointerdown",
        recordUserInteraction
      );
      window.removeEventListener(
        "keydown",
        recordUserInteraction
      );
      window.removeEventListener(
        "touchstart",
        recordUserInteraction
      );
      window.removeEventListener(
        "scroll",
        recordUserInteraction,
        true
      );
      window.removeEventListener("storage", handleStorage);
      window.removeEventListener("focus", handleFocus);
      document.removeEventListener(
        "visibilitychange",
        handleVisibility
      );
    };
  }, [armInactivityTimer, recordUserInteraction]);

  useEffect(() => {
    if (user) {
      armInactivityTimer();
    } else {
      clearInactivityTimer();
      logoutInProgressRef.current = false;
    }

    return clearInactivityTimer;
  }, [user, armInactivityTimer, clearInactivityTimer]);

  const value = useMemo<AuthContextType>(
    () => ({
      user,
      role,
      loading,
      initialized,
      error,
      isAuthenticated: Boolean(user),
      isAdmin: role === "admin",
      refreshRole,
    }),
    [
      user,
      role,
      loading,
      initialized,
      error,
      refreshRole,
    ]
  );

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);

  if (!context) {
    throw new Error(
      "useAuth must be used inside AuthProvider."
    );
  }

  return context;
}
