"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  onIdTokenChanged,
  type User,
} from "firebase/auth";

import { auth } from "../lib/firebase";
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
    currentUserOverride?: User | null
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
  const [error, setError] = useState<string | null>(
    null
  );

  const loadRole = useCallback(
    async (currentUser: User): Promise<UserRole> => {
      try {
        setError(null);

        const resolvedRole = await getUserRole(
          currentUser.uid
        );

        if (isValidRole(resolvedRole)) {
          setRole(resolvedRole);
          return resolvedRole;
        }

        setRole(null);
        return null;
      } catch (roleError) {
        console.error(
          "Role loading error:",
          roleError
        );
        setError("Unable to verify user permission.");
        setRole(null);
        return null;
      }
    },
    []
  );

  const refreshRole = useCallback(
    async (
      currentUserOverride?: User | null
    ): Promise<UserRole> => {
      const targetUser =
        currentUserOverride ?? user;

      if (!targetUser) {
        setRole(null);
        return null;
      }

      return loadRole(targetUser);
    },
    [user, loadRole]
  );

  useEffect(() => {
    let isMounted = true;

    /*
     * onIdTokenChanged also reacts when custom claims are
     * refreshed, which is useful after server authorization.
     */
    const unsubscribe = onIdTokenChanged(
      auth,
      async (currentUser) => {
        if (!isMounted) {
          return;
        }

        setLoading(true);
        setError(null);
        setUser(currentUser);

        if (!currentUser) {
          setRole(null);
          setLoading(false);
          return;
        }

        await loadRole(currentUser);

        if (isMounted) {
          setLoading(false);
        }
      }
    );

    return () => {
      isMounted = false;
      unsubscribe();
    };
  }, [loadRole]);

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
    [
      user,
      role,
      loading,
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
