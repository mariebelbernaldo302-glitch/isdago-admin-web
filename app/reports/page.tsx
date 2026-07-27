"use client";

import {
  useEffect,
  useMemo,
  useState,
} from "react";

import {
  AlertTriangle,
  BellRing,
  CheckCircle2,
  ChevronRight,
  Clock3,
  Eye,
  FileWarning,
  Filter,
  ImageIcon,
  LockKeyhole,
  MessageSquareReply,
  Paperclip,
  RefreshCw,
  Search,
  Send,
  ShieldCheck,
  Sparkles,
  UserRound,
  X,
  XCircle,
} from "lucide-react";

import {
  getAuth,
} from "firebase/auth";

import {
  getDatabase,
  onValue,
  push,
  ref,
  runTransaction,
  serverTimestamp,
  update,
} from "firebase/database";

import type {
  DataSnapshot,
} from "firebase/database";

import DashboardShell from "../components/DashboardShell";
import EmptyState from "../components/EmptyState";
import SectionCard from "../components/SectionCard";
import StatCard from "../components/StatCard";

import {
  useRealtimeCollection,
} from "../lib/useFirestoreCollection";

import styles from "./page.module.css";

type UnknownRecord =
  Record<string, unknown>;

type ReportStatus =
  | "submitted"
  | "reviewing"
  | "resolved"
  | "dismissed";

type Priority =
  | "normal"
  | "high"
  | "urgent";

type SafetyReport =
  UnknownRecord & {
    id: string;
    orderId?: string;
    orderStatus?: string;

    reporterId?: string;
    reporterRole?: string;
    reporterName?: string;
    reporterEmail?: string;

    reportedUserId?: string;
    reportedUserRole?: string;
    reportedUserName?: string;

    categoryCode?: string;
    categoryLabel?: string;
    description?: string;

    hasEvidence?: boolean;
    evidencePath?: string;

    status?: ReportStatus | string;
    priority?: Priority | string;

    reviewedBy?: string;
    reviewNotes?: string;
    resolution?: string;
    publicOutcome?: string;

    lastPublicMessage?: string;
    lastPublicMessageAt?: unknown;

    createdAt?: unknown;
    updatedAt?: unknown;
    reviewedAt?: unknown;
    resolvedAt?: unknown;
  };

type ReportEvidence =
  UnknownRecord & {
    id: string;
    reportId?: string;
    reporterId?: string;
    imageBase64?: string;
    mimeType?: string;
    sizeBytes?: number;
  };

type ReportMessage =
  UnknownRecord & {
    id: string;
    reportId?: string;
    senderId?: string;
    senderRole?: string;
    senderName?: string;
    recipientId?: string;
    recipientRole?: string;
    message?: string;
    messageType?: string;
    deliveryStatus?: string;
    createdAt?: unknown;
  };

type StatusFilter =
  | "all"
  | ReportStatus;

type PriorityFilter =
  | "all"
  | Priority;

type DraftTone =
  | "professional"
  | "reassuring"
  | "concise";



const STATUS_OPTIONS: Array<{
  value: StatusFilter;
  label: string;
}> = [
  { value: "all", label: "All statuses" },
  { value: "submitted", label: "Submitted" },
  { value: "reviewing", label: "Reviewing" },
  { value: "resolved", label: "Resolved" },
  { value: "dismissed", label: "Dismissed" },
];

const PRIORITY_OPTIONS: Array<{
  value: PriorityFilter;
  label: string;
}> = [
  { value: "all", label: "All priorities" },
  { value: "urgent", label: "Urgent" },
  { value: "high", label: "High" },
  { value: "normal", label: "Normal" },
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

function normalize(
  value: unknown
): string {
  return asString(value)
    .toLowerCase()
    .replace(/\s+/g, "_");
}

function toTimestamp(
  value: unknown
): number {
  if (typeof value === "number") {
    return Number.isFinite(value)
      ? value
      : 0;
  }

  if (typeof value === "string") {
    const numeric = Number(value);

    if (Number.isFinite(numeric)) {
      return numeric;
    }

    const parsed = Date.parse(value);

    return Number.isNaN(parsed)
      ? 0
      : parsed;
  }

  if (
    value &&
    typeof value === "object"
  ) {
    const record =
      value as UnknownRecord;

    const seconds =
      typeof record.seconds === "number"
        ? record.seconds
        : typeof record._seconds === "number"
          ? record._seconds
          : null;

    if (seconds !== null) {
      return seconds * 1000;
    }
  }

  return 0;
}

function formatDate(
  value: unknown
): string {
  const timestamp = toTimestamp(value);

  if (!timestamp) {
    return "Date unavailable";
  }

  return new Intl.DateTimeFormat(
    "en-PH",
    {
      dateStyle: "medium",
      timeStyle: "short",
    }
  ).format(new Date(timestamp));
}

function shortId(
  value: unknown
): string {
  const result = asString(
    value,
    "UNKNOWN"
  ).toUpperCase();

  return result.length <= 8
    ? result
    : result.slice(-8);
}

function roleLabel(
  value: unknown
): string {
  const role = normalize(value);

  if (role === "vendor") {
    return "Vendor";
  }

  if (role === "admin") {
    return "Administrator";
  }

  return "Customer";
}

function statusLabel(
  value: unknown
): string {
  switch (normalize(value)) {
    case "reviewing":
      return "Reviewing";

    case "resolved":
      return "Resolved";

    case "dismissed":
      return "Dismissed";

    default:
      return "Submitted";
  }
}

function priorityLabel(
  value: unknown
): string {
  const priority = normalize(value);

  if (priority === "urgent") {
    return "Urgent";
  }

  if (priority === "high") {
    return "High";
  }

  return "Normal";
}

function evidenceDataUrl(
  evidence?: ReportEvidence
): string {
  const image = asString(
    evidence?.imageBase64
  );

  if (!image) {
    return "";
  }

  if (image.startsWith("data:image")) {
    return image;
  }

  const mimeType = asString(
    evidence?.mimeType,
    "image/jpeg"
  );

  return `data:${mimeType};base64,${image}`;
}

function generateReportUpdateDraft(
  report: SafetyReport,
  tone: DraftTone
): string {
  const reporterName = asString(
    report.reporterName,
    "there"
  );

  const category = asString(
    report.categoryLabel,
    "marketplace concern"
  ).toLowerCase();

  const orderReference = shortId(
    report.orderId
  );

  const status = normalize(
    report.status || "submitted"
  );

  const outcome = asString(
    report.publicOutcome
  );

  if (tone === "concise") {
    if (
      status === "resolved" ||
      status === "dismissed"
    ) {
      return `Hello ${reporterName}, your report regarding order #${orderReference} has been reviewed and the case is now ${status}. ${outcome || "You can view the final status in your report inbox."}`;
    }

    if (status === "reviewing") {
      return `Hello ${reporterName}, your report regarding order #${orderReference} is currently under review. We will notify you when the assessment is complete.`;
    }

    return `Hello ${reporterName}, we received your report regarding order #${orderReference}. Our Trust & Safety team will review it and send you another update.`;
  }

  if (tone === "reassuring") {
    return `Hello ${reporterName},\n\nWe understand your concern regarding ${category} for order #${orderReference}. Your report is important to us, and our Trust & Safety team ${status === "reviewing" ? "is carefully reviewing the details and available evidence" : status === "resolved" || status === "dismissed" ? "has completed its review" : "has received the report and will begin reviewing the details"}.\n\n${outcome || "We will keep you informed through your private report inbox as soon as there is an update."}\n\nThank you for your patience,\nIsdaGo Trust & Safety`;
  }

  if (
    status === "resolved" ||
    status === "dismissed"
  ) {
    return `Hello ${reporterName},\n\nWe have completed the review of your ${category} report for order #${orderReference}. The case status is now ${status}.\n\n${outcome || "The final case status is available in your private report inbox."}\n\nRegards,\nIsdaGo Trust & Safety`;
  }

  if (status === "reviewing") {
    return `Hello ${reporterName},\n\nYour ${category} report for order #${orderReference} is now under review. Our Trust & Safety team is assessing the report details, order records, and any available evidence.\n\nWe will notify you through your private report inbox when the review is complete.\n\nRegards,\nIsdaGo Trust & Safety`;
  }

  return `Hello ${reporterName},\n\nWe have received your ${category} report for order #${orderReference}. Our Trust & Safety team will review the report details, order records, and any available evidence.\n\nWe will send another update through your private report inbox as the review progresses.\n\nRegards,\nIsdaGo Trust & Safety`;
}

function snapshotMessages(
  snapshot: DataSnapshot
): ReportMessage[] {
  const messages: ReportMessage[] = [];

  snapshot.forEach((child) => {
    const value =
      child.val() as UnknownRecord | null;

    if (!value) {
      return;
    }

    messages.push({
      ...value,
      id: asString(
        value.id,
        child.key || ""
      ),
    } as ReportMessage);
  });

  return messages.sort(
    (first, second) =>
      toTimestamp(first.createdAt) -
      toTimestamp(second.createdAt)
  );
}

function ReportBadge({
  value,
  kind,
}: {
  value: string;
  kind: "status" | "priority";
}) {
  const normalized = normalize(value);

  return (
    <span
      className={[
        styles.badge,
        kind === "status"
          ? styles[`status_${normalized}`]
          : styles[`priority_${normalized}`],
      ]
        .filter(Boolean)
        .join(" ")}
    >
      {kind === "status"
        ? statusLabel(value)
        : priorityLabel(value)}
    </span>
  );
}

function ReportCard({
  report,
  onOpen,
}: {
  report: SafetyReport;
  onOpen: () => void;
}) {
  return (
    <article className={styles.reportCard}>
      <div className={styles.reportCardHeader}>
        <div className={styles.reportIcon}>
          <FileWarning size={22} />
        </div>

        <div className={styles.reportIdentity}>
          <div className={styles.caseReference}>
            <span>
              CASE #{shortId(report.id)}
            </span>

            {report.hasEvidence && (
              <span className={styles.evidenceTag}>
                <Paperclip size={12} />
                Evidence
              </span>
            )}
          </div>

          <h3>
            {asString(
              report.categoryLabel,
              "Marketplace concern"
            )}
          </h3>

          <p>
            Order #{shortId(report.orderId)}
          </p>

          <p className={styles.description}>
            {asString(
              report.description,
              "No description supplied."
            )}
          </p>
        </div>
      </div>

      <div className={styles.partyCell}>
        <span>Reporter</span>
        <strong>
          {asString(
            report.reporterName,
            roleLabel(report.reporterRole)
          )}
        </strong>
        <p>
          Reports {asString(
            report.reportedUserName,
            roleLabel(report.reportedUserRole)
          )}
        </p>
      </div>

      <div className={styles.badgeCell}>
        <span className={styles.mobileLabel}>
          Priority
        </span>
        <ReportBadge
          kind="priority"
          value={asString(
            report.priority,
            "normal"
          )}
        />
      </div>

      <div className={styles.badgeCell}>
        <span className={styles.mobileLabel}>
          Status
        </span>
        <ReportBadge
          kind="status"
          value={asString(
            report.status,
            "submitted"
          )}
        />
      </div>

      <div className={styles.dateCell}>
        <span>Submitted</span>
        <strong>
          {formatDate(report.createdAt)}
        </strong>
        <p>
          {report.lastPublicMessage
            ? "Update sent"
            : "No update sent"}
        </p>
      </div>

      <button
        type="button"
        className={styles.viewButton}
        onClick={onOpen}
        aria-label={`Review case ${shortId(
          report.id
        )}`}
      >
        <Eye size={17} />
        <span>Review</span>
        <ChevronRight size={16} />
      </button>
    </article>
  );
}

function ReportDrawer({
  report,
  evidence,
  messages,
  saving,
  sendingReply,
  feedback,
  onClose,
  onSave,
  onSendReply,
}: {
  report: SafetyReport;
  evidence?: ReportEvidence;
  messages: ReportMessage[];
  saving: boolean;
  sendingReply: boolean;
  feedback: string;
  onClose: () => void;
  onSave: (
    status: ReportStatus,
    notes: string,
    resolution: string,
    publicOutcome: string
  ) => Promise<void>;
  onSendReply: (
    message: string
  ) => Promise<boolean>;
}) {
  const [notes, setNotes] =
    useState("");

  const [resolution, setResolution] =
    useState("");

  const [
    publicOutcome,
    setPublicOutcome,
  ] = useState("");

  const [replyText, setReplyText] =
    useState("");

  const [draftTone, setDraftTone] =
    useState<DraftTone>(
      "professional"
    );

  useEffect(() => {
    setNotes(
      asString(report.reviewNotes)
    );

    setResolution(
      asString(report.resolution)
    );

    setPublicOutcome(
      asString(report.publicOutcome)
    );

    setDraftTone("professional");

    setReplyText(
      generateReportUpdateDraft(
        report,
        "professional"
      )
    );
    // Reset the editable draft only when a different
    // report is opened, not after every status update.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [report.id]);

  const evidenceUrl =
    evidenceDataUrl(evidence);

  const currentStatus = normalize(
    report.status || "submitted"
  );

  const reviewStarted =
    currentStatus === "reviewing" ||
    currentStatus === "resolved" ||
    currentStatus === "dismissed";

  const caseClosed =
    currentStatus === "resolved" ||
    currentStatus === "dismissed";

  async function submitReply() {
    const sent = await onSendReply(
      replyText
    );

    if (sent) {
      setReplyText("");
    }
  }

  function applySuggestedDraft(
    tone: DraftTone
  ) {
    setDraftTone(tone);

    setReplyText(
      generateReportUpdateDraft(
        report,
        tone
      )
    );
  }

  return (
    <div
      className={styles.drawerBackdrop}
      role="presentation"
      onMouseDown={onClose}
    >
      <section
        className={styles.drawer}
        role="dialog"
        aria-modal="true"
        aria-label="Review and reply to safety report"
        onMouseDown={(event) =>
          event.stopPropagation()
        }
      >
        <header className={styles.drawerHeader}>
          <div className={styles.drawerHeaderMain}>
            <div className={styles.drawerHeaderIcon}>
              <FileWarning size={22} />
            </div>

            <div className={styles.drawerTitle}>
              <span>
                TRUST &amp; SAFETY CASE
              </span>

              <h2>
                {asString(
                  report.categoryLabel,
                  "Marketplace concern"
                )}
              </h2>

              <p>
                Case #{shortId(report.id)}
                {" • "}
                Order #{shortId(report.orderId)}
              </p>
            </div>
          </div>

          <div className={styles.drawerHeaderActions}>
            <div className={styles.drawerBadges}>
              <ReportBadge
                kind="priority"
                value={asString(
                  report.priority,
                  "normal"
                )}
              />

              <ReportBadge
                kind="status"
                value={asString(
                  report.status,
                  "submitted"
                )}
              />
            </div>

            <button
              type="button"
              className={styles.closeButton}
              onClick={onClose}
              aria-label="Close report details"
            >
              <X size={20} />
            </button>
          </div>
        </header>

        {feedback && (
          <div
            className={styles.drawerFeedback}
            role="status"
          >
            <CheckCircle2 size={18} />
            <span>{feedback}</span>
          </div>
        )}

        <div className={styles.drawerBody}>
          <div className={styles.caseProgress}>
            <div
              className={[
                styles.progressStep,
                styles.progressStepComplete,
              ].join(" ")}
            >
              <span>1</span>
              <div>
                <strong>Submitted</strong>
                <small>
                  {formatDate(report.createdAt)}
                </small>
              </div>
            </div>

            <div
              className={[
                styles.progressStep,
                reviewStarted
                  ? styles.progressStepComplete
                  : styles.progressStepPending,
              ].join(" ")}
            >
              <span>2</span>
              <div>
                <strong>In review</strong>
                <small>
                  Administrator assessment
                </small>
              </div>
            </div>

            <div
              className={[
                styles.progressStep,
                caseClosed
                  ? styles.progressStepComplete
                  : styles.progressStepPending,
              ].join(" ")}
            >
              <span>3</span>
              <div>
                <strong>Decision</strong>
                <small>
                  Resolve or dismiss case
                </small>
              </div>
            </div>
          </div>

          <section className={styles.caseSection}>
            <div className={styles.sectionHeading}>
              <div>
                <span className={styles.sectionEyebrow}>
                  CASE OVERVIEW
                </span>
                <h3>People involved</h3>
              </div>

              <UserRound size={20} />
            </div>

            <div className={styles.peopleGrid}>
              <article>
                <div className={styles.personIcon}>
                  <UserRound size={18} />
                </div>

                <div>
                  <span>Reporter</span>

                  <strong>
                    {asString(
                      report.reporterName,
                      roleLabel(
                        report.reporterRole
                      )
                    )}
                  </strong>

                  <p>
                    {roleLabel(
                      report.reporterRole
                    )}
                    {" • "}
                    {asString(
                      report.reporterEmail,
                      asString(
                        report.reporterId,
                        "ID unavailable"
                      )
                    )}
                  </p>
                </div>
              </article>

              <article>
                <div className={styles.personIcon}>
                  <UserRound size={18} />
                </div>

                <div>
                  <span>Reported account</span>

                  <strong>
                    {asString(
                      report.reportedUserName,
                      roleLabel(
                        report.reportedUserRole
                      )
                    )}
                  </strong>

                  <p>
                    {roleLabel(
                      report.reportedUserRole
                    )}
                    {" • "}
                    {asString(
                      report.reportedUserId,
                      "ID unavailable"
                    )}
                  </p>
                </div>
              </article>
            </div>
          </section>

          <section className={styles.caseSection}>
            <div className={styles.sectionHeading}>
              <div>
                <span className={styles.sectionEyebrow}>
                  REPORT DETAILS
                </span>
                <h3>Incident description</h3>
              </div>

              <FileWarning size={20} />
            </div>

            <div className={styles.categoryLine}>
              <div>
                <span>Category</span>
                <strong>
                  {asString(
                    report.categoryLabel,
                    "Marketplace concern"
                  )}
                </strong>
              </div>

              <div>
                <span>Order status</span>
                <strong>
                  {asString(
                    report.orderStatus,
                    "Unknown"
                  )}
                </strong>
              </div>
            </div>

            <p className={styles.fullDescription}>
              {asString(
                report.description,
                "No description supplied."
              )}
            </p>
          </section>

          <section className={styles.caseSection}>
            <div className={styles.sectionHeading}>
              <div>
                <span className={styles.sectionEyebrow}>
                  PRIVATE ATTACHMENT
                </span>
                <h3>Supporting evidence</h3>

                <p>
                  Visible only to authorized
                  administrators.
                </p>
              </div>

              <LockKeyhole size={20} />
            </div>

            {evidenceUrl ? (
              <img
                className={styles.evidenceImage}
                src={evidenceUrl}
                alt="Report supporting evidence"
              />
            ) : (
              <div className={styles.noEvidence}>
                <ImageIcon size={28} />
                <span>No evidence attached</span>
              </div>
            )}
          </section>

          <section
            className={[
              styles.caseSection,
              styles.replySection,
            ].join(" ")}
          >
            <div className={styles.sectionHeading}>
              <div>
                <span className={styles.sectionEyebrow}>
                  REPORTER COMMUNICATION
                </span>
                <h3>Review and send update</h3>

                <p>
                  Start with a smart draft, edit it,
                  then send it privately.
                </p>
              </div>

              <Sparkles size={20} />
            </div>

            <div className={styles.smartDraftPanel}>
              <div className={styles.smartDraftHeader}>
                <div className={styles.smartDraftTitle}>
                  <span>
                    <Sparkles size={14} />
                  </span>

                  <div>
                    <strong>Smart update draft</strong>
                    <small>
                      Generated from this report and
                      fully editable
                    </small>
                  </div>
                </div>

                <button
                  type="button"
                  className={styles.regenerateButton}
                  onClick={() =>
                    applySuggestedDraft(
                      draftTone
                    )
                  }
                >
                  <RefreshCw size={13} />
                  Regenerate
                </button>
              </div>

              <div
                className={styles.tonePicker}
                role="group"
                aria-label="Select message tone"
              >
                <span>Tone</span>

                {(
                  [
                    "professional",
                    "reassuring",
                    "concise",
                  ] as DraftTone[]
                ).map((tone) => (
                  <button
                    key={tone}
                    type="button"
                    aria-pressed={
                      draftTone === tone
                    }
                    className={[
                      styles.toneButton,
                      draftTone === tone
                        ? styles.toneButtonActive
                        : "",
                    ]
                      .filter(Boolean)
                      .join(" ")}
                    onClick={() =>
                      applySuggestedDraft(tone)
                    }
                  >
                    {tone.charAt(0).toUpperCase() +
                      tone.slice(1)}
                  </button>
                ))}
              </div>
            </div>

            <label className={styles.field}>
              <div className={styles.fieldLabel}>
                <span>Editable message</span>
                <small>
                  {replyText.length}/800
                </small>
              </div>

              <textarea
                value={replyText}
                onChange={(event) =>
                  setReplyText(
                    event.target.value
                  )
                }
                placeholder="Generate a draft or write a report update..."
                rows={8}
                maxLength={800}
              />
            </label>

            <div className={styles.composerHint}>
              <MessageSquareReply size={14} />
              <span>
                Review the message before sending.
                It will be delivered to the
                reporter&apos;s private mobile inbox.
              </span>
            </div>

            <button
              type="button"
              className={styles.sendReplyButton}
              disabled={
                sendingReply ||
                !replyText.trim()
              }
              onClick={submitReply}
            >
              <Send size={17} />

              {sendingReply
                ? "Sending update..."
                : "Send update to reporter"}
            </button>
          </section>

          <section className={styles.caseSection}>
            <div className={styles.sectionHeading}>
              <div>
                <span className={styles.sectionEyebrow}>
                  ACTIVITY
                </span>
                <h3>Communication history</h3>
              </div>

              <span className={styles.messageCount}>
                {messages.length}
              </span>
            </div>

            {messages.length === 0 ? (
              <div className={styles.emptyTimeline}>
                No administrator updates sent yet.
              </div>
            ) : (
              <div className={styles.timeline}>
                {messages.map((message) => (
                  <article
                    key={message.id}
                    className={styles.timelineItem}
                  >
                    <div className={styles.timelineDot} />

                    <div>
                      <div className={styles.timelineHeader}>
                        <strong>
                          {asString(
                            message.senderName,
                            "Administrator"
                          )}
                        </strong>

                        <span>
                          {formatDate(
                            message.createdAt
                          )}
                        </span>
                      </div>

                      <p>
                        {asString(
                          message.message,
                          "No message"
                        )}
                      </p>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </section>

          <section className={styles.caseSection}>
            <div className={styles.sectionHeading}>
              <div>
                <span className={styles.sectionEyebrow}>
                  INTERNAL ONLY
                </span>
                <h3>Administrator review</h3>
              </div>

              <LockKeyhole size={20} />
            </div>

            <label className={styles.field}>
              <span>Private review notes</span>

              <textarea
                value={notes}
                onChange={(event) =>
                  setNotes(event.target.value)
                }
                placeholder="Record findings, contacted parties, and supporting facts. This is not sent to users."
                rows={5}
              />
            </label>

            <label className={styles.field}>
              <span>Internal resolution</span>

              <textarea
                value={resolution}
                onChange={(event) =>
                  setResolution(
                    event.target.value
                  )
                }
                placeholder="Document the internal action or reason for dismissal."
                rows={3}
              />
            </label>

            <label className={styles.field}>
              <div className={styles.fieldLabel}>
                <span>Final user-facing outcome</span>
                <small>
                  {publicOutcome.length}/800
                </small>
              </div>

              <textarea
                value={publicOutcome}
                onChange={(event) =>
                  setPublicOutcome(
                    event.target.value
                  )
                }
                placeholder="This neutral message is sent when the case is resolved or dismissed."
                rows={3}
                maxLength={800}
              />
            </label>
          </section>
        </div>

        <footer className={styles.drawerActions}>
          <div className={styles.actionLabel}>
            <strong>Case actions</strong>
            <span>
              Save the appropriate review decision.
            </span>
          </div>

          <div className={styles.actionButtons}>
            <button
              type="button"
              disabled={saving}
              className={styles.reviewButton}
              onClick={() =>
                onSave(
                  "reviewing",
                  notes,
                  resolution,
                  publicOutcome
                )
              }
            >
              <Clock3 size={17} />
              {saving
                ? "Saving..."
                : "Start review"}
            </button>

            <button 
              type="button"
              disabled={saving}
              className={styles.dismissButton}
              onClick={() =>
                onSave(
                  "dismissed",
                  notes,
                  resolution,
                  publicOutcome
                )
              }
            >
              <XCircle size={17} />
              Dismiss
            </button>

            <button
              type="button"
              disabled={saving}
              className={styles.resolveButton}
              onClick={() =>
                onSave(
                  "resolved",
                  notes,
                  resolution,
                  publicOutcome
                )
              }
            >
              <CheckCircle2 size={17} />
              Resolve case
            </button>
          </div>
        </footer>
      </section>
    </div>
  );
}

export default function ReportsPage() {
  const [search, setSearch] =
    useState("");

  const [statusFilter, setStatusFilter] =
    useState<StatusFilter>("all");

  const [
    priorityFilter,
    setPriorityFilter,
  ] = useState<PriorityFilter>("all");

  const [
    selectedReport,
    setSelectedReport,
  ] = useState<SafetyReport | null>(
    null
  );

  const [
    selectedMessages,
    setSelectedMessages,
  ] = useState<ReportMessage[]>([]);

  const [saving, setSaving] =
    useState(false);

  const [
    sendingReply,
    setSendingReply,
  ] = useState(false);

  const [feedback, setFeedback] =
    useState("");

  const reportsQuery =
    useRealtimeCollection<SafetyReport>(
      "reports",
      "createdAt"
    );

  const evidenceQuery =
    useRealtimeCollection<ReportEvidence>(
      "report_evidence",
      "createdAt"
    );

  const reports = reportsQuery.data;
  const evidenceRecords =
    evidenceQuery.data;

  useEffect(() => {
    if (!selectedReport) {
      setSelectedMessages([]);
      return;
    }

    const messagesReference = ref(
      getDatabase(),
      `report_messages/${selectedReport.id}`
    );

    const unsubscribe = onValue(
      messagesReference,
      (snapshot) => {
        setSelectedMessages(
          snapshotMessages(snapshot)
        );
      },
      (error) => {
        console.error(
          "Unable to load report messages:",
          error
        );

        setSelectedMessages([]);
      }
    );

    return () => unsubscribe();
  }, [selectedReport]);

  const evidenceMap = useMemo(() => {
    const result =
      new Map<string, ReportEvidence>();

    evidenceRecords.forEach((item) => {
      const reportId = asString(
        item.reportId,
        item.id
      );

      if (reportId) {
        result.set(reportId, item);
      }
    });

    return result;
  }, [evidenceRecords]);

  const visibleReports = useMemo(() => {
    const query =
      search.trim().toLowerCase();

    return [...reports]
      .filter((report) => {
        const status = normalize(
          report.status || "submitted"
        );

        const priority = normalize(
          report.priority || "normal"
        );

        const searchable = [
          report.id,
          report.orderId,
          report.reporterName,
          report.reporterEmail,
          report.reportedUserName,
          report.categoryLabel,
          report.description,
          report.lastPublicMessage,
        ]
          .map((value) =>
            asString(value)
          )
          .join(" ")
          .toLowerCase();

        return (
          (
            !query ||
            searchable.includes(query)
          ) &&
          (
            statusFilter === "all" ||
            status === statusFilter
          ) &&
          (
            priorityFilter === "all" ||
            priority === priorityFilter
          )
        );
      })
      .sort(
        (first, second) =>
          toTimestamp(second.createdAt) -
          toTimestamp(first.createdAt)
      );
  }, [
    reports,
    search,
    statusFilter,
    priorityFilter,
  ]);

  const stats = useMemo(() => {
    const count = (
      status: ReportStatus
    ) =>
      reports.filter(
        (report) =>
          normalize(report.status) === status
      ).length;

    return {
      total: reports.length,
      submitted: count("submitted"),
      reviewing: count("reviewing"),
      resolved: count("resolved"),
    };
  }, [reports]);

  function queueNotification(
    updates: UnknownRecord,
    values: {
      receiverId: string;
      receiverRole: string;
      receiverName?: string;
      title: string;
      message: string;
      type: string;
      actionType: string;
      actionLabel: string;
      reportId: string;
      orderId: string;
      reportMessageId?: string;
      relatedStatus?: string;
    }
  ) {
    const notificationId =
      push(
        ref(
          getDatabase(),
          "notifications"
        )
      ).key;

    if (!notificationId) {
      throw new Error(
        "Unable to create notification ID."
      );
    }

    const adminId =
      getAuth().currentUser?.uid ||
      "admin";

    const notification = {
      id: notificationId,
      receiverId: values.receiverId,
      receiverRole: values.receiverRole,
      receiverName: asString(
        values.receiverName
      ),

      title: values.title,
      message: values.message,
      type: values.type,
      category: "trust_and_safety",
      severity: "info",

      status: "unread",
      read: false,
      readAt: 0,

      senderId: adminId,
      senderRole: "admin",
      senderName: "IsdaGo Trust & Safety",

      actionType: values.actionType,
      actionLabel: values.actionLabel,
      actionId: values.reportId,
      actionRoute:
        `/reports/${values.reportId}`,

      reportId: values.reportId,
      orderId: values.orderId,
      reportMessageId: asString(
        values.reportMessageId
      ),
      relatedStatus: asString(
        values.relatedStatus
      ),

      privacy: "private",
      deliveryStatus: "delivered",

      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };

    updates[
      `notifications/${notificationId}`
    ] = notification;

    updates[
      `user_notifications/${values.receiverId}/${notificationId}`
    ] = notification;
  }

  async function sendReply(
    message: string
  ): Promise<boolean> {
    if (!selectedReport) {
      return false;
    }

    const reporterId = asString(
      selectedReport.reporterId
    );

    if (!reporterId) {
      setFeedback(
        "The reporter account ID is missing."
      );
      return false;
    }

    const cleanMessage = message.trim();

    if (cleanMessage.length < 5) {
      setFeedback(
        "Write a clear update before sending."
      );
      return false;
    }

    setSendingReply(true);
    setFeedback("");

    try {
      const database = getDatabase();

      const messageId =
        push(
          ref(
            database,
            `report_messages/${selectedReport.id}`
          )
        ).key;

      if (!messageId) {
        throw new Error(
          "Unable to create report message ID."
        );
      }

      const admin =
        getAuth().currentUser;

      const updates: UnknownRecord = {};

      updates[
        `report_messages/${selectedReport.id}/${messageId}`
      ] = {
        id: messageId,
        reportId: selectedReport.id,

        senderId:
          admin?.uid || "admin",
        senderRole: "admin",
        senderName:
          admin?.displayName ||
          "IsdaGo Trust & Safety",

        recipientId: reporterId,
        recipientRole: asString(
          selectedReport.reporterRole,
          "customer"
        ),

        message: cleanMessage,
        messageType: "admin_update",
        deliveryStatus: "delivered",

        createdAt: serverTimestamp(),
      };

      queueNotification(
        updates,
        {
          receiverId: reporterId,
          receiverRole: asString(
            selectedReport.reporterRole,
            "customer"
          ),
          receiverName: asString(
            selectedReport.reporterName
          ),
          title: "Update on your report",
          message: cleanMessage,
          type: "safety_report_message",
          actionType:
            "open_report_status",
          actionLabel: "View update",
          reportId: selectedReport.id,
          orderId: asString(
            selectedReport.orderId
          ),
          reportMessageId: messageId,
          relatedStatus: asString(
            selectedReport.status,
            "submitted"
          ),
        }
      );

      updates[
        `reports/${selectedReport.id}/lastPublicMessage`
      ] = cleanMessage;

      updates[
        `reports/${selectedReport.id}/lastPublicMessageAt`
      ] = serverTimestamp();

      updates[
        `reports/${selectedReport.id}/updatedAt`
      ] = serverTimestamp();

      await update(
        ref(database),
        updates
      );

      setSelectedReport({
        ...selectedReport,
        lastPublicMessage: cleanMessage,
      });

      setFeedback(
        "Update delivered to the reporter's private mobile inbox."
      );

      return true;

    } catch (error) {
      console.error(
        "Unable to send report reply:",
        error
      );

      setFeedback(
        error instanceof Error
          ? error.message
          : "Unable to send the update."
      );

      return false;

    } finally {
      setSendingReply(false);
    }
  }

  async function sendLifecycleNotices(
    report: SafetyReport,
    status: ReportStatus,
    publicOutcome: string
  ) {
    if (status === "submitted") {
      return;
    }

    const eventReference = ref(
      getDatabase(),
      `report_notification_events/${report.id}/${status}`
    );

    const reservation =
      await runTransaction(
        eventReference,
        (currentValue) => {
          if (currentValue) {
            return;
          }

          return {
            reportId: report.id,
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

    const updates: UnknownRecord = {};
    const reporterId = asString(
      report.reporterId
    );
    const reportedUserId = asString(
      report.reportedUserId
    );

    const orderReference =
      shortId(report.orderId);

    const finalMessage =
      publicOutcome.trim() ||
      (
        status === "resolved"
          ? "The review is complete. The administrator recorded the final action for this case."
          : status === "dismissed"
            ? "The review is complete. The case was closed without further marketplace action."
            : "An administrator has started reviewing the report and connected order records."
      );

    if (reporterId) {
      queueNotification(
        updates,
        {
          receiverId: reporterId,
          receiverRole: asString(
            report.reporterRole,
            "customer"
          ),
          receiverName: asString(
            report.reporterName
          ),
          title:
            status === "reviewing"
              ? "Your report is under review"
              : status === "resolved"
                ? "Report review completed"
                : "Report review closed",
          message:
            status === "reviewing"
              ? `An administrator has started reviewing your report for order #${orderReference}.`
              : finalMessage,
          type:
            `safety_report_${status}`,
          actionType:
            "open_report_status",
          actionLabel: "View report status",
          reportId: report.id,
          orderId: asString(
            report.orderId
          ),
          relatedStatus: status,
        }
      );
    }

    if (reportedUserId) {
      queueNotification(
        updates,
        {
          receiverId: reportedUserId,
          receiverRole: asString(
            report.reportedUserRole,
            "customer"
          ),
          receiverName: asString(
            report.reportedUserName
          ),
          title:
            status === "reviewing"
              ? "Marketplace conduct review"
              : "Conduct review completed",
          message:
            status === "reviewing"
              ? `A conduct review has started for order #${orderReference}. No penalty has been applied at this stage.`
              : finalMessage,
          type:
            `safety_review_${status}`,
          actionType: "open_order",
          actionLabel: "Open order",
          reportId: report.id,
          orderId: asString(
            report.orderId
          ),
          relatedStatus: status,
        }
      );
    }

    if (Object.keys(updates).length > 0) {
      await update(
        ref(getDatabase()),
        updates
      );
    }
  }

  async function saveReview(
    status: ReportStatus,
    notes: string,
    resolution: string,
    publicOutcome: string
  ) {
    if (!selectedReport) {
      return;
    }

    setSaving(true);
    setFeedback("");

    try {
      const adminId =
        getAuth().currentUser?.uid ||
        "admin";

      const reportUpdates: UnknownRecord = {
        status,
        reviewNotes: notes.trim(),
        resolution: resolution.trim(),
        publicOutcome:
          publicOutcome.trim(),
        reviewedBy: adminId,
        updatedAt: serverTimestamp(),
      };

      if (status === "reviewing") {
        reportUpdates.reviewedAt =
          serverTimestamp();
      }

      if (
        status === "resolved" ||
        status === "dismissed"
      ) {
        reportUpdates.resolvedAt =
          serverTimestamp();
      }

      await update(
        ref(
          getDatabase(),
          `reports/${selectedReport.id}`
        ),
        reportUpdates
      );

      try {
        await sendLifecycleNotices(
          selectedReport,
          status,
          publicOutcome
        );

        setFeedback(
          "Case updated and the connected users were notified."
        );

      } catch (notificationError) {
        console.error(
          "Case saved but notification failed:",
          notificationError
        );

        setFeedback(
          "The case was saved, but notification delivery needs to be retried."
        );
      }

      setSelectedReport({
        ...selectedReport,
        status,
        reviewNotes: notes.trim(),
        resolution: resolution.trim(),
        publicOutcome:
          publicOutcome.trim(),
      });

    } catch (error) {
      console.error(
        "Unable to update report:",
        error
      );

      setFeedback(
        error instanceof Error
          ? error.message
          : "Unable to update the report."
      );

    } finally {
      setSaving(false);
    }
  }

  const loading =
    reportsQuery.loading ||
    evidenceQuery.loading;

  const error =
    reportsQuery.error ||
    evidenceQuery.error;

  return (
    <DashboardShell
      title="Trust & Safety Reports"
      description="Review verified reports, reply directly to reporters, and deliver private mobile notifications."
    >
      <div className={styles.page}>
        {error && (
          <div className={styles.errorBox}>
            <strong>
              Unable to load safety reports
            </strong>

            <p>{error}</p>
          </div>
        )}

        <section className={styles.hero}>
          <div className={styles.heroContent}>
            <div className={styles.heroIcon}>
              <ShieldCheck size={30} />
            </div>

            <div>
              <span>
                TRUST &amp; SAFETY OPERATIONS
              </span>

              <h1>
                Report Management Center
              </h1>

              <p>
                Review marketplace incidents,
                communicate with reporters, and
                document decisions from one secure
                workspace.
              </p>
            </div>
          </div>

          <div className={styles.heroStatus}>
            <div className={styles.statusIndicator}>
              <BellRing size={18} />
            </div>

            <div>
              <span>DELIVERY STATUS</span>

              <strong>
                Mobile notifications active
              </strong>

              <p>
                Reporter updates are connected to
                the private mobile inbox.
              </p>
            </div>
          </div>
        </section>

        <section
          className={`grid grid-4 ${styles.statsGrid}`}
        >
          <StatCard
            title="All Reports"
            value={stats.total}
            description="Submitted safety cases"
            icon={<FileWarning size={23} />}
            tone="blue"
          />

          <StatCard
            title="Needs Review"
            value={stats.submitted}
            description="Waiting for administrator"
            icon={<AlertTriangle size={23} />}
            tone="yellow"
          />

          <StatCard
            title="Reviewing"
            value={stats.reviewing}
            description="Cases in progress"
            icon={<Clock3 size={23} />}
            tone="purple"
          />

          <StatCard
            title="Resolved"
            value={stats.resolved}
            description="Completed decisions"
            icon={<CheckCircle2 size={23} />}
            tone="green"
          />
        </section>

        <SectionCard
          title="Safety Report Queue"
          description="Prioritized cases from customers and vendors, sorted by newest submission."
          actions={
            <div className={styles.queueCount}>
              <span className={styles.liveDot} />
              <strong>
                {visibleReports.length}
              </strong>
              <span>
                {visibleReports.length === 1
                  ? "case"
                  : "cases"}
              </span>
            </div>
          }
        >
          <div className={styles.toolbar}>
            <div className={styles.filters}>
              <label className={styles.search}>
                <Search size={17} />

                <input
                  type="search"
                  value={search}
                  placeholder="Search order, user, or category..."
                  onChange={(event) =>
                    setSearch(
                      event.target.value
                    )
                  }
                />
              </label>

              <div className={styles.filterControls}>
                <Filter size={16} />

                <select
                  value={statusFilter}
                  onChange={(event) =>
                    setStatusFilter(
                      event.target
                        .value as StatusFilter
                    )
                  }
                  aria-label="Filter report status"
                >
                  {STATUS_OPTIONS.map(
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

                <select
                  value={priorityFilter}
                  onChange={(event) =>
                    setPriorityFilter(
                      event.target
                        .value as PriorityFilter
                    )
                  }
                  aria-label="Filter report priority"
                >
                  {PRIORITY_OPTIONS.map(
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
              </div>
            </div>

            {(search ||
              statusFilter !== "all" ||
              priorityFilter !== "all") && (
              <button
                type="button"
                className={styles.clearButton}
                onClick={() => {
                  setSearch("");
                  setStatusFilter("all");
                  setPriorityFilter("all");
                }}
              >
                <X size={15} />
                Clear filters
              </button>
            )}
          </div>

          {loading ? (
            <EmptyState
              title="Loading safety reports"
              message="Receiving reports and private evidence from Firebase."
              icon={<ShieldCheck size={34} />}
            />
          ) : visibleReports.length === 0 ? (
            <EmptyState
              title="No reports found"
              message="New order-related reports will appear here."
              icon={<FileWarning size={34} />}
            />
          ) : (
            <div className={styles.tableShell}>
              <div
                className={styles.tableHeader}
                aria-hidden="true"
              >
                <span>Case details</span>
                <span>Parties</span>
                <span>Priority</span>
                <span>Status</span>
                <span>Submitted</span>
                <span />
              </div>

              <div className={styles.reportGrid}>
                {visibleReports.map(
                  (report) => (
                    <ReportCard
                      key={report.id}
                      report={report}
                      onOpen={() => {
                        setFeedback("");
                        setSelectedReport(report);
                      }}
                    />
                  )
                )}
              </div>
            </div>
          )}
        </SectionCard>
      </div>

      {selectedReport && (
        <ReportDrawer
          report={selectedReport}
          evidence={evidenceMap.get(
            selectedReport.id
          )}
          messages={selectedMessages}
          saving={saving}
          sendingReply={sendingReply}
          feedback={feedback}
          onClose={() => {
            setFeedback("");
            setSelectedReport(null);
          }}
          onSave={saveReview}
          onSendReply={sendReply}
        />
      )}
    </DashboardShell>
  );
}
