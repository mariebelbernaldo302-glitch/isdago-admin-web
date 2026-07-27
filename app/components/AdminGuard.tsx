"use client";

import {
  useEffect,
  useMemo,
} from "react";

import {
  usePathname,
  useRouter,
} from "next/navigation";

import {
  useAuth,
} from "../providers/AuthProvider";

type AdminGuardProps = {
  children: React.ReactNode;
  allowedRoles?: string[];
};

const DEFAULT_ALLOWED_ROLES = [
  "admin",
];

export default function AdminGuard({
  children,
  allowedRoles =
    DEFAULT_ALLOWED_ROLES,
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

  const accessAllowed = useMemo(
    () =>
      Boolean(
        user &&
        role &&
        allowedRoles.includes(role)
      ),
    [
      user,
      role,
      allowedRoles,
    ]
  );

  useEffect(() => {
    if (
      !initialized ||
      loading
    ) {
      return;
    }

    if (!user) {
      if (
        pathname !== "/login"
      ) {
        router.replace(
          "/login"
        );
      }

      return;
    }

    if (!accessAllowed) {
      if (
        pathname !== "/unauthorized"
      ) {
        router.replace(
          "/unauthorized"
        );
      }
    }
  }, [
    initialized,
    loading,
    user,
    accessAllowed,
    pathname,
    router,
  ]);

  if (
    !initialized ||
    loading
  ) {
    return (
      <div className="auth-loading">
        <div className="loader" />

        <h3>
          Restoring your admin session...
        </h3>

        <p>
          IsdaGo Admin
        </p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="auth-error">
        <h3>
          Authentication Error
        </h3>

        <p>{error}</p>

        <button
          className="btn btn-primary"
          type="button"
          onClick={() =>
            window.location.reload()
          }
        >
          Retry
        </button>
      </div>
    );
  }

  if (!accessAllowed) {
    return null;
  }

  return <>{children}</>;
}
