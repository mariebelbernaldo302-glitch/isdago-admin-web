"use client";

import { createActivityLog } from "./activity";
import { updatePaths } from "./database";

export type ModeratedRole = "customer" | "vendor";
export type EnforcementStatus = "active" | "suspended" | "disabled";

export type ModerationDecision = {
  reasonCode: string;
  reasonLabel: string;
  details: string;
  suspensionDays?: number | null;
};

type ModerateAccountInput = ModerationDecision & {
  uid: string;
  profileId: string;
  profileName: string;
  role: ModeratedRole;
  status: EnforcementStatus;
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

function buildUserMessage(
  status: EnforcementStatus,
  reasonLabel: string,
  details: string,
  suspendedUntil: number | null,
) {
  if (status === "active") {
    return "Your IsdaGo marketplace access has been restored.";
  }

  if (status === "disabled") {
    return `Your IsdaGo account has been disabled. Reason: ${reasonLabel}${
      details ? ` — ${details}` : ""
    }`;
  }

  const returnDate = suspendedUntil
    ? new Date(suspendedUntil).toLocaleString("en-PH", {
        dateStyle: "medium",
        timeStyle: "short",
      })
    : "the date set by the administrator";

  return `Your IsdaGo account is temporarily suspended until ${returnDate}. Reason: ${reasonLabel}${
    details ? ` — ${details}` : ""
  }`;
}

/**
 * Applies a moderation decision to both the generic user record and the
 * role-specific profile. Suspensions are temporary and carry an exact expiry
 * timestamp so the Android app can explain when access becomes available.
 */
export async function moderateAccount({
  uid,
  profileId,
  profileName,
  role,
  status,
  reasonCode,
  reasonLabel,
  details,
  suspensionDays = null,
  relatedProductIds = [],
}: ModerateAccountInput) {
  const normalizedUid = clean(uid);
  const normalizedProfileId = clean(profileId) || normalizedUid;
  const normalizedName = clean(profileName) || `${role} account`;
  const normalizedReasonCode = clean(reasonCode);
  const normalizedReasonLabel = clean(reasonLabel);
  const normalizedDetails = clean(details);

  if (!normalizedUid) {
    throw new Error("The account UID is missing.");
  }

  if (status !== "active" && normalizedReasonLabel.length < 3) {
    throw new Error("Choose a clear reason for this moderation action.");
  }

  if (status === "suspended") {
    const days = Number(suspensionDays);

    if (!Number.isFinite(days) || days < 1 || days > 365) {
      throw new Error("Choose a suspension duration between 1 and 365 days.");
    }
  }

  const now = Date.now();
  const normalizedSuspensionDays =
    status === "suspended" ? Math.round(Number(suspensionDays)) : null;
  const suspendedUntil = normalizedSuspensionDays
    ? now + normalizedSuspensionDays * 24 * 60 * 60 * 1000
    : null;
  const profilePath = role === "vendor" ? "vendors" : "customers";
  const action = getActionLabel(status);
  const noticeMessage = buildUserMessage(
    status,
    normalizedReasonLabel,
    normalizedDetails,
    suspendedUntil,
  );

  const commonModerationData: Record<string, unknown> = {
    moderationStatus: status,
    moderationReasonCode: normalizedReasonCode || null,
    moderationReason: normalizedReasonLabel || null,
    moderationDetails: normalizedDetails || null,
    moderationMessage: noticeMessage,
    moderatedAt: now,
    updatedAt: now,
  };

  const updates: Record<string, unknown> = {
    [`users/${normalizedUid}/status`]: status,
    [`users/${normalizedUid}/accountStatus`]: status,
    [`${profilePath}/${normalizedProfileId}/status`]: status,
    [`${profilePath}/${normalizedProfileId}/accountStatus`]: status,
  };

  Object.entries(commonModerationData).forEach(([key, value]) => {
    updates[`users/${normalizedUid}/${key}`] = value;
    updates[`${profilePath}/${normalizedProfileId}/${key}`] = value;
  });

  if (status === "active") {
    updates[`users/${normalizedUid}/suspendedAt`] = null;
    updates[`users/${normalizedUid}/suspendedUntil`] = null;
    updates[`users/${normalizedUid}/suspensionDays`] = null;
    updates[`users/${normalizedUid}/disabledAt`] = null;
    updates[`${profilePath}/${normalizedProfileId}/suspendedAt`] = null;
    updates[`${profilePath}/${normalizedProfileId}/suspendedUntil`] = null;
    updates[`${profilePath}/${normalizedProfileId}/suspensionDays`] = null;
    updates[`${profilePath}/${normalizedProfileId}/disabledAt`] = null;
  } else if (status === "suspended") {
    updates[`users/${normalizedUid}/suspendedAt`] = now;
    updates[`users/${normalizedUid}/suspendedUntil`] = suspendedUntil;
    updates[`users/${normalizedUid}/suspensionDays`] = normalizedSuspensionDays;
    updates[`users/${normalizedUid}/disabledAt`] = null;
    updates[`${profilePath}/${normalizedProfileId}/suspendedAt`] = now;
    updates[`${profilePath}/${normalizedProfileId}/suspendedUntil`] = suspendedUntil;
    updates[`${profilePath}/${normalizedProfileId}/suspensionDays`] = normalizedSuspensionDays;
    updates[`${profilePath}/${normalizedProfileId}/disabledAt`] = null;
  } else {
    updates[`users/${normalizedUid}/suspendedAt`] = null;
    updates[`users/${normalizedUid}/suspendedUntil`] = null;
    updates[`users/${normalizedUid}/suspensionDays`] = null;
    updates[`users/${normalizedUid}/disabledAt`] = now;
    updates[`${profilePath}/${normalizedProfileId}/suspendedAt`] = null;
    updates[`${profilePath}/${normalizedProfileId}/suspendedUntil`] = null;
    updates[`${profilePath}/${normalizedProfileId}/suspensionDays`] = null;
    updates[`${profilePath}/${normalizedProfileId}/disabledAt`] = now;
  }

  if (role === "vendor" && status !== "active") {
    relatedProductIds.filter(Boolean).forEach((productId) => {
      updates[`products/${productId}/status`] = "inactive";
      updates[`products/${productId}/availability`] = "inactive";
      updates[`products/${productId}/available`] = false;
      updates[`products/${productId}/isAvailable`] = false;
      updates[`products/${productId}/adminSuspended`] = true;
      updates[`products/${productId}/moderationReason`] = normalizedReasonLabel;
      updates[`products/${productId}/moderationDetails`] = normalizedDetails || null;
      updates[`products/${productId}/updatedAt`] = now;
    });
  }

  const notificationId = `moderation_${now}`;
  updates[`user_notifications/${normalizedUid}/${notificationId}`] = {
    id: notificationId,
    title:
      status === "active"
        ? "Account access restored"
        : status === "disabled"
          ? "Account disabled"
          : "Account temporarily suspended",
    message: noticeMessage,
    type: "account_moderation",
    status: "unread",
    read: false,
    createdAt: now,
    updatedAt: now,
    moderationStatus: status,
    moderationReason: normalizedReasonLabel || null,
    moderationDetails: normalizedDetails || null,
    suspendedUntil,
  };

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
        reasonCode: normalizedReasonCode,
        reason: normalizedReasonLabel,
        details: normalizedDetails,
        suspensionDays: normalizedSuspensionDays,
        suspendedUntil,
        deactivatedProductCount:
          role === "vendor" && status !== "active"
            ? relatedProductIds.length
            : 0,
      },
    });
  } catch (logError) {
    console.error(
      "Account updated, but the audit event could not be written:",
      logError,
    );
  }

  return {
    suspendedUntil,
    suspensionDays: normalizedSuspensionDays,
  };
}
