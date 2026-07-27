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
  getUserRole,
  type UserRole,
} from "../lib/permissions";

type AuthContextType = {
  user: User | null;
  role: UserRole;
  loading: boolean;
  error: string | null;
  isAuthenticated: boolean;
  isAdmin: boolean;
  refreshRole: (
    currentUserOverride?: User | null,
    forceRefresh?: boolean
  ) => Promise<UserRole>;
};

type AuthProviderProps = {
  children: ReactNode;
};

const AuthContext =
  createContext<AuthContextType | undefined>(undefined);

function isValidRole(
  role: UserRole
): role is Exclude<UserRole, null> {
  return (
    role === "admin" ||
    role === "vendor" ||
    role === "customer"
  );
}

export function AuthProvider({
  children,
}: AuthProviderProps) {
  const [user, setUser] = useState<User | null>(null);
  const [role, setRole] = useState<UserRole>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Every auth/token event receives a sequence number. An older async
  // role lookup is not allowed to overwrite a newer successful lookup.
  const authSequenceRef = useRef(0);
  const userRef = useRef<User | null>(null);

  useEffect(() => {
    userRef.current = user;
  }, [user]);

  const resolveRole = useCallback(
    async (
      currentUser: User,
      forceRefresh = false
    ): Promise<UserRole> => {
      const resolvedRole = await getUserRole(
        currentUser.uid,
        forceRefresh
      );

      return isValidRole(resolvedRole)
        ? resolvedRole
        : null;
    },
    []
  );

  const refreshRole = useCallback(
    async (
      currentUserOverride?: User | null,
      forceRefresh = true
    ): Promise<UserRole> => {
      const targetUser =
        currentUserOverride ?? userRef.current;

      if (!targetUser) {
        setRole(null);
        return null;
      }

      const requestSequence = ++authSequenceRef.current;

      try {
        setLoading(true);
        setError(null);

        const resolvedRole = await resolveRole(
          targetUser,
          forceRefresh
        );

        if (requestSequence === authSequenceRef.current) {
          setUser(targetUser);
          setRole(resolvedRole);
        }

        return resolvedRole;
      } catch (roleError) {
        console.error("Role refresh failed:", roleError);

        if (requestSequence === authSequenceRef.current) {
          setRole(null);
          setError("Unable to verify the account permission.");
        }

        return null;
      } finally {
        if (requestSequence === authSequenceRef.current) {
          setLoading(false);
        }
      }
    },
    [resolveRole]
  );

  useEffect(() => {
    let isMounted = true;
    let unsubscribe: (() => void) | undefined;

    async function initializeAuthentication() {
      try {
        setLoading(true);
        setError(null);

        await ensureAuthPersistence();

        if (!isMounted) {
          return;
        }

        unsubscribe = onIdTokenChanged(
          auth,
          async (currentUser) => {
            const requestSequence =
              ++authSequenceRef.current;

            if (!isMounted) {
              return;
            }

            setLoading(true);
            setError(null);
            setUser(currentUser);
            userRef.current = currentUser;

            if (!currentUser) {
              setRole(null);
              setLoading(false);
              return;
            }

            try {
              const resolvedRole = await resolveRole(
                currentUser,
                false
              );

              if (
                isMounted &&
                requestSequence === authSequenceRef.current
              ) {
                setRole(resolvedRole);
              }
            } catch (roleError) {
              console.error("Role loading error:", roleError);

              if (
                isMounted &&
                requestSequence === authSequenceRef.current
              ) {
                setRole(null);
                setError(
                  "Unable to verify the account permission."
                );
              }
            } finally {
              if (
                isMounted &&
                requestSequence === authSequenceRef.current
              ) {
                setLoading(false);
              }
            }
          }
        );
      } catch (persistenceError) {
        console.error(
          "Firebase auth persistence failed:",
          persistenceError
        );

        if (isMounted) {
          setUser(null);
          userRef.current = null;
          setRole(null);
          setError(
            "The browser could not save the login session. Enable site storage or try a normal browser window."
          );
          setLoading(false);
        }
      }
    }

    void initializeAuthentication();

    return () => {
      isMounted = false;
      authSequenceRef.current += 1;
      unsubscribe?.();
    };
  }, [resolveRole]);

  const value = useMemo<AuthContextType>(
    () => ({
      user,
      role,
      loading,
      error,
      isAuthenticated: Boolean(user),
      isAdmin: role === "admin",
      refreshRole,
    }),
    [user, role, loading, error, refreshRole]
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
