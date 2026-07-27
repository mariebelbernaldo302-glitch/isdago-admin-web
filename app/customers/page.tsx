"use client";

import { useMemo, useState } from "react";
import {
  Ban,
  Mail,
  Phone,
  RotateCcw,
  Search,
  ShieldAlert,
  UserCheck,
  UserRoundX,
  Users,
} from "lucide-react";

import AccountModerationDialog, {
  type AccountModerationAction,
} from "../components/AccountModerationDialog";
import DashboardShell from "../components/DashboardShell";
import EmptyState from "../components/EmptyState";
import SectionCard from "../components/SectionCard";
import StatCard from "../components/StatCard";
import StatusBadge from "../components/StatusBadge";
import { moderateAccount } from "../lib/accountModeration";
import {
  formatDate,
  formatNumber,
  normalizeStatus,
  toDate,
} from "../lib/format";
import type { Customer, UserRecord } from "../lib/types";
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

export default function CustomersPage() {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [moderationTarget, setModerationTarget] =
    useState<ModerationTarget | null>(null);
  const [processing, setProcessing] = useState(false);
  const [feedback, setFeedback] = useState("");

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

  async function confirmModeration(reason: string) {
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
        reason,
      });

      setFeedback(
        action === "restore"
          ? `${getCustomerName(customer)} can access the marketplace again.`
          : `${getCustomerName(customer)} has been ${status}.`,
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
                    <th>Reports</th>
                    <th>Status</th>
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
                          <span className={reports > 0 ? "risk-count risk-count--flagged" : "risk-count"}>
                            {reports}
                          </span>
                        </td>
                        <td>
                          <StatusBadge status={status} />
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
