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

        /*
         * Use onAuthStateChanged, not onIdTokenChanged. A forced token
         * refresh is part of admin authorization. Listening to every token
         * refresh can recursively start another role check and leave the
         * loading screen waiting until a manual page refresh.
         */
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
