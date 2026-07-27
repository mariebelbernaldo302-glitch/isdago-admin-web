import {
  getAuth,
} from "firebase/auth";

import {
  getDatabase,
  push,
  ref,
  runTransaction,
  update,
} from "firebase/database";

export type NotificationSeverity =
  | "info"
  | "success"
  | "warning"
  | "critical";

export type NotificationRecipient = {
  id: string;
  role: string;
  name?: string;
  email?: string;
};

export type AppNotification = {
  id: string;
  receiverId: string;
  receiverRole: string;
  receiverName?: string;

  audience: string;
  title: string;
  message: string;
  type: string;
  category: string;
  severity: NotificationSeverity;

  status: "unread" | "read";
  read: boolean;
  readAt: number;

  senderId: string;
  senderRole: string;

  actionType: string;
  actionId: string;
  actionRoute: string;

  reportId: string;
  orderId: string;

  privacy: "private" | "standard";
  deliveryStatus: "delivered";

  createdAt: number;
  updatedAt: number;
};

export type ReportNotificationContext = {
  id: string;
  orderId?: unknown;
  reporterId?: unknown;
  reporterRole?: unknown;
  reporterName?: unknown;
  reportedUserId?: unknown;
  reportedUserRole?: unknown;
  reportedUserName?: unknown;
};

export type ReportNotificationStatus =
  | "reviewing"
  | "resolved"
  | "dismissed";

function asString(
  value: unknown,
  fallback = ""
): string {
  if (
    value === null ||
    value === undefined
  ) {
    return fallback;
  }

  const result = String(value).trim();

  return result || fallback;
}

function normalizeRole(
  value: unknown
): string {
  const role = asString(
    value,
    "customer"
  ).toLowerCase();

  if (role === "vendor") {
    return "vendor";
  }

  if (role === "admin") {
    return "admin";
  }

  return "customer";
}

function shortOrderId(
  value: unknown
): string {
  const id = asString(
    value,
    "UNKNOWN"
  ).toUpperCase();

  return id.length <= 8
    ? id
    : id.slice(-8);
}

function safeKey(
  value: string
): string {
  return value.replace(
    /[.#$[\]/]/g,
    "_"
  );
}

function buildNotification(
  recipient: NotificationRecipient,
  values: {
    title: string;
    message: string;
    type: string;
    category?: string;
    severity?: NotificationSeverity;
    audience?: string;
    actionType?: string;
    actionId?: string;
    actionRoute?: string;
    reportId?: string;
    orderId?: string;
    privacy?: "private" | "standard";
    now: number;
    notificationId: string;
  }
): AppNotification {
  const senderId =
    getAuth().currentUser?.uid ||
    "admin";

  return {
    id: values.notificationId,
    receiverId: recipient.id,
    receiverRole: normalizeRole(
      recipient.role
    ),
    receiverName: asString(
      recipient.name
    ),

    audience: asString(
      values.audience,
      normalizeRole(recipient.role)
    ),

    title: values.title.trim(),
    message: values.message.trim(),
    type: values.type.trim(),
    category: asString(
      values.category,
      "general"
    ),

    severity:
      values.severity || "info",

    status: "unread",
    read: false,
    readAt: 0,

    senderId,
    senderRole: "admin",

    actionType: asString(
      values.actionType
    ),

    actionId: asString(
      values.actionId
    ),

    actionRoute: asString(
      values.actionRoute
    ),

    reportId: asString(
      values.reportId
    ),

    orderId: asString(
      values.orderId
    ),

    privacy:
      values.privacy || "standard",

    deliveryStatus: "delivered",

    createdAt: values.now,
    updatedAt: values.now,
  };
}

function uniqueRecipients(
  recipients: NotificationRecipient[]
): NotificationRecipient[] {
  const result =
    new Map<string, NotificationRecipient>();

  recipients.forEach((recipient) => {
    const id = asString(recipient.id);

    if (!id) {
      return;
    }

    result.set(id, {
      ...recipient,
      id,
      role: normalizeRole(recipient.role),
    });
  });

  return [...result.values()];
}

function chunks<T>(
  values: T[],
  size: number
): T[][] {
  const result: T[][] = [];

  for (
    let index = 0;
    index < values.length;
    index += size
  ) {
    result.push(
      values.slice(index, index + size)
    );
  }

  return result;
}

/**
 * Sends one direct notification per recipient.
 *
 * Each notification is written to:
 * notifications/{notificationId}
 * user_notifications/{receiverId}/{notificationId}
 *
 * The second path is the fast mobile inbox.
 */
export async function sendNotifications(
  recipients: NotificationRecipient[],
  values: {
    title: string;
    message: string;
    type: string;
    category?: string;
    severity?: NotificationSeverity;
    audience?: string;
    actionType?: string;
    actionId?: string;
    actionRoute?: string;
    reportId?: string;
    orderId?: string;
    privacy?: "private" | "standard";
  }
): Promise<number> {
  const cleanRecipients =
    uniqueRecipients(recipients);

  if (cleanRecipients.length === 0) {
    throw new Error(
      "No valid notification recipients were found."
    );
  }

  const database = getDatabase();

  for (const group of chunks(
    cleanRecipients,
    250
  )) {
    const now = Date.now();
    const updates: Record<
      string,
      unknown
    > = {};

    group.forEach((recipient) => {
      const notificationId =
        push(
          ref(database, "notifications")
        ).key;

      if (!notificationId) {
        return;
      }

      const notification =
        buildNotification(
          recipient,
          {
            ...values,
            now,
            notificationId,
          }
        );

      updates[
        `notifications/${notificationId}`
      ] = notification;

      updates[
        `user_notifications/${recipient.id}/${notificationId}`
      ] = notification;
    });

    await update(
      ref(database),
      updates
    );
  }

  return cleanRecipients.length;
}

/**
 * Sends report lifecycle messages without exposing the reporter's identity.
 *
 * Notification policy:
 * - The reported user is not notified immediately when a report is submitted.
 * - The reported user receives a neutral notice only when an administrator
 *   starts the formal review.
 * - Both parties receive a final outcome notice.
 * - Repeated saves do not create duplicate notifications.
 */
export async function sendReportLifecycleNotifications(
  report: ReportNotificationContext,
  status: ReportNotificationStatus,
  publicMessage: string
): Promise<void> {
  const reportId = asString(report.id);

  if (!reportId) {
    return;
  }

  const database = getDatabase();

  const eventKey = safeKey(
    `${status}`
  );

  const eventReference = ref(
    database,
    `report_notification_events/${reportId}/${eventKey}`
  );

  const reservation =
    await runTransaction(
      eventReference,
      (currentValue) => {
        if (currentValue) {
          return;
        }

        return {
          reportId,
          status,
          createdAt: Date.now(),
          createdBy:
            getAuth().currentUser?.uid ||
            "admin",
        };
      },
      {
        applyLocally: false,
      }
    );

  if (!reservation.committed) {
    return;
  }

  const reporterId = asString(
    report.reporterId
  );

  const reportedUserId = asString(
    report.reportedUserId
  );

  const orderId = asString(
    report.orderId
  );

  const orderReference =
    shortOrderId(orderId);

  const safePublicMessage =
    publicMessage.trim();

  const reporter: NotificationRecipient = {
    id: reporterId,
    role: normalizeRole(
      report.reporterRole
    ),
    name: asString(
      report.reporterName
    ),
  };

  const reportedUser: NotificationRecipient = {
    id: reportedUserId,
    role: normalizeRole(
      report.reportedUserRole
    ),
    name: asString(
      report.reportedUserName
    ),
  };

  try {
    if (status === "reviewing") {
      const deliveries: Promise<number>[] = [];

      if (reporterId) {
        deliveries.push(
          sendNotifications(
            [reporter],
            {
              title: "Your report is under review",
              message:
                `An administrator has started reviewing your report for order #${orderReference}. You will receive another notification when the review is complete.`,
              type: "safety_report_reviewing",
              category: "trust_and_safety",
              severity: "info",
              audience: reporter.role,
              actionType:
                "open_report_status",
              actionId: reportId,
              actionRoute:
                `/reports/${reportId}`,
              reportId,
              orderId,
              privacy: "private",
            }
          )
        );
      }

      if (reportedUserId) {
        deliveries.push(
          sendNotifications(
            [reportedUser],
            {
              title:
                "Marketplace conduct review",
              message:
                `A conduct review has started for order #${orderReference}. No penalty has been applied at this stage. Please keep all marketplace communication respectful.`,
              type: "safety_review_notice",
              category: "trust_and_safety",
              severity: "warning",
              audience: reportedUser.role,
              actionType: "open_order",
              actionId: orderId,
              actionRoute:
                `/orders/${orderId}`,
              reportId,
              orderId,
              privacy: "private",
            }
          )
        );
      }

      await Promise.all(deliveries);
      return;
    }

    const resolved =
      status === "resolved";

    const outcome =
      safePublicMessage ||
      (
        resolved
          ? "The administrator completed the review."
          : "The administrator completed the review and closed the case without further action."
      );

    const deliveries: Promise<number>[] = [];

    if (reporterId) {
      deliveries.push(
        sendNotifications(
          [reporter],
          {
            title: resolved
              ? "Report review completed"
              : "Report review closed",
            message:
              `The review for order #${orderReference} is complete. ${outcome}`,
            type: resolved
              ? "safety_report_resolved"
              : "safety_report_dismissed",
            category: "trust_and_safety",
            severity: resolved
              ? "success"
              : "info",
            audience: reporter.role,
            actionType:
              "open_report_status",
            actionId: reportId,
            actionRoute:
              `/reports/${reportId}`,
            reportId,
            orderId,
            privacy: "private",
          }
        )
      );
    }

    if (reportedUserId) {
      deliveries.push(
        sendNotifications(
          [reportedUser],
          {
            title: resolved
              ? "Conduct review completed"
              : "Conduct review closed",
            message:
              `The conduct review connected to order #${orderReference} is complete. ${outcome}`,
            type: resolved
              ? "safety_review_resolved"
              : "safety_review_dismissed",
            category: "trust_and_safety",
            severity: resolved
              ? "warning"
              : "info",
            audience: reportedUser.role,
            actionType: "open_order",
            actionId: orderId,
            actionRoute:
              `/orders/${orderId}`,
            reportId,
            orderId,
            privacy: "private",
          }
        )
      );
    }

    await Promise.all(deliveries);

  } catch (error) {
    /*
     * Release the event reservation so an administrator can retry.
     */
    await update(
      ref(database),
      {
        [`report_notification_events/${reportId}/${eventKey}`]:
          null,
      }
    );

    throw error;
  }
}

export async function markNotificationRead(
  notification: {
    id: string;
    receiverId?: string;
  }
): Promise<void> {
  const notificationId =
    asString(notification.id);

  const receiverId =
    asString(notification.receiverId);

  if (!notificationId) {
    return;
  }

  const now = Date.now();
  const updates: Record<
    string,
    unknown
  > = {
    [`notifications/${notificationId}/read`]:
      true,

    [`notifications/${notificationId}/status`]:
      "read",

    [`notifications/${notificationId}/readAt`]:
      now,

    [`notifications/${notificationId}/updatedAt`]:
      now,
  };

  if (receiverId) {
    updates[
      `user_notifications/${receiverId}/${notificationId}/read`
    ] = true;

    updates[
      `user_notifications/${receiverId}/${notificationId}/status`
    ] = "read";

    updates[
      `user_notifications/${receiverId}/${notificationId}/readAt`
    ] = now;

    updates[
      `user_notifications/${receiverId}/${notificationId}/updatedAt`
    ] = now;
  }

  await update(
    ref(getDatabase()),
    updates
  );
}

export async function deleteNotificationEverywhere(
  notification: {
    id: string;
    receiverId?: string;
  }
): Promise<void> {
  const notificationId =
    asString(notification.id);

  const receiverId =
    asString(notification.receiverId);

  if (!notificationId) {
    return;
  }

  const updates: Record<
    string,
    unknown
  > = {
    [`notifications/${notificationId}`]:
      null,
  };

  if (receiverId) {
    updates[
      `user_notifications/${receiverId}/${notificationId}`
    ] = null;
  }

  await update(
    ref(getDatabase()),
    updates
  );
}
