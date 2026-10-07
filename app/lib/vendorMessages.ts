import { getAuth } from "firebase/auth";
import { getDatabase, push, ref, update } from "firebase/database";

import { sendNotifications } from "./notificationFlow";
import type { ComplianceMessage } from "./priceCompliance";

/**
 * Vendor ↔ admin messaging helpers.
 * Uses the existing `price_compliance_messages` node, so the vendor app
 * does not need any change.
 */

export type VendorThread = {
  vendorId: string;
  vendorName: string;
  messages: ComplianceMessage[]; // oldest -> newest
  last: ComplianceMessage;
  unread: number;
};

export function isUnreadVendorMessage(m: ComplianceMessage): boolean {
  return m.senderRole === "vendor" && m.status === "unread";
}

/** Group every message by vendor (Messenger-style conversation list). */
export function buildThreads(messages: ComplianceMessage[]): VendorThread[] {
  const map = new Map<string, ComplianceMessage[]>();

  for (const m of messages) {
    if (!m.vendorId) continue;
    const list = map.get(m.vendorId);
    if (list) list.push(m);
    else map.set(m.vendorId, [m]);
  }

  const threads: VendorThread[] = [];

  map.forEach((list, vendorId) => {
    list.sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
    const last = list[list.length - 1];
    const named = [...list].reverse().find((m) => m.vendorName?.trim());

    threads.push({
      vendorId,
      vendorName: named?.vendorName?.trim() || "Vendor",
      messages: list,
      last,
      unread: list.filter(isUnreadVendorMessage).length,
    });
  });

  return threads.sort(
    (a, b) => (b.last.createdAt || 0) - (a.last.createdAt || 0),
  );
}

/** Admin -> vendor message. caseId / product are optional (general message). */
export async function sendAdminMessageToVendor(input: {
  vendorId: string;
  vendorName: string;
  message: string;
  caseId?: string;
  productId?: string;
  productName?: string;
}): Promise<void> {
  const text = input.message.trim();
  if (!text) throw new Error("Message is required.");
  if (!input.vendorId) throw new Error("Vendor is required.");

  const database = getDatabase();
  const now = Date.now();
  const caseId = input.caseId || "";
  const productId = input.productId || "";
  const productName = input.productName || "";

  const msgId = push(ref(database, "price_compliance_messages")).key;
  if (!msgId) throw new Error("Unable to create message id.");

  const payload: ComplianceMessage = {
    id: msgId,
    caseId,
    productId,
    productName,
    vendorId: input.vendorId,
    vendorName: input.vendorName,
    message: text,
    senderRole: "admin",
    createdAt: now,
    status: "sent",
  };

  const updates: Record<string, unknown> = {
    [`price_compliance_messages/${msgId}`]: payload,
  };

  if (caseId) {
    updates[`price_compliance/${caseId}/lastVendorMessageAt`] = now;
    updates[`price_compliance/${caseId}/updatedAt`] = now;
  }

  await update(ref(database), updates);

  // Vendor inbox notification (same type/action the vendor app already handles).
  try {
    await sendNotifications(
      [{ id: input.vendorId, role: "vendor", name: input.vendorName }],
      {
        title: productName ? `Admin reply: ${productName}` : "Message from admin",
        message: text,
        type: "price_compliance",
        category: "price",
        severity: "info",
        actionType: "message_admin_price",
        actionId: caseId,
        orderId: productId,
      },
    );
  } catch (error) {
    console.error("Message saved but vendor notification failed:", error);
  }
}

/** Mark all unread vendor messages in a thread as read. */
export async function markThreadRead(
  messages: ComplianceMessage[],
): Promise<void> {
  const updates: Record<string, unknown> = {};

  for (const m of messages) {
    if (isUnreadVendorMessage(m)) {
      updates[`price_compliance_messages/${m.id}/status`] = "read";
    }
  }

  if (Object.keys(updates).length === 0) return;

  // keep a reference to auth so a signed-out admin fails fast
  if (!getAuth().currentUser) return;

  await update(ref(getDatabase()), updates);
}
