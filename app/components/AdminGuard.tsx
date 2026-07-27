"use client";

import { useEffect } from "react";
import {
  usePathname,
  useRouter,
} from "next/navigation";

import { useAuth } from "../providers/AuthProvider";

const ADMIN_ROLES = ["admin"] as const;

type AdminGuardProps = {
  children: React.ReactNode;
  allowedRoles?: readonly string[];
};

export default function AdminGuard({
  children,
  allowedRoles = ADMIN_ROLES,
}: AdminGuardProps) {
  const {
    user,
    role,
    loading,
    initialized,
    error,
  } = useAuth();

  const router = useRouter();
  const pathname = usePathname();

  const allowed = Boolean(
    user && role && allowedRoles.includes(role)
  );

  useEffect(() => {
    if (!initialized || loading) {
      return;
    }

    if (!user) {
      if (pathname !== "/login") {
        router.replace("/login");
      }
      return;
    }

    if (!allowed && pathname !== "/unauthorized") {
      router.replace("/unauthorized");
    }
  }, [
    initialized,
    loading,
    user,
    allowed,
    pathname,
    router,
  ]);

  if (!initialized || loading) {
    return (
      <div className="auth-loading">
        <div className="loader" />
        <h3>Restoring your admin session...</h3>
        <p>IsdaGo Admin</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="auth-error">
        <h3>Authentication Error</h3>
        <p>{error}</p>
        <button
          className="btn btn-primary"
          type="button"
          onClick={() => window.location.reload()}
        >
          Retry
        </button>
      </div>
    );
  }

  if (!allowed) {
    return null;
  }

  return <>{children}</>;
}
