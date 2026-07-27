"use client";

import { useEffect } from "react";
import {
  usePathname,
  useRouter,
} from "next/navigation";

import type { UserRole } from "../lib/permissions";
import { useAuth } from "../providers/AuthProvider";

type AllowedRole = Exclude<UserRole, null>;

type AdminGuardProps = {
  children: React.ReactNode;
  allowedRoles?: readonly AllowedRole[];
};

const DEFAULT_ALLOWED_ROLES: readonly AllowedRole[] = [
  "admin",
];

export default function AdminGuard({
  children,
  allowedRoles = DEFAULT_ALLOWED_ROLES,
}: AdminGuardProps) {
  const {
    user,
    role,
    loading,
    error,
  } = useAuth();

  const router = useRouter();
  const pathname = usePathname();

  const isAllowed =
    Boolean(role) &&
    allowedRoles.includes(role as AllowedRole);

  useEffect(() => {
    // Never redirect while Firebase is restoring persistence or
    // refreshing an ID token/custom claim.
    if (loading || error) {
      return;
    }

    if (!user) {
      if (pathname !== "/login") {
        router.replace("/login");
      }
      return;
    }

    if (!isAllowed && pathname !== "/unauthorized") {
      router.replace("/unauthorized");
    }
  }, [
    user,
    loading,
    error,
    isAllowed,
    pathname,
    router,
  ]);

  if (loading) {
    return (
      <div className="auth-loading">
        <div className="loader" />
        <h3>Checking account permission...</h3>
        <p>IsdaGo Admin</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="auth-error">
        <h3>Authentication Error</h3>
        <p>{error}</p>
      </div>
    );
  }

  if (!user || !isAllowed) {
    return null;
  }

  return <>{children}</>;
}
