"use client";

import {
  getIdTokenResult,
  type User,
} from "firebase/auth";

import {
  validateRole,
  type UserRole,
} from "./permissions";

type AdminAuthorizationResponse = {
  authorized?: boolean;
  message?: string;
  role?: string;
};

const AUTHORIZATION_TIMEOUT_MS = 15000;

export async function authorizeAdminSession(
  user: User
): Promise<UserRole> {
  const controller = new AbortController();
  const timeoutId = window.setTimeout(
    () => controller.abort(),
    AUTHORIZATION_TIMEOUT_MS
  );

  try {
    const idToken = await user.getIdToken();

    const response = await fetch("/api/admin/authorize", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${idToken}`,
        "Content-Type": "application/json",
      },
      cache: "no-store",
      signal: controller.signal,
    });

    const payload = (await response
      .json()
      .catch(() => null)) as AdminAuthorizationResponse | null;

    if (!response.ok || payload?.authorized !== true) {
      throw new Error(
        payload?.message ||
          "This account is not authorized to access the admin portal."
      );
    }

    /*
     * The server may have just assigned custom claims. Force one token
     * refresh, then read the newly issued claims.
     */
    await user.getIdToken(true);
    const tokenResult = await getIdTokenResult(user);

    if (tokenResult.claims.admin === true) {
      return "admin";
    }

    return validateRole(tokenResult.claims.role);
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new Error(
        "Admin verification took too long. Please check the Vercel server configuration and try again."
      );
    }

    throw error;
  } finally {
    window.clearTimeout(timeoutId);
  }
}
