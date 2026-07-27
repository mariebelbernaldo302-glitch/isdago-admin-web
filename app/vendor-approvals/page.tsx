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
import { useRealtimeCollection } from "../lib/useFirestoreCollection";
import { sendNotifications } from "../lib/notificationFlow";
import type { VendorApplication } from "../lib/types";
import { useAuth } from "../providers/AuthProvider";

type VendorApplicationView = VendorApplication & {
  uid?: string;
  vendorId?: string;
  owner?: string;
  name?: string;
  businessName?: string;
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
  status?: string;
  dateApplied?: string;
  createdAt?: number | string;
  updatedAt?: number | string;
  reviewedAt?: number | string;
};

type StatusFilter = "all" | "pending" | "approved" | "rejected";
type VendorDecision = "approve" | "reject";

type DecisionTarget = {
  application: VendorApplicationView;
  decision: VendorDecision;
};

const STATUS_FILTERS: { label: string; value: StatusFilter }[] = [
  { label: "All Status", value: "all" },
  { label: "Pending", value: "pending" },
  { label: "Approved", value: "approved" },
  { label: "Rejected", value: "rejected" },
];

function getApplicationBusinessName(application: VendorApplicationView) {
  return getName(
    application.businessName,
    application.vendorName || application.name,
    "Unnamed Business"
  );
}

function getApplicationOwner(application: VendorApplicationView) {
  return getName(
    application.ownerName || application.owner,
    application.vendorName || application.name,
    "Not provided"
  );
}

function getApplicationEmail(application: VendorApplicationView) {
  return application.email || "";
}

function getApplicationContact(application: VendorApplicationView) {
  return application.phone || application.contact || "-";
}

function getApplicationLocation(application: VendorApplicationView) {
  const locationParts = [
    application.location,
    application.address,
    application.barangay,
    application.city,
    application.province,
  ]
    .map((part) => part?.trim())
    .filter(Boolean);

  return locationParts.length > 0 ? locationParts.join(", ") : "-";
}

function getApplicationStatus(application: VendorApplicationView) {
  return normalizeStatus(application.status || "pending");
}

function getApplicationCreatedTime(application: VendorApplicationView) {
  return (
    toDate(
      application.createdAt ||
        application.updatedAt ||
        application.reviewedAt ||
        application.dateApplied
    )?.getTime() ?? 0
  );
}

function getVendorUid(application: VendorApplicationView) {
  return application.vendorId || application.uid || application.id;
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

export default function VendorApprovalPage() {
  const { user } = useAuth();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState("");
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
    "createdAt"
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

        const searchableText = [
          getApplicationBusinessName(application),
          getApplicationOwner(application),
          application.email,
          application.phone,
          application.contact,
          getApplicationLocation(application),
          application.status,
          application.dateApplied,
        ]
          .join(" ")
          .toLowerCase();

        const matchesSearch = !query || searchableText.includes(query);

        return matchesStatus && matchesSearch;
      })
      .sort((firstApplication, secondApplication) => {
        return (
          getApplicationCreatedTime(secondApplication) -
          getApplicationCreatedTime(firstApplication)
        );
      });
  }, [applications, search, statusFilter]);

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
    const phone = application.phone || application.contact || "";

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
        [`vendor_applications/${application.id}/remarks`]: note || null,
        [`vendor_applications/${application.id}/reviewedAt`]: now,
        [`vendor_applications/${application.id}/reviewedBy`]: user?.uid || "admin",
        [`vendor_applications/${application.id}/approvedAt`]: now,
        [`vendor_applications/${application.id}/updatedAt`]: now,

        [`vendors/${vendorUid}/uid`]: vendorUid,
        [`vendors/${vendorUid}/vendorId`]: vendorUid,
        [`vendors/${vendorUid}/businessName`]: businessName,
        [`vendors/${vendorUid}/storeName`]: businessName,
        [`vendors/${vendorUid}/vendorName`]: application.vendorName || businessName,
        [`vendors/${vendorUid}/ownerName`]: ownerName,
        [`vendors/${vendorUid}/name`]: ownerName,
        [`vendors/${vendorUid}/email`]: email,
        [`vendors/${vendorUid}/phone`]: phone,
        [`vendors/${vendorUid}/contact`]: phone,
        [`vendors/${vendorUid}/address`]: application.address || "",
        [`vendors/${vendorUid}/location`]: application.location || "",
        [`vendors/${vendorUid}/barangay`]: application.barangay || "",
        [`vendors/${vendorUid}/city`]: application.city || "",
        [`vendors/${vendorUid}/province`]: application.province || "",
        [`vendors/${vendorUid}/role`]: "vendor",
        [`vendors/${vendorUid}/status`]: "active",
        [`vendors/${vendorUid}/applicationStatus`]: "approved",
        [`vendors/${vendorUid}/approvedAt`]: now,
        [`vendors/${vendorUid}/updatedAt`]: now,
        [`vendors/${vendorUid}/createdAt`]: application.createdAt || now,

        [`users/${vendorUid}/uid`]: vendorUid,
        [`users/${vendorUid}/vendorId`]: vendorUid,
        [`users/${vendorUid}/name`]: ownerName,
        [`users/${vendorUid}/ownerName`]: ownerName,
        [`users/${vendorUid}/businessName`]: businessName,
        [`users/${vendorUid}/storeName`]: businessName,
        [`users/${vendorUid}/vendorName`]: application.vendorName || businessName,
        [`users/${vendorUid}/email`]: email,
        [`users/${vendorUid}/phone`]: phone,
        [`users/${vendorUid}/contact`]: phone,
        [`users/${vendorUid}/role`]: "vendor",
        [`users/${vendorUid}/status`]: "active",
        [`users/${vendorUid}/applicationStatus`]: "approved",
        [`users/${vendorUid}/approvedAt`]: now,
        [`users/${vendorUid}/updatedAt`]: now,
        [`users/${vendorUid}/createdAt`]: application.createdAt || now,
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
        console.error("Vendor approved, but notification delivery failed:", notificationError);
      }

      setFeedback(`${businessName} has been approved successfully.`);
      setDecisionTarget(null);
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
        console.error("Vendor rejected, but notification delivery failed:", notificationError);
      }

      setFeedback(`${businessName} has been rejected.`);
      setDecisionTarget(null);
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

  return (
    <DashboardShell
      title="Vendor Approvals"
      description="Verify seller identity and make a documented approval decision."
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
          } found.`}
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
                    <th>Action</th>
                  </tr>
                </thead>

                <tbody>
                  {filteredApplications.map((application) => {
                    const status = getApplicationStatus(application);
                    const pending = isPendingApplication(application);
                    const approved = isApprovedApplication(application);
                    const rejected = isRejectedApplication(application);
                    const isProcessing = processingId === application.id;

                    return (
                      <tr key={application.id}>
                        <td>
                          <strong>{getApplicationBusinessName(application)}</strong>
                        </td>

                        <td>
                          <UserRound size={14} strokeWidth={2.4} />{" "}
                          {getApplicationOwner(application)}
                        </td>

                        <td>
                          {application.email ? (
                            <a href={`mailto:${application.email}`}>
                              <Mail size={14} strokeWidth={2.4} />{" "}
                              {application.email}
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

                        <td>
                          {formatDate(
                            application.createdAt ||
                              application.updatedAt ||
                              application.dateApplied
                          )}
                        </td>

                        <td>
                          <div className="toolbar">
                            <button
                              type="button"
                              className="btn btn-green"
                              disabled={!pending || approved || isProcessing}
                              onClick={() => openDecision(application, "approve")}
                            >
                              {isProcessing ? "Processing..." : "Approve"}
                            </button>

                            <button
                              type="button"
                              className="btn btn-red"
                              disabled={!pending || rejected || isProcessing}
                              onClick={() => openDecision(application, "reject")}
                            >
                              Reject
                            </button>
                          </div>
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
                      : "Record verified documents or review observations."
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
