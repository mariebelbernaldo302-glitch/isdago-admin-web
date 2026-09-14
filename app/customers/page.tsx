"use client";

import { useMemo, useState } from "react";
import {
  Ban,
  Mail,
  Phone,
  RotateCcw,
  Search,
  ShieldAlert,
  ShieldCheck,
  UserCheck,
  UserRoundX,
  Users,
  X,
} from "lucide-react";

import AccountModerationDialog, {
  type AccountModerationAction,
} from "../components/AccountModerationDialog";
import DashboardShell from "../components/DashboardShell";
import { getRecord } from "../lib/database";
import EmptyState from "../components/EmptyState";
import SectionCard from "../components/SectionCard";
import StatCard from "../components/StatCard";
import StatusBadge from "../components/StatusBadge";
import {
  moderateAccount,
  type ModerationDecision,
} from "../lib/accountModeration";
import {
  formatDate,
  formatNumber,
  normalizeStatus,
  toDate,
} from "../lib/format";
import type { Customer, IdentityDocument, UserRecord } from "../lib/types";
import { useRealtimeCollection } from "../lib/useFirestoreCollection";

type ReportReference = {
  id: string;
  reportedUserId?: string;
  status?: string;
};

type ModerationTarget = {
  customer: Customer;
  action: AccountModerationAction;
};

const STATUS_FILTERS = [
  { label: "All status", value: "all" },
  { label: "Active", value: "active" },
  { label: "Suspended", value: "suspended" },
  { label: "Disabled", value: "disabled" },
  { label: "Inactive", value: "inactive" },
] as const;

type StatusFilter = (typeof STATUS_FILTERS)[number]["value"];

function getCustomerUid(customer: Customer) {
  return customer.uid?.trim() || customer.id;
}

function getCustomerName(customer: Customer) {
  return (
    customer.fullName?.trim() ||
    customer.name?.trim() ||
    customer.displayName?.trim() ||
    customer.email?.split("@")[0] ||
    "Unnamed Customer"
  );
}

function getCustomerStatus(customer: Customer, user?: UserRecord) {
  return normalizeStatus(user?.status || customer.status || "active");
}

function getCustomerAddress(customer: Customer) {
  const addressParts = [
    customer.address,
    customer.barangay,
    customer.city,
    customer.province,
  ]
    .map((part) => part?.trim())
    .filter(Boolean);

  return addressParts.length > 0 ? addressParts.join(", ") : "—";
}

function getCustomerCreatedTime(customer: Customer) {
  return (
    toDate(customer.createdAt ?? customer.updatedAt ?? customer.dateRegistered)
      ?.getTime() ?? 0
  );
}

function isRestricted(status: string) {
  return ["suspended", "disabled", "blocked", "inactive"].includes(status);
}

function getCustomerModeration(customer: Customer, user?: UserRecord) {
  return {
    reason: user?.moderationReason || customer.moderationReason || "",
    details: user?.moderationDetails || customer.moderationDetails || "",
    suspendedUntil: user?.suspendedUntil || customer.suspendedUntil,
  };
}

function formatSuspensionUntil(value: UserRecord["suspendedUntil"]) {
  const date = toDate(value);

  if (!date) {
    return "No return date";
  }

  return date.toLocaleString("en-PH", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

export default function CustomersPage() {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [moderationTarget, setModerationTarget] =
    useState<ModerationTarget | null>(null);
  const [processing, setProcessing] = useState(false);
  const [feedback, setFeedback] = useState("");
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [identityDocument, setIdentityDocument] =
    useState<IdentityDocument | null>(null);
  const [identityLoading, setIdentityLoading] = useState(false);
  const [identityError, setIdentityError] = useState("");

  const customersQuery = useRealtimeCollection<Customer>(
    "customers",
    "createdAt",
  );
  const usersQuery = useRealtimeCollection<UserRecord>("users", "createdAt");
  const reportsQuery = useRealtimeCollection<ReportReference>(
    "reports",
    "createdAt",
  );

  const usersById = useMemo(() => {
    const lookup = new Map<string, UserRecord>();

    usersQuery.data.forEach((user) => {
      lookup.set(user.uid || user.id, user);
      lookup.set(user.id, user);
    });

    return lookup;
  }, [usersQuery.data]);

  const reportCounts = useMemo(() => {
    const counts = new Map<string, number>();

    reportsQuery.data.forEach((report) => {
      const userId = report.reportedUserId?.trim();

      if (userId) {
        counts.set(userId, (counts.get(userId) || 0) + 1);
      }
    });

    return counts;
  }, [reportsQuery.data]);

  const customerStats = useMemo(() => {
    let active = 0;
    let restricted = 0;
    let reported = 0;

    customersQuery.data.forEach((customer) => {
      const uid = getCustomerUid(customer);
      const status = getCustomerStatus(customer, usersById.get(uid));

      if (status === "active" || status === "approved" || status === "verified") {
        active++;
      }

      if (isRestricted(status)) {
        restricted++;
      }

      if ((reportCounts.get(uid) || 0) > 0) {
        reported++;
      }
    });

    return {
      total: customersQuery.data.length,
      active,
      reported,
      restricted,
    };
  }, [customersQuery.data, usersById, reportCounts]);

  const filteredCustomers = useMemo(() => {
    const query = search.trim().toLowerCase();

    return [...customersQuery.data]
      .filter((customer) => {
        const uid = getCustomerUid(customer);
        const user = usersById.get(uid);
        const status = getCustomerStatus(customer, user);
        const matchesStatus =
          statusFilter === "all" || status === statusFilter;
        const searchableText = [
          getCustomerName(customer),
          customer.email,
          customer.phone,
          getCustomerAddress(customer),
          customer.validIdType,
          customer.identityVerificationStatus,
          status,
          uid,
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();

        return matchesStatus && (!query || searchableText.includes(query));
      })
      .sort(
        (first, second) =>
          getCustomerCreatedTime(second) - getCustomerCreatedTime(first),
      );
  }, [customersQuery.data, usersById, search, statusFilter]);

  async function openIdentityFile(customer: Customer) {
    const uid = getCustomerUid(customer);

    setSelectedCustomer(customer);
    setIdentityDocument(null);
    setIdentityError("");
    setIdentityLoading(true);

    try {
      const document = await getRecord<IdentityDocument>(
        "identity_documents",
        uid,
      );
      setIdentityDocument(document);
    } catch (documentError) {
      console.error("Unable to load customer identity document:", documentError);
      setIdentityError(
        "Unable to load this customer's ID document from Firebase.",
      );
    } finally {
      setIdentityLoading(false);
    }
  }

  function closeIdentityFile() {
    if (identityLoading) {
      return;
    }

    setSelectedCustomer(null);
    setIdentityDocument(null);
    setIdentityError("");
  }

  async function confirmModeration(decision: ModerationDecision) {
    if (!moderationTarget) {
      return;
    }

    const { customer, action } = moderationTarget;
    const uid = getCustomerUid(customer);
    const status =
      action === "restore"
        ? "active"
        : action === "disable"
          ? "disabled"
          : "suspended";

    try {
      setProcessing(true);
      setFeedback("");

      await moderateAccount({
        uid,
        profileId: customer.id,
        profileName: getCustomerName(customer),
        role: "customer",
        status,
        ...decision,
      });

      setFeedback(
        action === "restore"
          ? `${getCustomerName(customer)} can access the marketplace again.`
          : `${getCustomerName(customer)} has been ${status}${
              status === "suspended" && decision.suspensionDays
                ? ` for ${decision.suspensionDays} day${decision.suspensionDays === 1 ? "" : "s"}`
                : ""
            }.`,
      );
      setModerationTarget(null);
    } catch (moderationError) {
      setFeedback(
        moderationError instanceof Error
          ? moderationError.message
          : "Unable to update this account.",
      );
    } finally {
      setProcessing(false);
    }
  }

  const loading =
    customersQuery.loading || usersQuery.loading || reportsQuery.loading;
  const error =
    customersQuery.error || usersQuery.error || reportsQuery.error;

  return (
    <DashboardShell
      title="Customer Monitoring"
      description="Review customer identity, report history, and marketplace access."
    >
      <div className="module-page">
        {error && (
          <div className="error-box">
            <strong>Unable to load customer monitoring data</strong>
            <p>{error}</p>
          </div>
        )}

        {feedback && <div className="notice">{feedback}</div>}

        <section className="grid grid-4">
          <StatCard
            title="Customers"
            value={customerStats.total}
            description="Registered customer profiles"
            icon={<Users size={24} strokeWidth={2.4} />}
            tone="blue"
          />
          <StatCard
            title="Active"
            value={customerStats.active}
            description="Accounts with marketplace access"
            icon={<UserCheck size={24} strokeWidth={2.4} />}
            tone="green"
          />
          <StatCard
            title="Reported"
            value={customerStats.reported}
            description="Accounts named in safety reports"
            icon={<ShieldAlert size={24} strokeWidth={2.4} />}
            tone="yellow"
          />
          <StatCard
            title="Restricted"
            value={customerStats.restricted}
            description="Suspended or disabled access"
            icon={<UserRoundX size={24} strokeWidth={2.4} />}
            tone="red"
          />
        </section>

        <SectionCard
          title="Customer Accounts"
          description={`${formatNumber(filteredCustomers.length)} monitored account${
            filteredCustomers.length === 1 ? "" : "s"
          } found.`}
          actions={
            <>
              <label className="topbar-search">
                <Search size={18} strokeWidth={2.4} />
                <input
                  type="search"
                  placeholder="Search name, email, phone, or UID…"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  aria-label="Search customer accounts"
                />
              </label>
              <select
                className="select"
                value={statusFilter}
                onChange={(event) =>
                  setStatusFilter(event.target.value as StatusFilter)
                }
                aria-label="Filter customers by status"
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
              title="Loading customer accounts"
              message="Connecting profiles, account access, and safety reports."
              icon={<Users size={34} strokeWidth={2.3} />}
            />
          ) : filteredCustomers.length === 0 ? (
            <EmptyState
              title="No customers found"
              message="Try adjusting the search term or status filter."
              icon={<Users size={34} strokeWidth={2.3} />}
            />
          ) : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Customer</th>
                    <th>Contact</th>
                    <th>Location</th>
                    <th>ID Verification</th>
                    <th>Reports</th>
                    <th>Status</th>
                    <th>Suspension Details</th>
                    <th>Registered</th>
                    <th>Access Control</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredCustomers.map((customer) => {
                    const uid = getCustomerUid(customer);
                    const status = getCustomerStatus(
                      customer,
                      usersById.get(uid),
                    );
                    const reports = reportCounts.get(uid) || 0;
                    const restricted = isRestricted(status);
                    const moderation = getCustomerModeration(
                      customer,
                      usersById.get(uid),
                    );

                    return (
                      <tr key={customer.id}>
                        <td>
                          <strong>{getCustomerName(customer)}</strong>
                          <small className="account-uid">UID: {uid}</small>
                        </td>
                        <td>
                          {customer.email ? (
                            <a href={`mailto:${customer.email}`}>
                              <Mail size={14} strokeWidth={2.4} /> {customer.email}
                            </a>
                          ) : (
                            "—"
                          )}
                          <small className="account-secondary-line">
                            <Phone size={12} strokeWidth={2.4} /> {customer.phone || "No phone"}
                          </small>
                        </td>
                        <td>{getCustomerAddress(customer)}</td>
                        <td>
                          <div className="identity-table-cell">
                            <strong>{customer.validIdType || "Not submitted"}</strong>
                            <small>
                              {customer.identityVerificationStatus || "submitted"}
                            </small>
                            <button
                              type="button"
                              className="btn btn-sm"
                              onClick={() => openIdentityFile(customer)}
                            >
                              View ID
                            </button>
                          </div>
                        </td>
                        <td>
                          <span className={reports > 0 ? "risk-count risk-count--flagged" : "risk-count"}>
                            {reports}
                          </span>
                        </td>
                        <td>
                          <StatusBadge status={status} />
                        </td>
                        <td>
                          {status === "suspended" || status === "disabled" ? (
                            <div className="moderation-summary">
                              <strong>{moderation.reason || "Administrative restriction"}</strong>
                              {moderation.details && <span>{moderation.details}</span>}
                              {status === "suspended" && (
                                <small>Returns: {formatSuspensionUntil(moderation.suspendedUntil)}</small>
                              )}
                            </div>
                          ) : (
                            <span className="muted-dash">—</span>
                          )}
                        </td>
                        <td>
                          {formatDate(
                            customer.createdAt ||
                              customer.updatedAt ||
                              customer.dateRegistered,
                          )}
                        </td>
                        <td>
                          <div className="toolbar account-actions">
                            {restricted ? (
                              <button
                                type="button"
                                className="btn btn-green btn-sm"
                                onClick={() =>
                                  setModerationTarget({ customer, action: "restore" })
                                }
                              >
                                <RotateCcw size={14} strokeWidth={2.4} /> Restore
                              </button>
                            ) : (
                              <button
                                type="button"
                                className="btn btn-sm"
                                onClick={() =>
                                  setModerationTarget({ customer, action: "suspend" })
                                }
                              >
                                <ShieldAlert size={14} strokeWidth={2.4} /> Suspend
                              </button>
                            )}

                            {status !== "disabled" && (
                              <button
                                type="button"
                                className="btn btn-red btn-sm"
                                onClick={() =>
                                  setModerationTarget({ customer, action: "disable" })
                                }
                              >
                                <Ban size={14} strokeWidth={2.4} /> Disable
                              </button>
                            )}
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

      {selectedCustomer && (
        <div className="modal-overlay vendor-application-file-overlay" role="presentation">
          <section
            className="modal-container vendor-application-file"
            role="dialog"
            aria-modal="true"
            aria-labelledby="customer-identity-file-title"
          >
            <header className="modal-header vendor-application-file__header">
              <div>
                <small>CUSTOMER IDENTITY FILE</small>
                <h2 id="customer-identity-file-title">
                  {getCustomerName(selectedCustomer)}
                </h2>
                <p>
                  Review the customer information and the government-issued ID submitted during registration.
                </p>
              </div>

              <button
                type="button"
                className="account-moderation-close"
                onClick={closeIdentityFile}
                disabled={identityLoading}
                aria-label="Close customer identity file"
              >
                <X size={19} strokeWidth={2.4} />
              </button>
            </header>

            <div className="modal-body vendor-application-file__body">
              <div className="vendor-application-file__summary">
                <div>
                  <span>Account status</span>
                  <StatusBadge
                    status={getCustomerStatus(
                      selectedCustomer,
                      usersById.get(getCustomerUid(selectedCustomer)),
                    )}
                  />
                </div>
                <div>
                  <span>Customer UID</span>
                  <strong>{getCustomerUid(selectedCustomer)}</strong>
                </div>
                <div>
                  <span>Registered</span>
                  <strong>
                    {formatDate(
                      selectedCustomer.createdAt ||
                        selectedCustomer.updatedAt ||
                        selectedCustomer.dateRegistered,
                    )}
                  </strong>
                </div>
                <div>
                  <span>ID verification</span>
                  <strong>
                    {identityDocument?.verificationStatus ||
                      selectedCustomer.identityVerificationStatus ||
                      "submitted"}
                  </strong>
                </div>
              </div>

              <section className="vendor-application-file__section">
                <div className="vendor-application-file__section-heading">
                  <Users size={18} strokeWidth={2.3} />
                  <div>
                    <h3>Customer Information</h3>
                    <p>Registration details stored for this customer.</p>
                  </div>
                </div>
                <div className="vendor-application-file__grid">
                  <div className="vendor-application-field">
                    <span>Full name</span>
                    <strong>{getCustomerName(selectedCustomer)}</strong>
                  </div>
                  <div className="vendor-application-field">
                    <span>Email address</span>
                    <strong>{selectedCustomer.email || "Not provided"}</strong>
                  </div>
                  <div className="vendor-application-field">
                    <span>Phone number</span>
                    <strong>{selectedCustomer.phone || "Not provided"}</strong>
                  </div>
                  <div className="vendor-application-field">
                    <span>Valid ID type</span>
                    <strong>
                      {identityDocument?.validIdType ||
                        selectedCustomer.validIdType ||
                        "Not provided"}
                    </strong>
                  </div>
                  <div className="vendor-application-field vendor-application-field--wide">
                    <span>Address</span>
                    <strong>{getCustomerAddress(selectedCustomer)}</strong>
                  </div>
                </div>
              </section>

              <section className="vendor-application-file__section">
                <div className="vendor-application-file__section-heading">
                  <ShieldCheck size={18} strokeWidth={2.3} />
                  <div>
                    <h3>Submitted Government ID</h3>
                    <p>The ID image is loaded only when an admin opens this file.</p>
                  </div>
                </div>

                {identityLoading ? (
                  <div className="vendor-document-message">
                    Loading protected ID document…
                  </div>
                ) : identityError ? (
                  <div className="vendor-document-warning">{identityError}</div>
                ) : identityDocument?.validIdImage ? (
                  <div className="customer-identity-preview-wrap">
                    <img
                      src={identityDocument.validIdImage}
                      alt="Customer submitted government ID"
                      className="customer-identity-preview"
                    />
                  </div>
                ) : (
                  <div className="vendor-document-warning">
                    No government ID image was found for this customer.
                  </div>
                )}
              </section>

              <div className="vendor-application-security-note">
                Government ID images are sensitive verification records. Display them only to authorized administrators and never expose this database path publicly.
              </div>
            </div>

            <footer className="modal-footer vendor-application-file__footer">
              <button
                type="button"
                className="btn"
                onClick={closeIdentityFile}
                disabled={identityLoading}
              >
                Close
              </button>
            </footer>
          </section>
        </div>
      )}

      <AccountModerationDialog
        open={Boolean(moderationTarget)}
        accountName={
          moderationTarget
            ? getCustomerName(moderationTarget.customer)
            : "Customer"
        }
        accountRole="customer"
        action={moderationTarget?.action || "suspend"}
        processing={processing}
        onClose={() => !processing && setModerationTarget(null)}
        onConfirm={confirmModeration}
      />
    </DashboardShell>
  );
}
