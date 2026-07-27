"use client";

import {
  getIdTokenResult,
  type User,
} from "firebase/auth";

import {
  validateRole,
  type UserRole,
} from "./permissions";

type AuthorizationPayload = {
  authorized?: boolean;
  message?: string;
  role?: string;
};

export async function authorizeAdminSession(
  user: User
): Promise<UserRole> {
  const idToken = await user.getIdToken();

  const response = await fetch(
    "/api/admin/authorize",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${idToken}`,
        "Content-Type": "application/json",
      },
      cache: "no-store",
    }
  );

  const payload = (await response
    .json()
    .catch(() => null)) as AuthorizationPayload | null;

  if (
    !response.ok ||
    payload?.authorized !== true
  ) {
    throw new Error(
      payload?.message ||
        "This account is not authorized to access the admin portal."
    );
  }

  /*
   * Firebase custom claims are included only in a newly
   * issued ID token. Force-refresh after the server sets them.
   */
  const refreshedTokenResult =
    await getIdTokenResult(user, true);

  if (
    refreshedTokenResult.claims.admin === true
  ) {
    return "admin";
  }

  return validateRole(
    refreshedTokenResult.claims.role
  );
}
