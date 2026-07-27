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
  onIdTokenChanged,
  type User,
} from "firebase/auth";

import {
  auth,
  ensureAuthPersistence,
} from "../lib/firebase";

import {
  authorizeAdminSession,
} from "../lib/admin-client";

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
    reauthorize?: boolean
  ) => Promise<UserRole>;
};

type AuthProviderProps = {
  children: ReactNode;
};

const AuthContext =
  createContext<AuthContextType | undefined>(
    undefined
  );

function getReadableAuthError(
  error: unknown
) {
  if (
    error instanceof Error &&
    error.message.trim()
  ) {
    return error.message;
  }

  return "Unable to verify administrator access.";
}

export function AuthProvider({
  children,
}: AuthProviderProps) {
  const [user, setUser] =
    useState<User | null>(null);

  const [role, setRole] =
    useState<UserRole>(null);

  const [loading, setLoading] =
    useState(true);

  const [initialized, setInitialized] =
    useState(false);

  const [error, setError] =
    useState<string | null>(null);

  /*
   * Prevent an older asynchronous role check from
   * overwriting a newer successful check.
   */
  const roleRequestId = useRef(0);

  const resolveRole = useCallback(
    async (
      currentUser: User,
      reauthorize: boolean
    ): Promise<UserRole> => {
      let resolvedRole =
        await getRoleForUser(
          currentUser,
          false
        );

      if (
        resolvedRole === "admin" ||
        !reauthorize
      ) {
        return resolvedRole;
      }

      /*
       * A persisted session can contain an older token that
       * does not yet include the custom admin claim. Ask the
       * secure server route to verify and refresh it.
       */
      resolvedRole =
        await authorizeAdminSession(
          currentUser
        );

      return resolvedRole;
    },
    []
  );

  const refreshRole = useCallback(
    async (
      currentUserOverride?: User | null,
      reauthorize = true
    ): Promise<UserRole> => {
      const targetUser =
        currentUserOverride ??
        auth.currentUser;

      if (!targetUser) {
        setRole(null);
        return null;
      }

      const requestId =
        ++roleRequestId.current;

      try {
        setError(null);

        const resolvedRole =
          await resolveRole(
            targetUser,
            reauthorize
          );

        if (
          requestId ===
          roleRequestId.current
        ) {
          setUser(targetUser);
          setRole(resolvedRole);
        }

        return resolvedRole;
      } catch (roleError) {
        if (
          requestId ===
          roleRequestId.current
        ) {
          setRole(null);
          setError(
            getReadableAuthError(
              roleError
            )
          );
        }

        return null;
      }
    },
    [resolveRole]
  );

  useEffect(() => {
    let active = true;
    let unsubscribe:
      | (() => void)
      | undefined;

    async function startAuthObserver() {
      try {
        await ensureAuthPersistence();

        if (!active) {
          return;
        }

        unsubscribe =
          onIdTokenChanged(
            auth,
            async (currentUser) => {
              const requestId =
                ++roleRequestId.current;

              setLoading(true);
              setError(null);
              setUser(currentUser);

              if (!currentUser) {
                setRole(null);
                setInitialized(true);
                setLoading(false);
                return;
              }

              try {
                const resolvedRole =
                  await resolveRole(
                    currentUser,
                    true
                  );

                if (
                  !active ||
                  requestId !==
                    roleRequestId.current
                ) {
                  return;
                }

                setRole(resolvedRole);
              } catch (roleError) {
                if (
                  !active ||
                  requestId !==
                    roleRequestId.current
                ) {
                  return;
                }

                setRole(null);
                setError(
                  getReadableAuthError(
                    roleError
                  )
                );
              } finally {
                if (
                  active &&
                  requestId ===
                    roleRequestId.current
                ) {
                  setInitialized(true);
                  setLoading(false);
                }
              }
            }
          );
      } catch (persistenceError) {
        if (!active) {
          return;
        }

        setUser(null);
        setRole(null);
        setError(
          getReadableAuthError(
            persistenceError
          )
        );
        setInitialized(true);
        setLoading(false);
      }
    }

    void startAuthObserver();

    return () => {
      active = false;
      roleRequestId.current += 1;
      unsubscribe?.();
    };
  }, [resolveRole]);

  const value =
    useMemo<AuthContextType>(
      () => ({
        user,
        role,
        loading,
        initialized,
        error,
        isAuthenticated:
          Boolean(user),
        isAdmin:
          role === "admin",
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
    <AuthContext.Provider
      value={value}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context =
    useContext(AuthContext);

  if (!context) {
    throw new Error(
      "useAuth must be used inside AuthProvider."
    );
  }

  return context;
}
