"use client";

import { auth } from "./firebase";
import { createRecord } from "./database";

type ActivityLogInput = {
  type: string;
  description: string;
  action?: string;
  module?: string;
  user?: string;
  userId?: string;
  role?: string;
  entityType?: string;
  entityId?: string;
  severity?: "info" | "warning" | "critical";
  metadata?: Record<string, unknown>;
};

function getCurrentUserLabel() {
  const currentUser = auth.currentUser;

  if (!currentUser) {
    return "System";
  }

  return (
    currentUser.displayName ||
    currentUser.email ||
    currentUser.uid ||
    "Administrator"
  );
}

export async function createActivityLog({
  type,
  description,
  action,
  module,
  user,
  userId,
  role = "admin",
  entityType,
  entityId,
  severity = "info",
  metadata = {},
}: ActivityLogInput) {
  const currentUser = auth.currentUser;
  const now = Date.now();

  return createRecord("activity_logs", {
    type,
    action: action || type,
    module: module || type,
    description,
    user: user || getCurrentUserLabel(),
    userId: userId || currentUser?.uid || "",
    role,
    entityType: entityType || "",
    entityId: entityId || "",
    source: "admin_web",
    severity,
    metadata,
    createdAt: now,
    updatedAt: now,
  });
}
