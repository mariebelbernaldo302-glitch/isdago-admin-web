import {
  getIdTokenResult,
  type IdTokenResult,
  type User,
} from "firebase/auth";

import { auth } from "./firebase";

export type UserRole =
  | "admin"
  | "vendor"
  | "customer"
  | null;

export type UserPermissionProfile = {
  uid: string;
  role: UserRole;
  status: string;
  isActive: boolean;
};

const ADMIN_TEST_MODE =
  process.env.NEXT_PUBLIC_ADMIN_TEST_MODE === "true" &&
  process.env.NODE_ENV !== "production";

const VALID_ROLES = [
  "admin",
  "vendor",
  "customer",
] as const;

type ValidRole = (typeof VALID_ROLES)[number];

export function isAdminTestMode() {
  return ADMIN_TEST_MODE;
}

export function validateRole(
  role: unknown
): UserRole {
  if (typeof role !== "string") {
    return null;
  }

  const normalizedRole =
    role.trim().toLowerCase();

  return VALID_ROLES.includes(
    normalizedRole as ValidRole
  )
    ? (normalizedRole as ValidRole)
    : null;
}

function getRoleFromClaims(
  tokenResult: IdTokenResult
): UserRole {
  const claims = tokenResult.claims;

  /*
   * The secure /api/admin/authorize route sets:
   *
   * admin: true
   * role: "admin"
   */
  if (claims.admin === true) {
    return "admin";
  }

  return validateRole(claims.role);
}

async function getCurrentUserRole(
  currentUser: User,
  forceRefresh = false
): Promise<UserRole> {
  const tokenResult = await getIdTokenResult(
    currentUser,
    forceRefresh
  );

  return getRoleFromClaims(tokenResult);
}

/**
 * Reads the authenticated user's role from Firebase
 * Authentication custom claims.
 *
 * It does not read users/{uid} from Realtime Database.
 */
export async function getUserPermissionProfile(
  uid: string,
  forceRefresh = false
): Promise<UserPermissionProfile | null> {
  const normalizedUid = uid.trim();

  if (!normalizedUid) {
    return null;
  }

  if (ADMIN_TEST_MODE) {
    return {
      uid: normalizedUid,
      role: "admin",
      status: "test-mode",
      isActive: true,
    };
  }

  const currentUser = auth.currentUser;

  /*
   * Do not use one signed-in user's token
   * to resolve another user's role.
   */
  if (
    !currentUser ||
    currentUser.uid !== normalizedUid
  ) {
    return null;
  }

  try {
    const role = await getCurrentUserRole(
      currentUser,
      forceRefresh
    );

    return {
      uid: currentUser.uid,
      role,
      status: role ? "active" : "unauthorized",
      isActive: Boolean(role),
    };
  } catch {
    /*
     * Do not use console.error for an expected
     * authorization-state failure.
     */
    return null;
  }
}

export async function getUserRole(
  uid: string,
  forceRefresh = false
): Promise<UserRole> {
  const profile =
    await getUserPermissionProfile(
      uid,
      forceRefresh
    );

  return profile?.role ?? null;
}

export async function refreshCurrentUserRole():
Promise<UserRole> {
  const currentUser = auth.currentUser;

  if (!currentUser) {
    return null;
  }

  return getUserRole(
    currentUser.uid,
    true
  );
}

export async function hasRole(
  uid: string,
  requiredRole: Exclude<UserRole, null>
) {
  const role = await getUserRole(uid);
  return role === requiredRole;
}

export async function hasAnyRole(
  uid: string,
  requiredRoles: Exclude<
    UserRole,
    null
  >[]
) {
  const role = await getUserRole(uid);

  return role
    ? requiredRoles.includes(role)
    : false;
}

export async function isAdmin(uid: string) {
  return hasRole(uid, "admin");
}

export async function isVendor(uid: string) {
  return hasRole(uid, "vendor");
}

export async function isCustomer(uid: string) {
  return hasRole(uid, "customer");
}