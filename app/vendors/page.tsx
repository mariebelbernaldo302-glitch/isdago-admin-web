"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import {
  Ban,
  Mail,
  MapPin,
  Phone,
  RotateCcw,
  Search,
  ShieldAlert,
  ShieldCheck,
  Store,
  UserRound,
  UserRoundX,
} from "lucide-react";

import AccountModerationDialog, {
  type AccountModerationAction,
} from "../components/AccountModerationDialog";
import DashboardShell from "../components/DashboardShell";
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
  getName,
  normalizeStatus,
  toDate,
} from "../lib/format";
import type { Product, UserRecord, Vendor } from "../lib/types";
import { useRealtimeCollection } from "../lib/useFirestoreCollection";

type ReportReference = {
  id: string;
  reportedUserId?: string;
  status?: string;
};

type ModerationTarget = {
  vendor: Vendor;
  action: AccountModerationAction;
};

const STATUS_FILTERS = [
  { label: "All status", value: "all" },
  { label: "Active", value: "active" },
  { label: "Approved", value: "approved" },
  { label: "Suspended", value: "suspended" },
  { label: "Disabled", value: "disabled" },
  { label: "Rejected", value: "rejected" },
] as const;

type StatusFilter = (typeof STATUS_FILTERS)[number]["value"];

function getVendorUid(vendor: Vendor) {
  return vendor.uid?.trim() || vendor.id;
}

function getVendorBusinessName(vendor: Vendor) {
  return getName(
    vendor.businessName,
    vendor.vendorName || vendor.name,
    "Unnamed Vendor",
  );
}

function getVendorOwner(vendor: Vendor) {
  return getName(
    vendor.ownerName || vendor.owner,
    vendor.name || vendor.vendorName,
    "Not provided",
  );
}

function getVendorLocation(vendor: Vendor) {
  const locationParts = [
    vendor.location,
    vendor.address,
    vendor.barangay,
    vendor.city,
    vendor.province,
  ]
    .map((part) => part?.trim())
    .filter(Boolean);

  return locationParts.length > 0 ? locationParts.join(", ") : "—";
}

function getVendorStatus(vendor: Vendor, user?: UserRecord) {
  const userStatus = normalizeStatus(user?.status || "");

  if (["suspended", "disabled", "blocked", "inactive", "rejected"].includes(userStatus)) {
    return userStatus;
  }

  return normalizeStatus(
    vendor.applicationStatus || vendor.status || userStatus || "active",
  );
}

function getVendorCreatedTime(vendor: Vendor) {
  return (
    toDate(
      vendor.createdAt ||
        vendor.updatedAt ||
        vendor.dateRegistered ||
        vendor.dateApplied,
    )?.getTime() ?? 0
  );
}

function isActiveStatus(status: string) {
  return ["active", "approved", "verified"].includes(status);
}

function isRestricted(status: string) {
  return ["suspended", "disabled", "blocked", "inactive", "rejected"].includes(status);
}

function getVendorModeration(vendor: Vendor, user?: UserRecord) {
  return {
    reason: user?.moderationReason || vendor.moderationReason || "",
    details: user?.moderationDetails || vendor.moderationDetails || "",
    suspendedUntil: user?.suspendedUntil || vendor.suspendedUntil,
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

export default function VendorsPage() {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [moderationTarget, setModerationTarget] =
    useState<ModerationTarget | null>(null);
  const [processing, setProcessing] = useState(false);
  const [feedback, setFeedback] = useState("");

  const vendorsQuery = useRealtimeCollection<Vendor>("vendors", "createdAt");
  const usersQuery = useRealtimeCollection<UserRecord>("users", "createdAt");
  const reportsQuery = useRealtimeCollection<ReportReference>(
    "reports",
    "createdAt",
  );
  const productsQuery = useRealtimeCollection<Product>("products", "createdAt");

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

  const productIdsByVendor = useMemo(() => {
    const lookup = new Map<string, string[]>();

    productsQuery.data.forEach((product) => {
      const vendorId = product.vendorId?.trim();

      if (!vendorId) {
        return;
      }

      lookup.set(vendorId, [...(lookup.get(vendorId) || []), product.id]);
    });

    return lookup;
  }, [productsQuery.data]);

  const vendorStats = useMemo(() => {
    let active = 0;
    let reported = 0;
    let restricted = 0;

    vendorsQuery.data.forEach((vendor) => {
      const uid = getVendorUid(vendor);
      const status = getVendorStatus(vendor, usersById.get(uid));

      if (isActiveStatus(status)) {
        active++;
      }

      if ((reportCounts.get(uid) || 0) > 0) {
        reported++;
      }

      if (isRestricted(status)) {
        restricted++;
      }
    });

    return {
      total: vendorsQuery.data.length,
      active,
      reported,
      restricted,
    };
  }, [vendorsQuery.data, usersById, reportCounts]);

  const filteredVendors = useMemo(() => {
    const query = search.trim().toLowerCase();

    return [...vendorsQuery.data]
      .filter((vendor) => {
        const uid = getVendorUid(vendor);
        const status = getVendorStatus(vendor, usersById.get(uid));
        const matchesStatus =
          statusFilter === "all" ||
          status === statusFilter ||
          (statusFilter === "active" && isActiveStatus(status));
        const searchableText = [
          getVendorBusinessName(vendor),
          getVendorOwner(vendor),
          vendor.email,
          vendor.phone,
          getVendorLocation(vendor),
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
          getVendorCreatedTime(second) - getVendorCreatedTime(first),
      );
  }, [vendorsQuery.data, usersById, search, statusFilter]);

  async function confirmModeration(decision: ModerationDecision) {
    if (!moderationTarget) {
      return;
    }

    const { vendor, action } = moderationTarget;
    const uid = getVendorUid(vendor);
    const productIds = productIdsByVendor.get(uid) || [];
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
        profileId: vendor.id,
        profileName: getVendorBusinessName(vendor),
        role: "vendor",
        status,
        ...decision,
        relatedProductIds: productIds,
      });

      setFeedback(
        action === "restore"
          ? `${getVendorBusinessName(vendor)} can access the vendor application again. Listings remain inactive for safety review.`
          : `${getVendorBusinessName(vendor)} has been ${status}${
              status === "suspended" && decision.suspensionDays
                ? ` for ${decision.suspensionDays} day${decision.suspensionDays === 1 ? "" : "s"}`
                : ""
            }. ${productIds.length} listing${
              productIds.length === 1 ? " was" : "s were"
            } deactivated.`,
      );
      setModerationTarget(null);
    } catch (moderationError) {
      setFeedback(
        moderationError instanceof Error
          ? moderationError.message
          : "Unable to update this vendor account.",
      );
    } finally {
      setProcessing(false);
    }
  }

  const loading =
    vendorsQuery.loading ||
    usersQuery.loading ||
    reportsQuery.loading ||
    productsQuery.loading;
  const error =
    vendorsQuery.error ||
    usersQuery.error ||
    reportsQuery.error ||
    productsQuery.error;

  return (
    <DashboardShell
      title="Vendor Monitoring"
      description="Monitor approved sellers, safety reports, listings, and account access."
      actions={
        <Link href="/vendor-approvals" className="btn btn-primary">
          Review Applications
        </Link>
      }
    >
      <div className="module-page">
        {error && (
          <div className="error-box">
            <strong>Unable to load vendor monitoring data</strong>
            <p>{error}</p>
          </div>
        )}

        {feedback && <div className="notice">{feedback}</div>}

        <section className="grid grid-4">
          <StatCard
            title="Vendors"
            value={vendorStats.total}
            description="Registered seller profiles"
            icon={<Store size={24} strokeWidth={2.4} />}
            tone="blue"
          />
          <StatCard
            title="Active"
            value={vendorStats.active}
            description="Approved sellers with access"
            icon={<ShieldCheck size={24} strokeWidth={2.4} />}
            tone="green"
          />
          <StatCard
            title="Reported"
            value={vendorStats.reported}
            description="Sellers named in safety reports"
            icon={<ShieldAlert size={24} strokeWidth={2.4} />}
            tone="yellow"
          />
          <StatCard
            title="Restricted"
            value={vendorStats.restricted}
            description="Suspended, disabled, or rejected"
            icon={<UserRoundX size={24} strokeWidth={2.4} />}
            tone="red"
          />
        </section>

        <SectionCard
          title="Vendor Accounts"
          description={`${formatNumber(filteredVendors.length)} monitored seller${
            filteredVendors.length === 1 ? "" : "s"
          } found.`}
          actions={
            <>
              <label className="topbar-search">
                <Search size={18} strokeWidth={2.4} />
                <input
                  type="search"
                  placeholder="Search store, owner, email, or UID…"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  aria-label="Search vendor accounts"
                />
              </label>
              <select
                className="select"
                value={statusFilter}
                onChange={(event) =>
                  setStatusFilter(event.target.value as StatusFilter)
                }
                aria-label="Filter vendors by status"
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
              title="Loading vendor accounts"
              message="Connecting seller profiles, reports, and listing safeguards."
              icon={<Store size={34} strokeWidth={2.3} />}
            />
          ) : filteredVendors.length === 0 ? (
            <EmptyState
              title="No vendors found"
              message="Try adjusting the search term or status filter."
              icon={<Store size={34} strokeWidth={2.3} />}
            />
          ) : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Business</th>
                    <th>Owner &amp; Contact</th>
                    <th>Location</th>
                    <th>Reports</th>
                    <th>Listings</th>
                    <th>Status</th>
                    <th>Suspension Details</th>
                    <th>Access Control</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredVendors.map((vendor) => {
                    const uid = getVendorUid(vendor);
                    const status = getVendorStatus(vendor, usersById.get(uid));
                    const reports = reportCounts.get(uid) || 0;
                    const listings = productIdsByVendor.get(uid)?.length || 0;
                    const canRestore = [
                      "suspended",
                      "disabled",
                      "blocked",
                      "inactive",
                    ].includes(status);
                    const rejected = status === "rejected";
                    const moderation = getVendorModeration(
                      vendor,
                      usersById.get(uid),
                    );

                    return (
                      <tr key={vendor.id}>
                        <td>
                          <strong>{getVendorBusinessName(vendor)}</strong>
                          <small className="account-uid">UID: {uid}</small>
                        </td>
                        <td>
                          <span className="account-contact-name">
                            <UserRound size={14} strokeWidth={2.4} /> {getVendorOwner(vendor)}
                          </span>
                          {vendor.email && (
                            <a className="account-secondary-line" href={`mailto:${vendor.email}`}>
                              <Mail size={12} strokeWidth={2.4} /> {vendor.email}
                            </a>
                          )}
                          <small className="account-secondary-line">
                            <Phone size={12} strokeWidth={2.4} /> {vendor.phone || vendor.contact || "No phone"}
                          </small>
                        </td>
                        <td>
                          <MapPin size={14} strokeWidth={2.4} /> {getVendorLocation(vendor)}
                        </td>
                        <td>
                          <span className={reports > 0 ? "risk-count risk-count--flagged" : "risk-count"}>
                            {reports}
                          </span>
                        </td>
                        <td>{formatNumber(listings)}</td>
                        <td>
                          <StatusBadge status={status} />
                          <small className="account-secondary-line">
                            {formatDate(
                              vendor.approvedAt || vendor.updatedAt || vendor.createdAt,
                            )}
                          </small>
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
                          <div className="toolbar account-actions">
                            {rejected ? (
                              <Link
                                href="/vendor-approvals"
                                className="btn btn-sm"
                              >
                                Review Application
                              </Link>
                            ) : canRestore ? (
                              <button
                                type="button"
                                className="btn btn-green btn-sm"
                                onClick={() =>
                                  setModerationTarget({ vendor, action: "restore" })
                                }
                              >
                                <RotateCcw size={14} strokeWidth={2.4} /> Restore
                              </button>
                            ) : (
                              <button
                                type="button"
                                className="btn btn-sm"
                                onClick={() =>
                                  setModerationTarget({ vendor, action: "suspend" })
                                }
                              >
                                <ShieldAlert size={14} strokeWidth={2.4} /> Suspend
                              </button>
                            )}

                            {!rejected && status !== "disabled" && (
                              <button
                                type="button"
                                className="btn btn-red btn-sm"
                                onClick={() =>
                                  setModerationTarget({ vendor, action: "disable" })
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
            ? getVendorBusinessName(moderationTarget.vendor)
            : "Vendor"
        }
        accountRole="vendor"
        action={moderationTarget?.action || "suspend"}
        processing={processing}
        onClose={() => !processing && setModerationTarget(null)}
        onConfirm={confirmModeration}
      />
    </DashboardShell>
  );
}
