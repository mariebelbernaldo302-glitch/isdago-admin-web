"use client";

import { createActivityLog } from "./activity";
import { updatePaths } from "./database";

export type ModeratedRole = "customer" | "vendor";
export type EnforcementStatus = "active" | "suspended" | "disabled";

type ModerateAccountInput = {
  uid: string;
  profileId: string;
  profileName: string;
  role: ModeratedRole;
  status: EnforcementStatus;
  reason: string;
  relatedProductIds?: string[];
};

function clean(value: string) {
  return String(value || "").trim();
}

function getActionLabel(status: EnforcementStatus) {
  if (status === "active") {
    return "restored";
  }

  if (status === "disabled") {
    return "disabled";
  }

  return "suspended";
}

/**
 * Restricts or restores a marketplace account without destroying evidence.
 * Firebase Authentication deletion is intentionally not attempted in the
 * browser; permanent Auth deletion requires a protected Admin SDK endpoint.
 */
export async function moderateAccount({
  uid,
  profileId,
  profileName,
  role,
  status,
  reason,
  relatedProductIds = [],
}: ModerateAccountInput) {
  const normalizedUid = clean(uid);
  const normalizedProfileId = clean(profileId) || normalizedUid;
  const normalizedName = clean(profileName) || `${role} account`;
  const normalizedReason = clean(reason);

  if (!normalizedUid) {
    throw new Error("The account UID is missing.");
  }

  if (status !== "active" && normalizedReason.length < 5) {
    throw new Error("Enter a clear moderation reason of at least 5 characters.");
  }

  const now = Date.now();
  const profilePath = role === "vendor" ? "vendors" : "customers";
  const action = getActionLabel(status);
  const updates: Record<string, unknown> = {
    [`users/${normalizedUid}/status`]: status,
    [`users/${normalizedUid}/accountStatus`]: status,
    [`users/${normalizedUid}/moderationStatus`]: status,
    [`users/${normalizedUid}/moderationReason`]: normalizedReason || null,
    [`users/${normalizedUid}/moderatedAt`]: now,
    [`users/${normalizedUid}/updatedAt`]: now,

    [`${profilePath}/${normalizedProfileId}/status`]: status,
    [`${profilePath}/${normalizedProfileId}/moderationStatus`]: status,
    [`${profilePath}/${normalizedProfileId}/moderationReason`]:
      normalizedReason || null,
    [`${profilePath}/${normalizedProfileId}/moderatedAt`]: now,
    [`${profilePath}/${normalizedProfileId}/updatedAt`]: now,
  };

  if (status === "active") {
    updates[`users/${normalizedUid}/suspendedAt`] = null;
    updates[`users/${normalizedUid}/disabledAt`] = null;
    updates[`${profilePath}/${normalizedProfileId}/suspendedAt`] = null;
    updates[`${profilePath}/${normalizedProfileId}/disabledAt`] = null;
  } else if (status === "suspended") {
    updates[`users/${normalizedUid}/suspendedAt`] = now;
    updates[`${profilePath}/${normalizedProfileId}/suspendedAt`] = now;
  } else {
    updates[`users/${normalizedUid}/disabledAt`] = now;
    updates[`${profilePath}/${normalizedProfileId}/disabledAt`] = now;
  }

  if (role === "vendor" && status !== "active") {
    relatedProductIds.filter(Boolean).forEach((productId) => {
      updates[`products/${productId}/status`] = "inactive";
      updates[`products/${productId}/availability`] = "inactive";
      updates[`products/${productId}/available`] = false;
      updates[`products/${productId}/isAvailable`] = false;
      updates[`products/${productId}/adminSuspended`] = true;
      updates[`products/${productId}/moderationReason`] = normalizedReason;
      updates[`products/${productId}/updatedAt`] = now;
    });
  }

  await updatePaths(updates);

  try {
    await createActivityLog({
      type: "Account Enforcement",
      action: `account_${action}`,
      module: "Trust and Safety",
      description: `${normalizedName} (${role}) was ${action} by an administrator.`,
      entityType: role,
      entityId: normalizedUid,
      severity: status === "active" ? "info" : "critical",
      metadata: {
        targetUserId: normalizedUid,
        targetRole: role,
        status,
        reason: normalizedReason,
        deactivatedProductCount:
          role === "vendor" && status !== "active"
            ? relatedProductIds.length
            : 0,
      },
    });
  } catch (logError) {
    console.error("Account updated, but the audit event could not be written:", logError);
  }
}
