"use client";

import {
  FormEvent,
  useMemo,
  useState,
} from "react";

import {
  Bell,
  BellRing,
  CheckCircle2,
  Plus,
  Search,
  Send,
  ShieldCheck,
  Trash2,
  UserRound,
  Users,
  X,
} from "lucide-react";

import DashboardShell from "../components/DashboardShell";
import EmptyState from "../components/EmptyState";
import SectionCard from "../components/SectionCard";
import StatCard from "../components/StatCard";
import StatusBadge from "../components/StatusBadge";

import {
  createActivityLog,
} from "../lib/activity";

import {
  deleteNotificationEverywhere,
  markNotificationRead,
  sendNotifications,
} from "../lib/notificationFlow";

import type {
  NotificationRecipient,
  NotificationSeverity,
} from "../lib/notificationFlow";

import {
  formatNumber,
  normalizeStatus,
} from "../lib/format";

import type {
  NotificationRecord,
} from "../lib/types";

import {
  useRealtimeCollection,
} from "../lib/useFirestoreCollection";

import styles from "./page.module.css";

type MarketplaceUser =
  Record<string, unknown> & {
    id: string;
    uid?: string;
    name?: string;
    fullName?: string;
    displayName?: string;
    storeName?: string;
    email?: string;
    role?: string;
    userType?: string;
    accountType?: string;
  };

type AppNotificationRecord =
  NotificationRecord & {
    receiverId?: string;
    receiverRole?: string;
    receiverName?: string;

    audience?: string;
    category?: string;
    severity?: NotificationSeverity;

    senderId?: string;
    senderRole?: string;
    deliveryStatus?: string;

    actionType?: string;
    actionId?: string;
    actionRoute?: string;

    reportId?: string;
    orderId?: string;

    type?: string;
    status?: string;
    read?: boolean;

    createdAt?: unknown;
    updatedAt?: unknown;
    readAt?: unknown;
    date?: unknown;
  };

type TargetMode =
  | "all"
  | "customers"
  | "vendors"
  | "admins"
  | "specific";

type NotificationFormState = {
  title: string;
  message: string;
  targetMode: TargetMode;
  receiverId: string;
  receiverRole: string;
  type: string;
  severity: NotificationSeverity;
  actionRoute: string;
};

type NotificationFilter =
  | "all"
  | "unread"
  | "read"
  | "trust_and_safety"
  | "order_update"
  | "system";

const initialNotificationForm:
  NotificationFormState = {
    title: "",
    message: "",
    targetMode: "all",
    receiverId: "",
    receiverRole: "customer",
    type: "system",
    severity: "info",
    actionRoute: "",
  };

const FILTERS: Array<{
  label: string;
  value: NotificationFilter;
}> = [
  {
    label: "All notifications",
    value: "all",
  },
  {
    label: "Unread",
    value: "unread",
  },
  {
    label: "Read",
    value: "read",
  },
  {
    label: "Trust & Safety",
    value: "trust_and_safety",
  },
  {
    label: "Order updates",
    value: "order_update",
  },
  {
    label: "System",
    value: "system",
  },
];

const TYPE_OPTIONS = [
  "system",
  "order_update",
  "vendor_update",
  "product_update",
  "payment_update",
  "trust_and_safety",
  "announcement",
];

const TARGET_OPTIONS: Array<{
  value: TargetMode;
  label: string;
}> = [
  {
    value: "all",
    label: "All users",
  },
  {
    value: "customers",
    label: "All customers",
  },
  {
    value: "vendors",
    label: "All vendors",
  },
  {
    value: "admins",
    label: "All administrators",
  },
  {
    value: "specific",
    label: "Specific account",
  },
];

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
  const role = normalizeStatus(
    asString(value, "customer")
  );

  if (role === "vendor") {
    return "vendor";
  }

  if (role === "admin") {
    return "admin";
  }

  return "customer";
}

function getUserId(
  user: MarketplaceUser
): string {
  return asString(
    user.uid,
    user.id
  );
}

function getUserName(
  user: MarketplaceUser
): string {
  return asString(
    user.storeName,
    asString(
      user.displayName,
      asString(
        user.fullName,
        asString(
          user.name,
          asString(
            user.email,
            getUserId(user)
          )
        )
      )
    )
  );
}

function getUserRole(
  user: MarketplaceUser,
  fallback = "customer"
): string {
  return normalizeRole(
    asString(
      user.role,
      asString(
        user.userType,
        asString(
          user.accountType,
          fallback
        )
      )
    )
  );
}

function toRecipient(
  user: MarketplaceUser,
  fallbackRole: string
): NotificationRecipient {
  return {
    id: getUserId(user),
    role: getUserRole(
      user,
      fallbackRole
    ),
    name: getUserName(user),
    email: asString(user.email),
  };
}

function getNotificationTitle(
  notification: AppNotificationRecord
): string {
  return asString(
    notification.title,
    "Notification"
  );
}

function getNotificationMessage(
  notification: AppNotificationRecord
): string {
  return asString(
    notification.message,
    "No message provided."
  );
}

function getNotificationStatus(
  notification: AppNotificationRecord
): string {
  if (notification.read === true) {
    return "read";
  }

  return normalizeStatus(
    asString(
      notification.status,
      "unread"
    )
  );
}

function getNotificationType(
  notification: AppNotificationRecord
): string {
  return normalizeStatus(
    asString(
      notification.category,
      asString(
        notification.type,
        "system"
      )
    )
  );
}

function getNotificationDateValue(
  notification: AppNotificationRecord
): unknown {
  return (
    notification.createdAt ??
    notification.updatedAt ??
    notification.date ??
    notification.readAt ??
    null
  );
}

function toNotificationDate(
  value: unknown
): Date | null {
  if (value instanceof Date) {
    return Number.isNaN(value.getTime())
      ? null
      : value;
  }

  if (typeof value === "number") {
    const date = new Date(value);

    return Number.isNaN(date.getTime())
      ? null
      : date;
  }

  if (typeof value === "string") {
    const trimmed = value.trim();

    if (!trimmed) {
      return null;
    }

    const numericValue = Number(trimmed);

    if (Number.isFinite(numericValue)) {
      const numericDate = new Date(numericValue);

      if (!Number.isNaN(numericDate.getTime())) {
        return numericDate;
      }
    }

    const parsedDate = new Date(trimmed);

    return Number.isNaN(parsedDate.getTime())
      ? null
      : parsedDate;
  }

  if (
    value !== null &&
    typeof value === "object"
  ) {
    const timestamp =
      value as Record<string, unknown>;

    const seconds =
      typeof timestamp.seconds === "number"
        ? timestamp.seconds
        : typeof timestamp._seconds === "number"
          ? timestamp._seconds
          : null;

    const nanoseconds =
      typeof timestamp.nanoseconds === "number"
        ? timestamp.nanoseconds
        : typeof timestamp._nanoseconds === "number"
          ? timestamp._nanoseconds
          : 0;

    if (seconds !== null) {
      const milliseconds =
        seconds * 1000 +
        Math.floor(nanoseconds / 1_000_000);

      const date = new Date(milliseconds);

      return Number.isNaN(date.getTime())
        ? null
        : date;
    }
  }

  return null;
}

function getCreatedTime(
  notification: AppNotificationRecord
): number {
  const date = toNotificationDate(
    getNotificationDateValue(notification)
  );

  return date
    ? date.getTime()
    : 0;
}

function formatNotificationDate(
  notification: AppNotificationRecord
): string {
  const date = toNotificationDate(
    getNotificationDateValue(notification)
  );

  if (!date) {
    return "Date unavailable";
  }

  return new Intl.DateTimeFormat(
    "en-PH",
    {
      dateStyle: "medium",
      timeStyle: "short",
    }
  ).format(date);
}

function isUnread(
  notification: AppNotificationRecord
): boolean {
  return (
    notification.read === false ||
    getNotificationStatus(
      notification
    ) === "unread"
  );
}

function recipientLabel(
  notification: AppNotificationRecord
): string {
  const name = asString(
    notification.receiverName
  );

  const role = normalizeRole(
    notification.receiverRole
  );

  if (name) {
    return `${name} • ${role}`;
  }

  const receiverId = asString(
    notification.receiverId
  );

  return receiverId
    ? `${role} • ${receiverId}`
    : asString(
        notification.audience,
        "All users"
      );
}

export default function NotificationsPage() {
  const [search, setSearch] =
    useState("");

  const [
    notificationFilter,
    setNotificationFilter,
  ] = useState<NotificationFilter>(
    "all"
  );

  const [
    notificationForm,
    setNotificationForm,
  ] = useState<NotificationFormState>(
    initialNotificationForm
  );

  const [isModalOpen, setIsModalOpen] =
    useState(false);

  const [isSubmitting, setIsSubmitting] =
    useState(false);

  const [processingId, setProcessingId] =
    useState<string | null>(null);

  const [feedback, setFeedback] =
    useState("");

  const notificationsQuery =
    useRealtimeCollection<AppNotificationRecord>(
      "notifications",
      "createdAt"
    );

  const usersQuery =
    useRealtimeCollection<MarketplaceUser>(
      "users",
      "createdAt"
    );

  const customersQuery =
    useRealtimeCollection<MarketplaceUser>(
      "customers",
      "createdAt"
    );

  const vendorsQuery =
    useRealtimeCollection<MarketplaceUser>(
      "vendors",
      "createdAt"
    );

  const allRecipients = useMemo(() => {
    const recipients =
      new Map<string, NotificationRecipient>();

    usersQuery.data.forEach((user) => {
      const recipient = toRecipient(
        user,
        "customer"
      );

      if (recipient.id) {
        recipients.set(
          recipient.id,
          recipient
        );
      }
    });

    customersQuery.data.forEach((user) => {
      const recipient = toRecipient(
        user,
        "customer"
      );

      if (recipient.id) {
        recipients.set(
          recipient.id,
          {
            ...recipient,
            role: "customer",
          }
        );
      }
    });

    vendorsQuery.data.forEach((user) => {
      const recipient = toRecipient(
        user,
        "vendor"
      );

      if (recipient.id) {
        recipients.set(
          recipient.id,
          {
            ...recipient,
            role: "vendor",
          }
        );
      }
    });

    return [...recipients.values()];
  }, [
    usersQuery.data,
    customersQuery.data,
    vendorsQuery.data,
  ]);

  const notifications =
    notificationsQuery.data;

  const stats = useMemo(() => {
    const unread =
      notifications.filter(
        isUnread
      ).length;

    const customerDeliveries =
      notifications.filter(
        (notification) =>
          normalizeRole(
            notification.receiverRole
          ) === "customer"
      ).length;

    const vendorDeliveries =
      notifications.filter(
        (notification) =>
          normalizeRole(
            notification.receiverRole
          ) === "vendor"
      ).length;

    return {
      total: notifications.length,
      unread,
      customerDeliveries,
      vendorDeliveries,
    };
  }, [notifications]);

  const visibleNotifications =
    useMemo(() => {
      const query =
        search.trim().toLowerCase();

      return [...notifications]
        .filter((notification) => {
          const status =
            getNotificationStatus(
              notification
            );

          const type =
            getNotificationType(
              notification
            );

          const matchesFilter =
            notificationFilter === "all" ||
            status ===
              notificationFilter ||
            type ===
              notificationFilter ||
            (
              notificationFilter ===
                "unread" &&
              isUnread(notification)
            );

          const searchable = [
            getNotificationTitle(
              notification
            ),
            getNotificationMessage(
              notification
            ),
            recipientLabel(notification),
            notification.reportId,
            notification.orderId,
            notification.type,
            notification.category,
          ]
            .map((value) =>
              asString(value)
            )
            .join(" ")
            .toLowerCase();

          return (
            matchesFilter &&
            (
              !query ||
              searchable.includes(query)
            )
          );
        })
        .sort(
          (first, second) =>
            getCreatedTime(second) -
            getCreatedTime(first)
        );
    }, [
      notifications,
      search,
      notificationFilter,
    ]);

  function updateFormField(
    field: keyof NotificationFormState,
    value: string
  ) {
    setNotificationForm(
      (current) => ({
        ...current,
        [field]: value,
      })
    );
  }

  function resolveRecipients():
    NotificationRecipient[] {
    switch (
      notificationForm.targetMode
    ) {
      case "customers":
        return allRecipients.filter(
          (recipient) =>
            recipient.role === "customer"
        );

      case "vendors":
        return allRecipients.filter(
          (recipient) =>
            recipient.role === "vendor"
        );

      case "admins":
        return allRecipients.filter(
          (recipient) =>
            recipient.role === "admin"
        );

      case "specific":
        return [
          {
            id:
              notificationForm
                .receiverId
                .trim(),

            role:
              notificationForm
                .receiverRole,

            name: "",
          },
        ];

      default:
        return allRecipients;
    }
  }

  async function createNotification(
    event: FormEvent<HTMLFormElement>
  ) {
    event.preventDefault();

    const title =
      notificationForm.title.trim();

    const message =
      notificationForm.message.trim();

    if (!title || !message) {
      setFeedback(
        "A title and message are required."
      );
      return;
    }

    const recipients =
      resolveRecipients();

    if (
      recipients.length === 0 ||
      !recipients[0]?.id
    ) {
      setFeedback(
        "No matching notification recipients were found."
      );
      return;
    }

    try {
      setIsSubmitting(true);
      setFeedback("");

      const count =
        await sendNotifications(
          recipients,
          {
            title,
            message,
            type:
              notificationForm.type,
            category:
              notificationForm.type,
            severity:
              notificationForm.severity,
            audience:
              notificationForm.targetMode,
            actionType:
              notificationForm
                .actionRoute
                .trim()
                ? "open_route"
                : "",
            actionId: "",
            actionRoute:
              notificationForm
                .actionRoute
                .trim(),
            privacy: "standard",
          }
        );

      await createActivityLog({
        type: "Notification",
        description:
          `${title} delivered to ${count} account${count === 1 ? "" : "s"}.`,
      });

      setNotificationForm(
        initialNotificationForm
      );

      setIsModalOpen(false);

      setFeedback(
        `Notification delivered to ${count} account${count === 1 ? "" : "s"}.`
      );

    } catch (error) {
      console.error(
        "Notification delivery failed:",
        error
      );

      setFeedback(
        error instanceof Error
          ? error.message
          : "Unable to send the notification."
      );

    } finally {
      setIsSubmitting(false);
    }
  }

  async function markAsRead(
    notification: AppNotificationRecord
  ) {
    try {
      setProcessingId(notification.id);

      await markNotificationRead(
        notification
      );

      setFeedback(
        "Notification marked as read."
      );

    } catch (error) {
      console.error(
        "Unable to mark notification as read:",
        error
      );

      setFeedback(
        "Unable to update the notification."
      );

    } finally {
      setProcessingId(null);
    }
  }

  async function removeNotification(
    notification: AppNotificationRecord
  ) {
    const confirmed = window.confirm(
      `Delete "${getNotificationTitle(notification)}" from the notification history?`
    );

    if (!confirmed) {
      return;
    }

    try {
      setProcessingId(notification.id);

      await deleteNotificationEverywhere(
        notification
      );

      await createActivityLog({
        type: "Notification",
        description:
          `Notification deleted: ${getNotificationTitle(notification)}`,
      });

      setFeedback(
        "Notification deleted."
      );

    } catch (error) {
      console.error(
        "Unable to delete notification:",
        error
      );

      setFeedback(
        "Unable to delete the notification."
      );

    } finally {
      setProcessingId(null);
    }
  }

  const loading =
    notificationsQuery.loading ||
    usersQuery.loading ||
    customersQuery.loading ||
    vendorsQuery.loading;

  const error =
    notificationsQuery.error ||
    usersQuery.error ||
    customersQuery.error ||
    vendorsQuery.error;

  return (
    <DashboardShell
      title="Notification Center"
      description="Deliver direct, broadcast, order, and Trust & Safety updates to customer and vendor mobile inboxes."
      actions={
        <button
          type="button"
          className="btn btn-primary"
          onClick={() =>
            setIsModalOpen(true)
          }
        >
          <Plus size={18} />
          Send notification
        </button>
      }
    >
      <div className={styles.page}>
        {error && (
          <div className={styles.errorBox}>
            <strong>
              Unable to load notifications
            </strong>
            <p>{error}</p>
          </div>
        )}

        {feedback && (
          <div className={styles.feedback}>
            {feedback}
          </div>
        )}

        <section className={styles.hero}>
          <div>
            <span>
              REAL-TIME MOBILE DELIVERY
            </span>
            <h1>
              Professional notification flow
            </h1>
            <p>
              Every customer and vendor receives
              a private inbox record with a clear
              action, delivery state, and read state.
            </p>
          </div>

          <div className={styles.heroIcon}>
            <BellRing size={40} />
          </div>
        </section>

        <section className="grid grid-4">
          <StatCard
            title="Delivered"
            value={stats.total}
            description="Notification records"
            icon={<Bell size={24} />}
            tone="blue"
          />

          <StatCard
            title="Unread"
            value={stats.unread}
            description="Waiting in user inboxes"
            icon={<BellRing size={24} />}
            tone="yellow"
          />

          <StatCard
            title="Customers"
            value={stats.customerDeliveries}
            description="Customer deliveries"
            icon={<UserRound size={24} />}
            tone="green"
          />

          <StatCard
            title="Vendors"
            value={stats.vendorDeliveries}
            description="Vendor deliveries"
            icon={<Users size={24} />}
            tone="purple"
          />
        </section>

        <SectionCard
          title="Delivery history"
          description={`${formatNumber(
            visibleNotifications.length
          )} notification record${
            visibleNotifications.length === 1
              ? ""
              : "s"
          } found.`}
          actions={
            <>
              <label className={styles.search}>
                <Search size={17} />

                <input
                  type="search"
                  value={search}
                  placeholder="Search recipient, order, report..."
                  onChange={(event) =>
                    setSearch(
                      event.target.value
                    )
                  }
                />
              </label>

              <select
                className={styles.filterSelect}
                value={notificationFilter}
                onChange={(event) =>
                  setNotificationFilter(
                    event.target
                      .value as NotificationFilter
                  )
                }
              >
                {FILTERS.map((filter) => (
                  <option
                    key={filter.value}
                    value={filter.value}
                  >
                    {filter.label}
                  </option>
                ))}
              </select>
            </>
          }
        >
          {loading ? (
            <EmptyState
              title="Loading notifications"
              message="Receiving delivery records from Firebase."
              icon={<Bell size={34} />}
            />
          ) : visibleNotifications.length === 0 ? (
            <EmptyState
              title="No notifications found"
              message="Direct and broadcast notifications will appear here."
              icon={<Bell size={34} />}
              actions={
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={() =>
                    setIsModalOpen(true)
                  }
                >
                  <Plus size={18} />
                  Send notification
                </button>
              }
            />
          ) : (
            <div className={styles.notificationGrid}>
              {visibleNotifications.map(
                (notification) => {
                  const processing =
                    processingId ===
                    notification.id;

                  const unread =
                    isUnread(notification);

                  return (
                    <article
                      className={styles.notificationCard}
                      key={notification.id}
                    >
                      <header className={styles.notificationHeader}>
                        <div className={styles.notificationIcon}>
                          {getNotificationType(
                            notification
                          ) ===
                          "trust_and_safety" ? (
                            <ShieldCheck size={21} />
                          ) : (
                            <Bell size={21} />
                          )}
                        </div>

                        <div className={styles.notificationIdentity}>
                          <strong>
                            {getNotificationTitle(
                              notification
                            )}
                          </strong>

                          <span>
                            {getNotificationType(
                              notification
                            )}
                          </span>
                        </div>

                        <StatusBadge
                          status={
                            getNotificationStatus(
                              notification
                            )
                          }
                        />
                      </header>

                      <p className={styles.notificationMessage}>
                        {getNotificationMessage(
                          notification
                        )}
                      </p>

                      <div className={styles.notificationMeta}>
                        <span>
                          To:{" "}
                          <strong>
                            {recipientLabel(
                              notification
                            )}
                          </strong>
                        </span>

                        <span>
                          {formatNotificationDate(
                            notification
                          )}
                        </span>
                      </div>

                      {(notification.orderId ||
                        notification.reportId) && (
                        <div className={styles.contextRow}>
                          {notification.orderId && (
                            <span>
                              Order:{" "}
                              {asString(
                                notification.orderId
                              )}
                            </span>
                          )}

                          {notification.reportId && (
                            <span>
                              Report:{" "}
                              {asString(
                                notification.reportId
                              )}
                            </span>
                          )}
                        </div>
                      )}

                      <footer className={styles.cardActions}>
                        <button
                          type="button"
                          className="btn"
                          disabled={
                            !unread ||
                            processing
                          }
                          onClick={() =>
                            markAsRead(
                              notification
                            )
                          }
                        >
                          <CheckCircle2 size={16} />
                          Mark read
                        </button>

                        <button
                          type="button"
                          className="btn btn-red"
                          disabled={processing}
                          onClick={() =>
                            removeNotification(
                              notification
                            )
                          }
                        >
                          <Trash2 size={16} />
                          Delete
                        </button>
                      </footer>
                    </article>
                  );
                }
              )}
            </div>
          )}
        </SectionCard>

        {isModalOpen && (
          <div
            className={styles.modalOverlay}
            role="presentation"
            onMouseDown={() => {
              if (!isSubmitting) {
                setIsModalOpen(false);
              }
            }}
          >
            <div
              className={styles.modal}
              role="dialog"
              aria-modal="true"
              aria-label="Send notification"
              onMouseDown={(event) =>
                event.stopPropagation()
              }
            >
              <header className={styles.modalHeader}>
                <div>
                  <span>
                    MOBILE NOTIFICATION
                  </span>
                  <h2>
                    Send notification
                  </h2>
                  <p>
                    Select an audience and deliver
                    one private inbox record to
                    every matched account.
                  </p>
                </div>

                <button
                  type="button"
                  className={styles.closeButton}
                  onClick={() =>
                    !isSubmitting &&
                    setIsModalOpen(false)
                  }
                  aria-label="Close notification form"
                >
                  <X size={19} />
                </button>
              </header>

              <form
                onSubmit={createNotification}
              >
                <div className={styles.formBody}>
                  <label className={styles.field}>
                    <span>Title</span>

                    <input
                      value={
                        notificationForm.title
                      }
                      onChange={(event) =>
                        updateFormField(
                          "title",
                          event.target.value
                        )
                      }
                      placeholder="Example: Delivery schedule updated"
                      required
                    />
                  </label>

                  <label className={styles.field}>
                    <span>Message</span>

                    <textarea
                      value={
                        notificationForm.message
                      }
                      onChange={(event) =>
                        updateFormField(
                          "message",
                          event.target.value
                        )
                      }
                      placeholder="Write a short, clear notification."
                      rows={4}
                      required
                    />
                  </label>

                  <div className={styles.formRow}>
                    <label className={styles.field}>
                      <span>Audience</span>

                      <select
                        value={
                          notificationForm.targetMode
                        }
                        onChange={(event) =>
                          updateFormField(
                            "targetMode",
                            event.target.value
                          )
                        }
                      >
                        {TARGET_OPTIONS.map(
                          (option) => (
                            <option
                              key={option.value}
                              value={option.value}
                            >
                              {option.label}
                            </option>
                          )
                        )}
                      </select>
                    </label>

                    <label className={styles.field}>
                      <span>Type</span>

                      <select
                        value={
                          notificationForm.type
                        }
                        onChange={(event) =>
                          updateFormField(
                            "type",
                            event.target.value
                          )
                        }
                      >
                        {TYPE_OPTIONS.map(
                          (type) => (
                            <option
                              key={type}
                              value={type}
                            >
                              {type}
                            </option>
                          )
                        )}
                      </select>
                    </label>
                  </div>

                  {notificationForm.targetMode ===
                    "specific" && (
                    <div className={styles.formRow}>
                      <label className={styles.field}>
                        <span>
                          Firebase user ID
                        </span>

                        <input
                          value={
                            notificationForm
                              .receiverId
                          }
                          onChange={(event) =>
                            updateFormField(
                              "receiverId",
                              event.target.value
                            )
                          }
                          placeholder="User UID"
                          required
                        />
                      </label>

                      <label className={styles.field}>
                        <span>
                          Account role
                        </span>

                        <select
                          value={
                            notificationForm
                              .receiverRole
                          }
                          onChange={(event) =>
                            updateFormField(
                              "receiverRole",
                              event.target.value
                            )
                          }
                        >
                          <option value="customer">
                            Customer
                          </option>
                          <option value="vendor">
                            Vendor
                          </option>
                          <option value="admin">
                            Administrator
                          </option>
                        </select>
                      </label>
                    </div>
                  )}

                  <div className={styles.formRow}>
                    <label className={styles.field}>
                      <span>Severity</span>

                      <select
                        value={
                          notificationForm.severity
                        }
                        onChange={(event) =>
                          updateFormField(
                            "severity",
                            event.target.value
                          )
                        }
                      >
                        <option value="info">
                          Information
                        </option>
                        <option value="success">
                          Success
                        </option>
                        <option value="warning">
                          Warning
                        </option>
                        <option value="critical">
                          Critical
                        </option>
                      </select>
                    </label>

                    <label className={styles.field}>
                      <span>
                        Action route
                      </span>

                      <input
                        value={
                          notificationForm
                            .actionRoute
                        }
                        onChange={(event) =>
                          updateFormField(
                            "actionRoute",
                            event.target.value
                          )
                        }
                        placeholder="/orders/ORDER_ID"
                      />
                    </label>
                  </div>
                </div>

                <footer className={styles.modalFooter}>
                  <button
                    type="button"
                    className="btn"
                    disabled={isSubmitting}
                    onClick={() =>
                      setIsModalOpen(false)
                    }
                  >
                    Cancel
                  </button>

                  <button
                    type="submit"
                    className="btn btn-primary"
                    disabled={isSubmitting}
                  >
                    <Send size={18} />
                    {isSubmitting
                      ? "Delivering..."
                      : "Deliver notification"}
                  </button>
                </footer>
              </form>
            </div>
          </div>
        )}
      </div>
    </DashboardShell>
  );
}
