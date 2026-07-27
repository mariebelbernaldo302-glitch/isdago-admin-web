"use client";

import { useMemo, useState } from "react";
import {
  Activity,
  CalendarClock,
  ClipboardList,
  Search,
  ShieldCheck,
  UserRound,
} from "lucide-react";

import DashboardShell from "../components/DashboardShell";
import ActivityBadge from "../components/ActivityBadge";
import EmptyState from "../components/EmptyState";
import SectionCard from "../components/SectionCard";
import StatCard from "../components/StatCard";
import {
  formatDateTime,
  formatNumber,
  normalizeStatus,
  toDate,
} from "../lib/format";
import type { ActivityLog } from "../lib/types";
import { useRealtimeCollection } from "../lib/useFirestoreCollection";

import "./activity-logs.css";

type MonitorActivityLog = ActivityLog & {
  action?: string;
  actorEmail?: string;
  actorName?: string;
  actorRole?: string;
  createdAt?: unknown;
  description?: string;
  entityId?: string;
  entityType?: string;
  module?: string;
  role?: string;
  source?: string;
  status?: string;
  timestamp?: unknown;
  type?: string;
  updatedAt?: unknown;
  user?: string;
  userId?: string;
};

type UserProfile = {
  id: string;
  uid?: string;
  name?: string;
  fullName?: string;
  displayName?: string;
  ownerName?: string;
  storeName?: string;
  businessName?: string;
  email?: string;
  role?: string;
  status?: string;
};

type ActivityFilter =
  | "all"
  | "authentication"
  | "customer"
  | "vendor"
  | "product"
  | "order"
  | "report"
  | "system";

type RoleFilter = "all" | "customer" | "vendor" | "admin" | "system";
type DateFilter = "today" | "7_days" | "30_days" | "all";

type ActorDetails = {
  id: string;
  name: string;
  email: string;
  role: string;
  status: string;
};

const ACTIVITY_FILTERS: { label: string; value: ActivityFilter }[] = [
  { label: "All activity", value: "all" },
  { label: "Sign-ins & accounts", value: "authentication" },
  { label: "Customer activity", value: "customer" },
  { label: "Vendor activity", value: "vendor" },
  { label: "Products", value: "product" },
  { label: "Orders", value: "order" },
  { label: "Safety reports", value: "report" },
  { label: "System", value: "system" },
];

const ROLE_FILTERS: { label: string; value: RoleFilter }[] = [
  { label: "All roles", value: "all" },
  { label: "Customers", value: "customer" },
  { label: "Vendors", value: "vendor" },
  { label: "Admins", value: "admin" },
  { label: "System", value: "system" },
];

const DATE_FILTERS: { label: string; value: DateFilter }[] = [
  { label: "Today", value: "today" },
  { label: "Last 7 days", value: "7_days" },
  { label: "Last 30 days", value: "30_days" },
  { label: "All time", value: "all" },
];

function clean(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function firstText(...values: unknown[]) {
  for (const value of values) {
    const normalized = clean(value);

    if (normalized) {
      return normalized;
    }
  }

  return "";
}

function getLogDateValue(log: MonitorActivityLog) {
  return log.createdAt || log.updatedAt || log.timestamp;
}

function getLogCreatedTime(log: MonitorActivityLog) {
  return toDate(
    getLogDateValue(log) as Parameters<typeof toDate>[0],
  )?.getTime() ?? 0;
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

function matchesDateFilter(log: MonitorActivityLog, filter: DateFilter) {
  if (filter === "all") {
    return true;
  }

  const createdAt = getLogCreatedTime(log);

  if (!createdAt) {
    return false;
  }

  if (filter === "today") {
    return isToday(getLogDateValue(log));
  }

  const days = filter === "7_days" ? 7 : 30;
  const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;

  return createdAt >= cutoff;
}

function getActivityCategory(log: MonitorActivityLog): ActivityFilter {
  const text = normalizeStatus(
    [log.type, log.action, log.module, log.role, log.actorRole]
      .filter(Boolean)
      .join(" "),
  );

  if (
    text.includes("sign in") ||
    text.includes("signed in") ||
    text.includes("register") ||
    text.includes("authentication") ||
    text.includes("account") ||
    text.includes("onboarding")
  ) {
    return "authentication";
  }

  if (text.includes("report") || text.includes("safety")) {
    return "report";
  }

  if (text.includes("order") || text.includes("transaction")) {
    return "order";
  }

  if (text.includes("product") || text.includes("inventory")) {
    return "product";
  }

  if (text.includes("vendor")) {
    return "vendor";
  }

  if (text.includes("customer")) {
    return "customer";
  }

  return "system";
}

function getLogDescription(log: MonitorActivityLog) {
  return clean(log.description) || "User activity was recorded.";
}

function getProfileId(profile: UserProfile) {
  return firstText(profile.uid, profile.id);
}

function getProfileName(profile?: UserProfile) {
  if (!profile) {
    return "";
  }

  return firstText(
    profile.name,
    profile.fullName,
    profile.displayName,
    profile.storeName,
    profile.businessName,
    profile.ownerName,
  );
}

function getActorDetails(
  log: MonitorActivityLog,
  profilesById: Map<string, UserProfile>,
): ActorDetails {
  const id = clean(log.userId);
  const profile = id ? profilesById.get(id) : undefined;
  const role = normalizeStatus(
    firstText(profile?.role, log.actorRole, log.role, id ? "user" : "system"),
  );

  return {
    id,
    name: firstText(
      getProfileName(profile),
      log.actorName,
      log.user,
      profile?.email,
      log.actorEmail,
      id ? "Unknown user" : "System",
    ),
    email: firstText(profile?.email, log.actorEmail),
    role: role || "system",
    status: normalizeStatus(profile?.status || ""),
  };
}

function formatRole(value: string) {
  const role = normalizeStatus(value || "user");
  return role.charAt(0).toUpperCase() + role.slice(1);
}

function getInitials(name: string) {
  const words = name.trim().split(/\s+/).filter(Boolean);

  if (!words.length) {
    return "U";
  }

  return words
    .slice(0, 2)
    .map((word) => word.charAt(0).toUpperCase())
    .join("");
}

export default function ActivityLogsPage() {
  const [search, setSearch] = useState("");
  const [activityFilter, setActivityFilter] =
    useState<ActivityFilter>("all");
  const [roleFilter, setRoleFilter] = useState<RoleFilter>("all");
  const [dateFilter, setDateFilter] = useState<DateFilter>("7_days");

  const {
    data: logs,
    loading: logsLoading,
    error: logsError,
  } = useRealtimeCollection<MonitorActivityLog>("activity_logs", "createdAt");

  const {
    data: users,
    loading: usersLoading,
    error: usersError,
  } = useRealtimeCollection<UserProfile>("users", "createdAt");

  const {
    data: vendors,
    error: vendorsError,
  } = useRealtimeCollection<UserProfile>("vendors", "createdAt");

  const profilesById = useMemo(() => {
    const lookup = new Map<string, UserProfile>();

    users.forEach((profile) => {
      const id = getProfileId(profile);

      if (id) {
        lookup.set(id, profile);
      }
    });

    vendors.forEach((vendor) => {
      const id = getProfileId(vendor);

      if (!id) {
        return;
      }

      const user = lookup.get(id);

      lookup.set(id, {
        ...vendor,
        ...user,
        id,
        uid: id,
        name: firstText(
          user?.name,
          vendor.storeName,
          vendor.businessName,
          vendor.ownerName,
          vendor.name,
        ),
        email: firstText(user?.email, vendor.email),
        role: firstText(user?.role, vendor.role, "vendor"),
        status: firstText(user?.status, vendor.status),
      });
    });

    return lookup;
  }, [users, vendors]);

  const activityStats = useMemo(() => {
    const todayLogs = logs.filter((log) => isToday(getLogDateValue(log)));
    const activeUserIds = new Set(
      todayLogs.map((log) => clean(log.userId)).filter(Boolean),
    );
    const userGeneratedLogs = logs.filter((log) => clean(log.userId));

    return {
      accounts: profilesById.size,
      today: todayLogs.length,
      activeUsers: activeUserIds.size,
      userEvents: userGeneratedLogs.length,
    };
  }, [logs, profilesById]);

  const filteredLogs = useMemo(() => {
    const query = search.trim().toLowerCase();

    return [...logs]
      .filter((log) => {
        const actor = getActorDetails(log, profilesById);
        const category = getActivityCategory(log);
        const matchesActivity =
          activityFilter === "all" || category === activityFilter;
        const matchesRole =
          roleFilter === "all" || actor.role.includes(roleFilter);

        const searchableText = [
          log.type,
          log.action,
          log.module,
          getLogDescription(log),
          actor.name,
          actor.email,
          actor.id,
          actor.role,
          actor.status,
          log.entityType,
          log.entityId,
          log.source,
          log.status,
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();

        const matchesSearch = !query || searchableText.includes(query);

        return (
          matchesActivity &&
          matchesRole &&
          matchesDateFilter(log, dateFilter) &&
          matchesSearch
        );
      })
      .sort(
        (firstLog, secondLog) =>
          getLogCreatedTime(secondLog) - getLogCreatedTime(firstLog),
      );
  }, [
    logs,
    profilesById,
    search,
    activityFilter,
    roleFilter,
    dateFilter,
  ]);

  const profileWarning = usersError || vendorsError;

  return (
    <DashboardShell
      title="User Activity Monitor"
      description="Read-only oversight of customer, vendor, and system activity across IsdaGo."
    >
      <div className="module-page activity-monitor-page">
        <div className="activity-monitor-notice" role="note">
          <span className="activity-monitor-notice__icon">
            <ShieldCheck size={20} strokeWidth={2.4} />
          </span>

          <div>
            <strong>Monitoring mode</strong>
            <p>
              This page can inspect activity only. User records and actions
              cannot be edited or deleted here.
            </p>
          </div>

          <span className="activity-monitor-live">
            <span aria-hidden="true" /> Live
          </span>
        </div>

        {logsError && (
          <div className="error-box">
            <strong>Unable to load monitoring activity</strong>
            <p>{logsError}</p>
          </div>
        )}

        {profileWarning && !logsError && (
          <div className="activity-monitor-warning">
            Activity is available, but some account names could not be
            resolved. User IDs are shown as a fallback.
          </div>
        )}

        <section className="grid grid-4">
          <StatCard
            title="Monitored Accounts"
            value={activityStats.accounts}
            description="Customers and vendors connected"
            icon={<UserRound size={24} strokeWidth={2.4} />}
            tone="blue"
          />

          <StatCard
            title="Activity Today"
            value={activityStats.today}
            description="Events recorded since midnight"
            icon={<CalendarClock size={24} strokeWidth={2.4} />}
            tone="green"
          />

          <StatCard
            title="Active Users Today"
            value={activityStats.activeUsers}
            description="Unique accounts with activity"
            icon={<Activity size={24} strokeWidth={2.4} />}
            tone="purple"
          />

          <StatCard
            title="User Events"
            value={activityStats.userEvents}
            description="Account-linked audit records"
            icon={<ClipboardList size={24} strokeWidth={2.4} />}
            tone="yellow"
          />
        </section>

        <SectionCard
          title="User Audit Trail"
          description={`${formatNumber(filteredLogs.length)} read-only event${
            filteredLogs.length === 1 ? "" : "s"
          } found.`}
          actions={
            <div className="activity-monitor-filters">
              <label className="topbar-search activity-monitor-search">
                <Search size={18} strokeWidth={2.4} />
                <input
                  type="search"
                  placeholder="Search name, email, UID, action…"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  aria-label="Search user activity"
                />
              </label>

              <select
                className="select"
                value={activityFilter}
                onChange={(event) =>
                  setActivityFilter(event.target.value as ActivityFilter)
                }
                aria-label="Filter by activity"
              >
                {ACTIVITY_FILTERS.map((filter) => (
                  <option key={filter.value} value={filter.value}>
                    {filter.label}
                  </option>
                ))}
              </select>

              <select
                className="select"
                value={roleFilter}
                onChange={(event) =>
                  setRoleFilter(event.target.value as RoleFilter)
                }
                aria-label="Filter by account role"
              >
                {ROLE_FILTERS.map((filter) => (
                  <option key={filter.value} value={filter.value}>
                    {filter.label}
                  </option>
                ))}
              </select>

              <select
                className="select"
                value={dateFilter}
                onChange={(event) =>
                  setDateFilter(event.target.value as DateFilter)
                }
                aria-label="Filter by date"
              >
                {DATE_FILTERS.map((filter) => (
                  <option key={filter.value} value={filter.value}>
                    {filter.label}
                  </option>
                ))}
              </select>
            </div>
          }
        >
          {logsLoading || usersLoading ? (
            <EmptyState
              title="Connecting to the activity stream"
              message="Loading account profiles and live monitoring records from Firebase."
              icon={<ClipboardList size={34} strokeWidth={2.3} />}
            />
          ) : filteredLogs.length === 0 ? (
            <EmptyState
              title="No matching user activity"
              message="Try a wider date range or clear one of the monitoring filters."
              icon={<ClipboardList size={34} strokeWidth={2.3} />}
            />
          ) : (
            <div className="table-wrap activity-monitor-table-wrap">
              <table className="activity-monitor-table">
                <thead>
                  <tr>
                    <th>Activity</th>
                    <th>User account</th>
                    <th>Role</th>
                    <th>Related record</th>
                    <th>Date &amp; time</th>
                  </tr>
                </thead>

                <tbody>
                  {filteredLogs.map((log) => {
                    const actor = getActorDetails(log, profilesById);
                    const entityType = firstText(log.entityType, log.module);

                    return (
                      <tr key={log.id}>
                        <td className="activity-monitor-event-cell">
                          <ActivityBadge type={getActivityCategory(log)} />
                          <strong>{getLogDescription(log)}</strong>
                          <small>
                            {firstText(log.type, log.action, "User activity")}
                            {log.module ? ` · ${log.module}` : ""}
                          </small>
                        </td>

                        <td>
                          <div className="activity-monitor-user">
                            <span className="activity-monitor-avatar" aria-hidden="true">
                              {getInitials(actor.name)}
                            </span>

                            <span className="activity-monitor-user__details">
                              <strong>{actor.name}</strong>
                              <small>{actor.email || "No email available"}</small>
                              {actor.id && <code>UID: {actor.id}</code>}
                            </span>
                          </div>
                        </td>

                        <td>
                          <span
                            className={`activity-monitor-role activity-monitor-role--${actor.role}`}
                          >
                            {formatRole(actor.role)}
                          </span>

                          {actor.status && (
                            <small className="activity-monitor-account-status">
                              {actor.status}
                            </small>
                          )}
                        </td>

                        <td>
                          <span className="activity-monitor-entity">
                            {entityType || "General activity"}
                          </span>
                          <small>
                            {log.entityId
                              ? `ID: ${log.entityId}`
                              : firstText(log.source, "Firebase")}
                          </small>
                        </td>

                        <td className="activity-monitor-time">
                          {formatDateTime(
                            getLogDateValue(log) as Parameters<
                              typeof formatDateTime
                            >[0],
                          )}
                          <small>Realtime Database</small>
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
    </DashboardShell>
  );
}