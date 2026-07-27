"use client";

import Link from "next/link";
import { useMemo } from "react";
import type { LucideIcon } from "lucide-react";
import {
  Activity,
  Clock,
  ClipboardList,
  ShieldAlert,
  ShieldCheck,
  Store,
  UserRoundX,
  Users,
} from "lucide-react";

import { DashboardShell } from "../components/DashboardShell";
import EmptyState from "../components/EmptyState";
import SectionCard from "../components/SectionCard";
import StatusBadge from "../components/StatusBadge";
import { useRealtimeCollection } from "../lib/useFirestoreCollection";
import {
  formatDateTime,
  formatNumber,
  getName,
  normalizeStatus,
  toDate,
} from "../lib/format";
import type {
  ActivityLog,
  Customer,
  TimestampValue,
  Vendor,
  VendorApplication,
} from "../lib/types";

type SafetyReport = {
  id: string;
  category?: string;
  type?: string;
  status?: string;
  reporterName?: string;
  reporterRole?: string;
  reportedUserName?: string;
  reportedUserRole?: string;
  orderId?: string;
  createdAt?: TimestampValue;
  updatedAt?: TimestampValue;
};

type MetricCardProps = {
  title: string;
  value: string | number;
  description: string;
  icon: LucideIcon;
};

function getTime(value: unknown) {
  const date = toDate(value as Parameters<typeof toDate>[0]);
  return date?.getTime() ?? 0;
}

function getRecordTime(record: {
  createdAt?: unknown;
  updatedAt?: unknown;
  timestamp?: unknown;
}) {
  return Math.max(
    getTime(record.createdAt),
    getTime(record.updatedAt),
    getTime(record.timestamp),
  );
}

function isPendingStatus(status?: string | null) {
  const normalized = normalizeStatus(status || "pending");

  return (
    normalized === "pending" ||
    normalized === "pending review" ||
    normalized === "under review" ||
    normalized === "submitted" ||
    normalized.includes("pending")
  );
}

function isOpenReport(report: SafetyReport) {
  const status = normalizeStatus(report.status || "submitted");
  return status === "submitted" || status === "reviewing" || isPendingStatus(status);
}

function isRestrictedStatus(status?: string | null) {
  return [
    "blocked",
    "disabled",
    "inactive",
    "suspended",
    "rejected",
  ].includes(normalizeStatus(status || "active"));
}

function isToday(value: unknown) {
  const date = toDate(value as Parameters<typeof toDate>[0]);

  if (!date) {
    return false;
  }

  const today = new Date();

  return (
    date.getFullYear() === today.getFullYear() &&
    date.getMonth() === today.getMonth() &&
    date.getDate() === today.getDate()
  );
}

function shortId(value?: string) {
  const normalized = value?.trim();
  return normalized ? normalized.slice(-8).toUpperCase() : "—";
}

function MetricCard({
  title,
  value,
  description,
  icon: Icon,
}: MetricCardProps) {
  return (
    <article className="metric-card">
      <div className="metric-icon" aria-hidden="true">
        <Icon size={26} strokeWidth={2.4} />
      </div>

      <div>
        <strong>
          {typeof value === "number" ? formatNumber(value) : value}
        </strong>
        <h3>{title}</h3>
        <p>{description}</p>
      </div>
    </article>
  );
}

export default function DashboardPage() {
  const customersQuery = useRealtimeCollection<Customer>(
    "customers",
    "createdAt",
  );
  const vendorsQuery = useRealtimeCollection<Vendor>("vendors", "createdAt");
  const applicationsQuery = useRealtimeCollection<VendorApplication>(
    "vendor_applications",
    "createdAt",
  );
  const reportsQuery = useRealtimeCollection<SafetyReport>(
    "reports",
    "createdAt",
  );
  const activityQuery = useRealtimeCollection<ActivityLog>(
    "activity_logs",
    "createdAt",
    { limit: 250 },
  );

  const customers = customersQuery.data;
  const vendors = vendorsQuery.data;
  const applications = applicationsQuery.data;
  const reports = reportsQuery.data;
  const activityLogs = activityQuery.data;

  const isLoading =
    customersQuery.loading ||
    vendorsQuery.loading ||
    applicationsQuery.loading ||
    reportsQuery.loading ||
    activityQuery.loading;

  const error =
    customersQuery.error ||
    vendorsQuery.error ||
    applicationsQuery.error ||
    reportsQuery.error ||
    activityQuery.error;

  const stats = useMemo(() => {
    const pendingApplications = applications.filter((application) =>
      isPendingStatus(application.status),
    ).length;
    const openCases = reports.filter(isOpenReport).length;
    const restrictedCustomers = customers.filter((customer) =>
      isRestrictedStatus(customer.status),
    ).length;
    const restrictedVendors = vendors.filter((vendor) =>
      isRestrictedStatus(vendor.status || vendor.applicationStatus),
    ).length;
    const activityToday = activityLogs.filter((log) =>
      isToday(log.createdAt || log.updatedAt || log.timestamp),
    ).length;

    return {
      customers: customers.length,
      vendors: vendors.length,
      pendingApplications,
      openCases,
      restrictedAccounts: restrictedCustomers + restrictedVendors,
      activityToday,
    };
  }, [customers, vendors, applications, reports, activityLogs]);

  const priorityReports = useMemo(() => {
    return [...reports]
      .filter(isOpenReport)
      .sort(
        (first, second) => getRecordTime(second) - getRecordTime(first),
      )
      .slice(0, 6);
  }, [reports]);

  const recentActivity = useMemo(() => {
    return [...activityLogs]
      .sort(
        (first, second) => getRecordTime(second) - getRecordTime(first),
      )
      .slice(0, 6);
  }, [activityLogs]);

  const latestActivityTime = useMemo(() => {
    return activityLogs.reduce(
      (latest, log) => Math.max(latest, getRecordTime(log)),
      0,
    );
  }, [activityLogs]);

  const databaseStatus = error
    ? "Connection issue"
    : isLoading
      ? "Syncing records"
      : "Monitoring live";

  return (
    <DashboardShell
      title="Dashboard"
      description="IsdaGo Trust & Safety monitoring overview"
      hidePageHeader
    >
      <div className="module-page">
        <section className="module-hero">
          <div>
            <span>TRUST &amp; SAFETY CONTROL CENTER</span>
            <h1>Marketplace oversight, focused on people.</h1>
            <p>
              Monitor customer and vendor accounts, review vendor applications,
              investigate reports, and preserve a complete audit trail. Product,
              order, and payment records remain read-only evidence inside cases.
            </p>
          </div>

          <div className="hero-status">
            <StatusBadge
              status={error ? "failed" : isLoading ? "processing" : "active"}
            />
            <div>
              <strong>{databaseStatus}</strong>
              <small>
                {latestActivityTime
                  ? `Latest event: ${formatDateTime(latestActivityTime)}`
                  : "Waiting for monitoring activity"}
              </small>
            </div>
          </div>
        </section>

        {error && (
          <div className="error-box">
            <strong>Monitoring sync error</strong>
            <p>{error}</p>
          </div>
        )}

        <section className="metric-grid">
          <MetricCard
            title="Customers"
            value={stats.customers}
            description="Registered customer accounts"
            icon={Users}
          />
          <MetricCard
            title="Vendors"
            value={stats.vendors}
            description="Approved and monitored sellers"
            icon={Store}
          />
          <MetricCard
            title="Pending Vendors"
            value={stats.pendingApplications}
            description="Applications requiring a decision"
            icon={Clock}
          />
          <MetricCard
            title="Open Cases"
            value={stats.openCases}
            description="Submitted or under-review reports"
            icon={ShieldAlert}
          />
          <MetricCard
            title="Restricted Accounts"
            value={stats.restrictedAccounts}
            description="Suspended, disabled, or rejected"
            icon={UserRoundX}
          />
          <MetricCard
            title="Activity Today"
            value={stats.activityToday}
            description="Audit events recorded today"
            icon={Activity}
          />
        </section>

        <div className="grid grid-2">
          <SectionCard
            title="Review Queue"
            description="Items currently requiring an administrator decision."
          >
            <div className="data-summary">
              <span>Vendor applications</span>
              <strong>{formatNumber(stats.pendingApplications)}</strong>
            </div>
            <div className="data-summary">
              <span>Trust &amp; Safety cases</span>
              <strong>{formatNumber(stats.openCases)}</strong>
            </div>
            <div className="toolbar monitoring-queue-actions">
              <Link href="/vendor-approvals" className="btn btn-primary">
                Review Vendors
              </Link>
              <Link href="/reports" className="btn">
                Open Cases
              </Link>
            </div>
          </SectionCard>

          <SectionCard
            title="Enforcement Summary"
            description="Account restrictions applied through admin review."
          >
            <div className="data-summary">
              <span>Restricted accounts</span>
              <strong>{formatNumber(stats.restrictedAccounts)}</strong>
            </div>
            <div className="data-summary">
              <span>Account-linked events today</span>
              <strong>{formatNumber(stats.activityToday)}</strong>
            </div>
            <p className="monitoring-helper-text">
              Suspending an account preserves reports and transaction evidence
              while preventing future access.
            </p>
          </SectionCard>
        </div>

        <SectionCard
          title="Priority Reports"
          description="Newest unresolved cases from customers and vendors."
          actions={
            <Link href="/reports" className="btn">
              View All Cases
            </Link>
          }
        >
          {priorityReports.length === 0 ? (
            <EmptyState
              icon={<ShieldCheck size={34} strokeWidth={2.3} />}
              title={isLoading ? "Loading reports" : "No open cases"}
              message={
                isLoading
                  ? "Connecting to the live report queue."
                  : "All submitted reports have been reviewed."
              }
            />
          ) : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Case</th>
                    <th>Concern</th>
                    <th>Reporter</th>
                    <th>Reported Account</th>
                    <th>Status</th>
                    <th>Submitted</th>
                  </tr>
                </thead>
                <tbody>
                  {priorityReports.map((report) => (
                    <tr key={report.id}>
                      <td>
                        <strong>#{shortId(report.id)}</strong>
                        <small>Order #{shortId(report.orderId)}</small>
                      </td>
                      <td>{getName(report.category, report.type, "Safety concern")}</td>
                      <td>
                        {getName(report.reporterName, report.reporterRole, "User")}
                      </td>
                      <td>
                        {getName(
                          report.reportedUserName,
                          report.reportedUserRole,
                          "Account",
                        )}
                      </td>
                      <td>
                        <StatusBadge status={report.status || "submitted"} />
                      </td>
                      <td>{formatDateTime(report.createdAt || report.updatedAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </SectionCard>

        <SectionCard
          title="Recent Audit Activity"
          description="Latest monitoring and enforcement events."
          actions={
            <Link href="/activity-logs" className="btn">
              View Audit Trail
            </Link>
          }
        >
          {recentActivity.length === 0 ? (
            <EmptyState
              icon={<ClipboardList size={34} strokeWidth={2.3} />}
              title={isLoading ? "Loading activity" : "No activity recorded"}
              message="User and administrator events will appear here."
            />
          ) : (
            <div className="monitoring-activity-list">
              {recentActivity.map((log) => (
                <article className="monitoring-activity-item" key={log.id}>
                  <span className="monitoring-activity-icon" aria-hidden="true">
                    <Activity size={17} strokeWidth={2.4} />
                  </span>
                  <div>
                    <strong>{log.description || log.type || "Activity recorded"}</strong>
                    <small>
                      {getName(log.user, log.role, "System")} · {formatDateTime(
                        log.createdAt || log.updatedAt || log.timestamp,
                      )}
                    </small>
                  </div>
                </article>
              ))}
            </div>
          )}
        </SectionCard>
      </div>
    </DashboardShell>
  );
}
