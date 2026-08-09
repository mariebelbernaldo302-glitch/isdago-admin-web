"use client";

import { useMemo, useState } from "react";
import {
  CheckCircle2,
  Clock,
  Mail,
  MapPin,
  Phone,
  Search,
  ShieldCheck,
  Store,
  UserRound,
  X,
  XCircle,
} from "lucide-react";

import DashboardShell from "../components/DashboardShell";
import EmptyState from "../components/EmptyState";
import SectionCard from "../components/SectionCard";
import StatCard from "../components/StatCard";
import StatusBadge from "../components/StatusBadge";
import { createActivityLog } from "../lib/activity";
import { updatePaths } from "../lib/database";
import {
  formatDate,
  formatNumber,
  getName,
  normalizeStatus,
  toDate,
} from "../lib/format";
import { sendNotifications } from "../lib/notificationFlow";
import type { TimestampValue, VendorApplication } from "../lib/types";
import { useRealtimeCollection } from "../lib/useFirestoreCollection";
import { useAuth } from "../providers/AuthProvider";

type VendorApplicationView = VendorApplication & {
  [key: string]: unknown;
  uid?: string;
  vendorId?: string;
  owner?: string;
  name?: string;
  businessName?: string;
  storeName?: string;
  vendorName?: string;
  ownerName?: string;
  email?: string;
  phone?: string;
  contact?: string;
  address?: string;
  location?: string;
  barangay?: string;
  city?: string;
  province?: string;
  description?: string;
  status?: string;
  dateApplied?: string;
  submittedAt?: TimestampValue;
  createdAt?: TimestampValue;
  updatedAt?: TimestampValue;
  reviewedAt?: TimestampValue;
  approvedAt?: TimestampValue;
  rejectedAt?: TimestampValue;
  reviewedBy?: string;
};

type StatusFilter = "all" | "pending" | "approved" | "rejected";
type VendorDecision = "approve" | "reject";

type DecisionTarget = {
  application: VendorApplicationView;
  decision: VendorDecision;
};

type DetailField = {
  label: string;
  value: unknown;
  fullWidth?: boolean;
};

type DocumentEntry = {
  label: string;
  value: string;
};

const STATUS_FILTERS: { label: string; value: StatusFilter }[] = [
  { label: "All Status", value: "all" },
  { label: "Pending", value: "pending" },
  { label: "Approved", value: "approved" },
  { label: "Rejected", value: "rejected" },
];

const KNOWN_APPLICATION_KEYS = new Set([
  "id",
  "uid",
  "vendorId",
  "owner",
  "ownerName",
  "name",
  "businessName",
  "storeName",
  "vendorName",
  "email",
  "phone",
  "contact",
  "address",
  "location",
  "barangay",
  "city",
  "province",
  "description",
  "status",
  "applicationStatus",
  "dateApplied",
  "submittedAt",
  "createdAt",
  "updatedAt",
  "reviewedAt",
  "reviewedBy",
  "approvedAt",
  "rejectedAt",
  "remarks",
  "rejectionReason",
  "documents",
  "permitImage",
  "validIdImage",
  "businessImage",
  "role",
]);

const SENSITIVE_FIELD_PATTERN =
  /(password|passcode|token|secret|credential|hash|auth|session|private.?key)/i;

function getApplicationBusinessName(application: VendorApplicationView) {
  return getName(
    application.businessName || application.storeName,
    application.vendorName || application.name,
    "Unnamed Business",
  );
}

function getApplicationOwner(application: VendorApplicationView) {
  return getName(
    application.ownerName || application.owner,
    application.name || application.vendorName,
    "Not provided",
  );
}

function getApplicationEmail(application: VendorApplicationView) {
  return typeof application.email === "string" ? application.email : "";
}

function getApplicationContact(application: VendorApplicationView) {
  if (typeof application.phone === "string" && application.phone.trim()) {
    return application.phone;
  }

  if (typeof application.contact === "string" && application.contact.trim()) {
    return application.contact;
  }

  return "-";
}

function getApplicationLocation(application: VendorApplicationView) {
  const locationParts = [
    application.location,
    application.address,
    application.barangay,
    application.city,
    application.province,
  ]
    .filter((part): part is string => typeof part === "string")
    .map((part) => part.trim())
    .filter(Boolean);

  return locationParts.length > 0 ? Array.from(new Set(locationParts)).join(", ") : "-";
}

function getApplicationStatus(application: VendorApplicationView) {
  return normalizeStatus(
    (typeof application.status === "string" && application.status) ||
      (typeof application.applicationStatus === "string" &&
        application.applicationStatus) ||
      "pending",
  );
}

function getApplicationCreatedValue(application: VendorApplicationView) {
  return (
    application.submittedAt ||
    application.createdAt ||
    application.dateApplied ||
    application.updatedAt ||
    application.reviewedAt
  );
}

function getApplicationCreatedTime(application: VendorApplicationView) {
  return toDate(getApplicationCreatedValue(application))?.getTime() ?? 0;
}

function getVendorUid(application: VendorApplicationView) {
  const vendorId =
    typeof application.vendorId === "string" ? application.vendorId.trim() : "";
  const uid = typeof application.uid === "string" ? application.uid.trim() : "";

  return vendorId || uid || application.id;
}

function isPendingApplication(application: VendorApplicationView) {
  const status = getApplicationStatus(application);

  return (
    status === "pending" ||
    status === "pending review" ||
    status === "under review" ||
    status.includes("pending")
  );
}

function isApprovedApplication(application: VendorApplicationView) {
  return getApplicationStatus(application) === "approved";
}

function isRejectedApplication(application: VendorApplicationView) {
  const status = getApplicationStatus(application);

  return status === "rejected" || status === "declined";
}

function hasDisplayValue(value: unknown) {
  if (value === null || value === undefined) {
    return false;
  }

  if (typeof value === "string") {
    return value.trim().length > 0;
  }

  if (Array.isArray(value)) {
    return value.length > 0;
  }

  if (typeof value === "object") {
    return Object.keys(value as Record<string, unknown>).length > 0;
  }

  return true;
}

function prettifyKey(key: string) {
  return key
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function displayValue(value: unknown) {
  if (!hasDisplayValue(value)) {
    return "Not provided";
  }

  if (typeof value === "boolean") {
    return value ? "Yes" : "No";
  }

  if (typeof value === "number") {
    return String(value);
  }

  if (typeof value === "string") {
    return value;
  }

  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

function isProbablyLink(value: string) {
  return /^(https?:\/\/|data:image\/)/i.test(value.trim());
}

function getDocumentEntries(application: VendorApplicationView): DocumentEntry[] {
  const entries: DocumentEntry[] = [];

  const addEntry = (label: string, value: unknown) => {
    if (typeof value !== "string" || !value.trim()) {
      return;
    }

    entries.push({ label, value: value.trim() });
  };

  addEntry("Business permit", application.permitImage);
  addEntry("Valid ID", application.validIdImage);
  addEntry("Business photo", application.businessImage);

  const documents = application.documents;

  if (Array.isArray(documents)) {
    documents.forEach((document, index) => {
      addEntry(`Document ${index + 1}`, document);
    });
  } else if (documents && typeof documents === "object") {
    Object.entries(documents as Record<string, unknown>).forEach(([key, value]) => {
      addEntry(prettifyKey(key), value);
    });
  }

  return entries;
}

function getAdditionalFields(application: VendorApplicationView): DetailField[] {
  return Object.entries(application)
    .filter(([key, value]) => {
      if (KNOWN_APPLICATION_KEYS.has(key)) {
        return false;
      }

      if (SENSITIVE_FIELD_PATTERN.test(key)) {
        return false;
      }

      return hasDisplayValue(value);
    })
    .map(([key, value]) => ({
      label: prettifyKey(key),
      value,
      fullWidth: typeof value === "object" && value !== null,
    }));
}

function getApplicationSearchText(application: VendorApplicationView) {
  const additionalText = getAdditionalFields(application)
    .map((field) => `${field.label} ${displayValue(field.value)}`)
    .join(" ");

  return [
    getApplicationBusinessName(application),
    getApplicationOwner(application),
    application.storeName,
    application.email,
    application.phone,
    application.contact,
    getApplicationLocation(application),
    application.description,
    application.status,
    application.applicationStatus,
    application.dateApplied,
    additionalText,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

export default function VendorApprovalPage() {
  const { user } = useAuth();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState("");
  const [reviewApplication, setReviewApplication] =
    useState<VendorApplicationView | null>(null);
  const [decisionTarget, setDecisionTarget] =
    useState<DecisionTarget | null>(null);
  const [reviewNote, setReviewNote] = useState("");
  const [decisionError, setDecisionError] = useState("");

  const {
    data: applications,
    loading,
    error,
  } = useRealtimeCollection<VendorApplicationView>(
    "vendor_applications",
    "createdAt",
  );

  const approvalStats = useMemo(() => {
    return {
      total: applications.length,
      pending: applications.filter(isPendingApplication).length,
      approved: applications.filter(isApprovedApplication).length,
      rejected: applications.filter(isRejectedApplication).length,
    };
  }, [applications]);

  const filteredApplications = useMemo(() => {
    const query = search.trim().toLowerCase();

    return [...applications]
      .filter((application) => {
        const status = getApplicationStatus(application);
        const matchesStatus =
          statusFilter === "all" ||
          status === statusFilter ||
          (statusFilter === "pending" && isPendingApplication(application)) ||
          (statusFilter === "approved" && isApprovedApplication(application)) ||
          (statusFilter === "rejected" && isRejectedApplication(application));
        const matchesSearch =
          !query || getApplicationSearchText(application).includes(query);

        return matchesStatus && matchesSearch;
      })
      .sort(
        (firstApplication, secondApplication) =>
          getApplicationCreatedTime(secondApplication) -
          getApplicationCreatedTime(firstApplication),
      );
  }, [applications, search, statusFilter]);

  function openReview(application: VendorApplicationView) {
    setFeedback("");
    setReviewApplication(application);
  }

  function openDecision(
    application: VendorApplicationView,
    decision: VendorDecision,
  ) {
    if (!isPendingApplication(application)) {
      setFeedback("Only pending applications can receive a new decision.");
      return;
    }

    setReviewNote("");
    setDecisionError("");
    setFeedback("");
    setDecisionTarget({ application, decision });
  }

  async function approveVendor(
    application: VendorApplicationView,
    note: string,
  ) {
    const now = Date.now();
    const vendorUid = getVendorUid(application);
    const businessName = getApplicationBusinessName(application);
    const ownerName = getApplicationOwner(application);
    const email = getApplicationEmail(application);
    const phone = getApplicationContact(application) === "-"
      ? ""
      : getApplicationContact(application);
    const submittedAt = getApplicationCreatedValue(application) || now;

    if (!vendorUid) {
      setFeedback("Unable to approve vendor. Missing vendor UID.");
      return;
    }

    try {
      setProcessingId(application.id);
      setFeedback("");

      await updatePaths({
        [`vendor_applications/${application.id}/uid`]: vendorUid,
        [`vendor_applications/${application.id}/vendorId`]: vendorUid,
        [`vendor_applications/${application.id}/status`]: "approved",
        [`vendor_applications/${application.id}/applicationStatus`]: "approved",
        [`vendor_applications/${application.id}/remarks`]: note || null,
        [`vendor_applications/${application.id}/reviewedAt`]: now,
        [`vendor_applications/${application.id}/reviewedBy`]: user?.uid || "admin",
        [`vendor_applications/${application.id}/approvedAt`]: now,
        [`vendor_applications/${application.id}/updatedAt`]: now,

        [`vendors/${vendorUid}/uid`]: vendorUid,
        [`vendors/${vendorUid}/vendorId`]: vendorUid,
        [`vendors/${vendorUid}/businessName`]: businessName,
        [`vendors/${vendorUid}/storeName`]:
          (typeof application.storeName === "string" && application.storeName) ||
          businessName,
        [`vendors/${vendorUid}/vendorName`]:
          (typeof application.vendorName === "string" && application.vendorName) ||
          businessName,
        [`vendors/${vendorUid}/ownerName`]: ownerName,
        [`vendors/${vendorUid}/name`]: ownerName,
        [`vendors/${vendorUid}/email`]: email,
        [`vendors/${vendorUid}/phone`]: phone,
        [`vendors/${vendorUid}/contact`]: phone,
        [`vendors/${vendorUid}/address`]:
          typeof application.address === "string" ? application.address : "",
        [`vendors/${vendorUid}/location`]:
          typeof application.location === "string" ? application.location : "",
        [`vendors/${vendorUid}/barangay`]:
          typeof application.barangay === "string" ? application.barangay : "",
        [`vendors/${vendorUid}/city`]:
          typeof application.city === "string" ? application.city : "",
        [`vendors/${vendorUid}/province`]:
          typeof application.province === "string" ? application.province : "",
        [`vendors/${vendorUid}/description`]:
          typeof application.description === "string" ? application.description : "",
        [`vendors/${vendorUid}/documents`]: application.documents || null,
        [`vendors/${vendorUid}/permitImage`]: application.permitImage || null,
        [`vendors/${vendorUid}/validIdImage`]: application.validIdImage || null,
        [`vendors/${vendorUid}/businessImage`]: application.businessImage || null,
        [`vendors/${vendorUid}/role`]: "vendor",
        [`vendors/${vendorUid}/status`]: "active",
        [`vendors/${vendorUid}/applicationStatus`]: "approved",
        [`vendors/${vendorUid}/approvedAt`]: now,
        [`vendors/${vendorUid}/updatedAt`]: now,
        [`vendors/${vendorUid}/createdAt`]: submittedAt,

        [`users/${vendorUid}/uid`]: vendorUid,
        [`users/${vendorUid}/vendorId`]: vendorUid,
        [`users/${vendorUid}/name`]: ownerName,
        [`users/${vendorUid}/ownerName`]: ownerName,
        [`users/${vendorUid}/businessName`]: businessName,
        [`users/${vendorUid}/storeName`]:
          (typeof application.storeName === "string" && application.storeName) ||
          businessName,
        [`users/${vendorUid}/vendorName`]:
          (typeof application.vendorName === "string" && application.vendorName) ||
          businessName,
        [`users/${vendorUid}/email`]: email,
        [`users/${vendorUid}/phone`]: phone,
        [`users/${vendorUid}/contact`]: phone,
        [`users/${vendorUid}/role`]: "vendor",
        [`users/${vendorUid}/status`]: "active",
        [`users/${vendorUid}/applicationStatus`]: "approved",
        [`users/${vendorUid}/approvedAt`]: now,
        [`users/${vendorUid}/updatedAt`]: now,
        [`users/${vendorUid}/createdAt`]: submittedAt,
      });

      try {
        await createActivityLog({
          type: "Vendor Approval",
          action: "vendor_application_approved",
          module: "Vendor Management",
          description: `Vendor application approved: ${businessName}`,
          entityType: "vendor_application",
          entityId: vendorUid,
          metadata: {
            vendorId: vendorUid,
            applicationId: application.id,
            reviewNote: note,
          },
        });
      } catch (logError) {
        console.error("Vendor approved, but audit logging failed:", logError);
      }

      try {
        await sendNotifications(
          [
            {
              id: vendorUid,
              role: "vendor",
              name: ownerName,
              email,
            },
          ],
          {
            title: "Vendor application approved",
            message:
              "Your IsdaGo vendor application has been approved. You can now open your vendor dashboard.",
            type: "vendor_approval",
            category: "account",
            severity: "success",
            actionType: "vendor_application",
            actionId: application.id,
          },
        );
      } catch (notificationError) {
        console.error(
          "Vendor approved, but notification delivery failed:",
          notificationError,
        );
      }

      setFeedback(`${businessName} has been approved successfully.`);
      setDecisionTarget(null);
      setReviewApplication(null);
    } catch (approveError) {
      console.error("Vendor approval failed:", approveError);
      setFeedback("Unable to approve vendor application. Please try again.");
    } finally {
      setProcessingId(null);
    }
  }

  async function rejectVendor(
    application: VendorApplicationView,
    reason: string,
  ) {
    const now = Date.now();
    const vendorUid = getVendorUid(application);
    const businessName = getApplicationBusinessName(application);

    if (!vendorUid) {
      setFeedback("Unable to reject vendor. Missing vendor UID.");
      return;
    }

    try {
      setProcessingId(application.id);
      setFeedback("");

      await updatePaths({
        [`vendor_applications/${application.id}/uid`]: vendorUid,
        [`vendor_applications/${application.id}/vendorId`]: vendorUid,
        [`vendor_applications/${application.id}/status`]: "rejected",
        [`vendor_applications/${application.id}/applicationStatus`]: "rejected",
        [`vendor_applications/${application.id}/remarks`]: reason,
        [`vendor_applications/${application.id}/reviewedAt`]: now,
        [`vendor_applications/${application.id}/reviewedBy`]: user?.uid || "admin",
        [`vendor_applications/${application.id}/rejectedAt`]: now,
        [`vendor_applications/${application.id}/updatedAt`]: now,

        [`users/${vendorUid}/uid`]: vendorUid,
        [`users/${vendorUid}/vendorId`]: vendorUid,
        [`users/${vendorUid}/role`]: "vendor",
        [`users/${vendorUid}/status`]: "rejected",
        [`users/${vendorUid}/applicationStatus`]: "rejected",
        [`users/${vendorUid}/rejectionReason`]: reason,
        [`users/${vendorUid}/rejectedAt`]: now,
        [`users/${vendorUid}/updatedAt`]: now,
      });

      try {
        await createActivityLog({
          type: "Vendor Approval",
          action: "vendor_application_rejected",
          module: "Vendor Management",
          description: `Vendor application rejected: ${businessName}`,
          entityType: "vendor_application",
          entityId: vendorUid,
          severity: "warning",
          metadata: {
            vendorId: vendorUid,
            applicationId: application.id,
            reason,
          },
        });
      } catch (logError) {
        console.error("Vendor rejected, but audit logging failed:", logError);
      }

      try {
        await sendNotifications(
          [
            {
              id: vendorUid,
              role: "vendor",
              name: getApplicationOwner(application),
              email: getApplicationEmail(application),
            },
          ],
          {
            title: "Vendor application update",
            message: `Your vendor application was not approved. Reason: ${reason}`,
            type: "vendor_approval",
            category: "account",
            severity: "warning",
            actionType: "vendor_application",
            actionId: application.id,
          },
        );
      } catch (notificationError) {
        console.error(
          "Vendor rejected, but notification delivery failed:",
          notificationError,
        );
      }

      setFeedback(`${businessName} has been rejected.`);
      setDecisionTarget(null);
      setReviewApplication(null);
    } catch (rejectError) {
      console.error("Vendor rejection failed:", rejectError);
      setFeedback("Unable to reject vendor application. Please try again.");
    } finally {
      setProcessingId(null);
    }
  }

  async function confirmDecision() {
    if (!decisionTarget) {
      return;
    }

    const note = reviewNote.trim();

    if (decisionTarget.decision === "reject" && note.length < 5) {
      setDecisionError("Enter a clear rejection reason of at least 5 characters.");
      return;
    }

    setDecisionError("");

    if (decisionTarget.decision === "approve") {
      await approveVendor(decisionTarget.application, note);
    } else {
      await rejectVendor(decisionTarget.application, note);
    }
  }

  const selectedAdditionalFields = reviewApplication
    ? getAdditionalFields(reviewApplication)
    : [];
  const selectedDocuments = reviewApplication
    ? getDocumentEntries(reviewApplication)
    : [];

  return (
    <DashboardShell
      title="Vendor Approvals"
      description="Open each application like a review file, verify all submitted details, then approve or reject it."
    >
      <div className="module-page">
        {error && (
          <div className="error-box">
            <strong>Unable to load vendor applications</strong>
            <p>{error}</p>
          </div>
        )}

        {feedback && <div className="notice">{feedback}</div>}

        <section className="grid grid-4">
          <StatCard
            title="Applications"
            value={approvalStats.total}
            description="Total submitted applications"
            icon={<Store size={24} strokeWidth={2.4} />}
            tone="blue"
          />

          <StatCard
            title="Pending Review"
            value={approvalStats.pending}
            description="Waiting for admin decision"
            icon={<Clock size={24} strokeWidth={2.4} />}
            tone="yellow"
          />

          <StatCard
            title="Approved"
            value={approvalStats.approved}
            description="Accepted vendor applications"
            icon={<CheckCircle2 size={24} strokeWidth={2.4} />}
            tone="green"
          />

          <StatCard
            title="Rejected"
            value={approvalStats.rejected}
            description="Declined vendor applications"
            icon={<XCircle size={24} strokeWidth={2.4} />}
            tone="red"
          />
        </section>

        <SectionCard
          title="Vendor Applications"
          description={`${formatNumber(filteredApplications.length)} application record${
            filteredApplications.length === 1 ? "" : "s"
          } found. Open Review File to inspect the complete information saved by the vendor application.`}
          actions={
            <>
              <label className="topbar-search">
                <Search size={18} strokeWidth={2.4} />
                <input
                  type="search"
                  placeholder="Search applications..."
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  aria-label="Search vendor applications"
                />
              </label>

              <select
                className="select"
                value={statusFilter}
                onChange={(event) =>
                  setStatusFilter(event.target.value as StatusFilter)
                }
                aria-label="Filter applications by status"
              >
                {STATUS_FILTERS.map((filter) => (
                  <option key={filter.value} value={filter.value}>
                    {filter.label}
                  </option>
                ))}
              </select>
            </>
          }
        >
          {loading ? (
            <EmptyState
              title="Loading vendor applications"
              message="Fetching application records from Firebase Realtime Database."
              icon={<ShieldCheck size={34} strokeWidth={2.3} />}
            />
          ) : filteredApplications.length === 0 ? (
            <EmptyState
              title="No applications found"
              message="Vendor applications will appear here once sellers apply."
              icon={<ShieldCheck size={34} strokeWidth={2.3} />}
            />
          ) : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Business</th>
                    <th>Owner</th>
                    <th>Email</th>
                    <th>Contact</th>
                    <th>Location</th>
                    <th>Status</th>
                    <th>Date Applied</th>
                    <th>Review</th>
                  </tr>
                </thead>

                <tbody>
                  {filteredApplications.map((application) => {
                    const status = getApplicationStatus(application);
                    const isProcessing = processingId === application.id;

                    return (
                      <tr key={application.id}>
                        <td>
                          <strong>{getApplicationBusinessName(application)}</strong>
                          {application.description && (
                            <small className="vendor-application-table-note">
                              {String(application.description)}
                            </small>
                          )}
                        </td>

                        <td>
                          <UserRound size={14} strokeWidth={2.4} />{" "}
                          {getApplicationOwner(application)}
                        </td>

                        <td>
                          {application.email ? (
                            <a href={`mailto:${String(application.email)}`}>
                              <Mail size={14} strokeWidth={2.4} />{" "}
                              {String(application.email)}
                            </a>
                          ) : (
                            "-"
                          )}
                        </td>

                        <td>
                          {getApplicationContact(application) !== "-" ? (
                            <>
                              <Phone size={14} strokeWidth={2.4} />{" "}
                              {getApplicationContact(application)}
                            </>
                          ) : (
                            "-"
                          )}
                        </td>

                        <td>
                          <MapPin size={14} strokeWidth={2.4} />{" "}
                          {getApplicationLocation(application)}
                        </td>

                        <td>
                          <StatusBadge status={status} />
                        </td>

                        <td>{formatDate(getApplicationCreatedValue(application))}</td>

                        <td>
                          <button
                            type="button"
                            className="btn"
                            disabled={isProcessing}
                            onClick={() => openReview(application)}
                          >
                            {isProcessing ? "Processing..." : "Review File"}
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </SectionCard>
      </div>

      {reviewApplication && (
        <div className="modal-overlay vendor-application-file-overlay" role="presentation">
          <section
            className="modal-container vendor-application-file"
            role="dialog"
            aria-modal="true"
            aria-labelledby="vendor-application-file-title"
          >
            <header className="modal-header vendor-application-file__header">
              <div>
                <small>VENDOR APPLICATION FILE</small>
                <h2 id="vendor-application-file-title">
                  {getApplicationBusinessName(reviewApplication)}
                </h2>
                <p>
                  Review every application field stored in Firebase before making a decision.
                </p>
              </div>

              <button
                type="button"
                className="account-moderation-close"
                onClick={() => !processingId && setReviewApplication(null)}
                disabled={Boolean(processingId)}
                aria-label="Close application file"
              >
                <X size={19} strokeWidth={2.4} />
              </button>
            </header>

            <div className="modal-body vendor-application-file__body">
              <div className="vendor-application-file__summary">
                <div>
                  <span>Status</span>
                  <StatusBadge status={getApplicationStatus(reviewApplication)} />
                </div>
                <div>
                  <span>Application ID</span>
                  <strong>{reviewApplication.id}</strong>
                </div>
                <div>
                  <span>Vendor UID</span>
                  <strong>{getVendorUid(reviewApplication)}</strong>
                </div>
                <div>
                  <span>Date submitted</span>
                  <strong>{formatDate(getApplicationCreatedValue(reviewApplication))}</strong>
                </div>
              </div>

              <section className="vendor-application-file__section">
                <div className="vendor-application-file__section-heading">
                  <UserRound size={18} strokeWidth={2.3} />
                  <div>
                    <h3>Applicant Details</h3>
                    <p>Identity and contact information entered during application.</p>
                  </div>
                </div>
                <div className="vendor-application-file__grid">
                  <div className="vendor-application-field">
                    <span>Owner name</span>
                    <strong>{getApplicationOwner(reviewApplication)}</strong>
                  </div>
                  <div className="vendor-application-field">
                    <span>Email address</span>
                    <strong>{getApplicationEmail(reviewApplication) || "Not provided"}</strong>
                  </div>
                  <div className="vendor-application-field">
                    <span>Phone number</span>
                    <strong>{getApplicationContact(reviewApplication)}</strong>
                  </div>
                </div>
              </section>

              <section className="vendor-application-file__section">
                <div className="vendor-application-file__section-heading">
                  <Store size={18} strokeWidth={2.3} />
                  <div>
                    <h3>Business Details</h3>
                    <p>Store information submitted by the vendor.</p>
                  </div>
                </div>
                <div className="vendor-application-file__grid">
                  <div className="vendor-application-field">
                    <span>Store / business name</span>
                    <strong>{getApplicationBusinessName(reviewApplication)}</strong>
                  </div>
                  <div className="vendor-application-field vendor-application-field--wide">
                    <span>Business address</span>
                    <strong>{getApplicationLocation(reviewApplication)}</strong>
                  </div>
                  <div className="vendor-application-field vendor-application-field--wide">
                    <span>Business description</span>
                    <strong>
                      {displayValue(reviewApplication.description)}
                    </strong>
                  </div>
                </div>
              </section>

              {selectedDocuments.length > 0 && (
                <section className="vendor-application-file__section">
                  <div className="vendor-application-file__section-heading">
                    <ShieldCheck size={18} strokeWidth={2.3} />
                    <div>
                      <h3>Submitted Documents</h3>
                      <p>Files or image references included in the application record.</p>
                    </div>
                  </div>
                  <div className="vendor-document-grid">
                    {selectedDocuments.map((document, index) => (
                      <article
                        className="vendor-document-card"
                        key={`${document.label}-${index}`}
                      >
                        <span>{document.label}</span>
                        {isProbablyLink(document.value) ? (
                          <a
                            href={document.value}
                            target="_blank"
                            rel="noreferrer"
                            className="vendor-document-link"
                          >
                            Open submitted file
                          </a>
                        ) : (
                          <strong>{document.value}</strong>
                        )}
                      </article>
                    ))}
                  </div>
                </section>
              )}

              {selectedAdditionalFields.length > 0 && (
                <section className="vendor-application-file__section">
                  <div className="vendor-application-file__section-heading">
                    <ShieldCheck size={18} strokeWidth={2.3} />
                    <div>
                      <h3>Other Submitted Information</h3>
                      <p>
                        Additional fields found in Firebase are shown automatically so new
                        application inputs are not hidden from the admin review.
                      </p>
                    </div>
                  </div>
                  <div className="vendor-application-file__grid">
                    {selectedAdditionalFields.map((field) => (
                      <div
                        className={`vendor-application-field${
                          field.fullWidth ? " vendor-application-field--wide" : ""
                        }`}
                        key={field.label}
                      >
                        <span>{field.label}</span>
                        {typeof field.value === "object" && field.value !== null ? (
                          <pre>{displayValue(field.value)}</pre>
                        ) : (
                          <strong>{displayValue(field.value)}</strong>
                        )}
                      </div>
                    ))}
                  </div>
                </section>
              )}

              {(reviewApplication.reviewedAt ||
                reviewApplication.reviewedBy ||
                reviewApplication.remarks ||
                reviewApplication.approvedAt ||
                reviewApplication.rejectedAt) && (
                <section className="vendor-application-file__section">
                  <div className="vendor-application-file__section-heading">
                    <Clock size={18} strokeWidth={2.3} />
                    <div>
                      <h3>Admin Review History</h3>
                      <p>Decision details already recorded for this application.</p>
                    </div>
                  </div>
                  <div className="vendor-application-file__grid">
                    <div className="vendor-application-field">
                      <span>Reviewed by</span>
                      <strong>{displayValue(reviewApplication.reviewedBy)}</strong>
                    </div>
                    <div className="vendor-application-field">
                      <span>Reviewed at</span>
                      <strong>{formatDate(reviewApplication.reviewedAt)}</strong>
                    </div>
                    <div className="vendor-application-field vendor-application-field--wide">
                      <span>Admin remarks / reason</span>
                      <strong>{displayValue(reviewApplication.remarks)}</strong>
                    </div>
                  </div>
                </section>
              )}

              <div className="vendor-application-security-note">
                Passwords and authentication secrets are intentionally never displayed in the
                admin application file. Firebase Authentication manages passwords separately and
                the vendor application record should not store them.
              </div>
            </div>

            <footer className="modal-footer vendor-application-file__footer">
              <button
                type="button"
                className="btn"
                onClick={() => setReviewApplication(null)}
                disabled={Boolean(processingId)}
              >
                Close
              </button>

              {isPendingApplication(reviewApplication) && (
                <>
                  <button
                    type="button"
                    className="btn btn-red"
                    onClick={() => openDecision(reviewApplication, "reject")}
                    disabled={Boolean(processingId)}
                  >
                    Reject Application
                  </button>
                  <button
                    type="button"
                    className="btn btn-green"
                    onClick={() => openDecision(reviewApplication, "approve")}
                    disabled={Boolean(processingId)}
                  >
                    Approve Vendor
                  </button>
                </>
              )}
            </footer>
          </section>
        </div>
      )}

      {decisionTarget && (
        <div className="modal-overlay" role="presentation">
          <section
            className="modal-container vendor-decision-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="vendor-decision-title"
          >
            <header className="modal-header">
              <div className="vendor-decision-heading">
                <span
                  className={
                    decisionTarget.decision === "approve"
                      ? "vendor-decision-icon vendor-decision-icon--approve"
                      : "vendor-decision-icon vendor-decision-icon--reject"
                  }
                  aria-hidden="true"
                >
                  {decisionTarget.decision === "approve" ? (
                    <CheckCircle2 size={21} strokeWidth={2.4} />
                  ) : (
                    <XCircle size={21} strokeWidth={2.4} />
                  )}
                </span>
                <div>
                  <small>VENDOR APPLICATION DECISION</small>
                  <h2 id="vendor-decision-title">
                    {decisionTarget.decision === "approve"
                      ? "Approve vendor"
                      : "Reject application"}
                  </h2>
                </div>
              </div>

              <button
                type="button"
                className="account-moderation-close"
                onClick={() => !processingId && setDecisionTarget(null)}
                disabled={Boolean(processingId)}
                aria-label="Close vendor decision"
              >
                <X size={19} strokeWidth={2.4} />
              </button>
            </header>

            <div className="modal-body">
              <div className="account-moderation-subject">
                <span>Application</span>
                <strong>
                  {getApplicationBusinessName(decisionTarget.application)}
                </strong>
                <small>
                  Owner: {getApplicationOwner(decisionTarget.application)}
                </small>
              </div>

              <label className="form-group" htmlFor="vendorReviewNote">
                <span>
                  {decisionTarget.decision === "reject"
                    ? "Reason for rejection"
                    : "Internal review note (optional)"}
                </span>
                <textarea
                  id="vendorReviewNote"
                  className="textarea"
                  value={reviewNote}
                  onChange={(event) => setReviewNote(event.target.value)}
                  placeholder={
                    decisionTarget.decision === "reject"
                      ? "Explain which application requirement was not satisfied."
                      : "Record what you verified before approval."
                  }
                  maxLength={500}
                  disabled={Boolean(processingId)}
                />
              </label>

              {decisionError && (
                <div className="account-moderation-error">{decisionError}</div>
              )}

              <p className="vendor-decision-helper">
                The decision updates the application and user account together,
                records an audit event, and sends a private mobile notification.
              </p>
            </div>

            <footer className="modal-footer">
              <button
                type="button"
                className="btn"
                onClick={() => setDecisionTarget(null)}
                disabled={Boolean(processingId)}
              >
                Cancel
              </button>
              <button
                type="button"
                className={
                  decisionTarget.decision === "approve"
                    ? "btn btn-green"
                    : "btn btn-red"
                }
                onClick={confirmDecision}
                disabled={Boolean(processingId)}
              >
                {processingId
                  ? "Saving decision…"
                  : decisionTarget.decision === "approve"
                    ? "Approve Vendor"
                    : "Reject Application"}
              </button>
            </footer>
          </section>
        </div>
      )}
    </DashboardShell>
  );
}
