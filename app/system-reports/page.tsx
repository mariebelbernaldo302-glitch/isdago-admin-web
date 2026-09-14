"use client";

import { useEffect, useMemo, useState } from "react";
import type { ComponentType } from "react";
import {
  AlertTriangle,
  BadgeCheck,
  BarChart3,
  CheckCircle2,
  ClipboardList,
  Fish,
  MapPin,
  Package,
  Printer,
  ShoppingBag,
  Store,
  Users,
} from "lucide-react";
import { onValue, ref } from "firebase/database";

import { DashboardShell } from "../components/DashboardShell";
import { db } from "../lib/firebase";
import {
  formatDate,
  formatDateTime,
  formatMoney,
  formatNumber,
  normalizeStatus,
  toDate,
  toNumber,
} from "../lib/format";
import type {
  ActivityLog,
  Customer,
  Order,
  OrderItem,
  Product,
  TimestampValue,
  Vendor,
  VendorApplication,
} from "../lib/types";
import { useRealtimeCollection } from "../lib/useFirestoreCollection";
import styles from "./page.module.css";

type DatePreset = "all" | "this-month" | "last-30" | "custom";

type ReportCase = {
  id: string;
  category?: string;
  type?: string;
  status?: string;
  createdAt?: TimestampValue;
  updatedAt?: TimestampValue;
};

type FlattenedOrderItem = OrderItem & {
  id: string;
  orderId: string;
};

type DateRange = {
  start: number | null;
  end: number | null;
};

type MetricProps = {
  label: string;
  value: string;
  note: string;
  icon: ComponentType<{ size?: number; strokeWidth?: number }>;
};

const SUCCESS_ORDER_STATUSES = new Set(["completed", "delivered"]);
const CANCELLED_ORDER_STATUSES = new Set(["cancelled", "canceled", "failed"]);
const IN_PROGRESS_ORDER_STATUSES = new Set([
  "accepted",
  "processing",
  "preparing",
  "shipped",
  "for delivery",
  "out for delivery",
]);
const OPEN_CASE_STATUSES = new Set([
  "submitted",
  "pending",
  "pending review",
  "reviewing",
  "under review",
  "open",
]);
const RESOLVED_CASE_STATUSES = new Set([
  "resolved",
  "closed",
  "completed",
  "dismissed",
]);

function startOfDay(value: Date) {
  const result = new Date(value);
  result.setHours(0, 0, 0, 0);
  return result.getTime();
}

function endOfDay(value: Date) {
  const result = new Date(value);
  result.setHours(23, 59, 59, 999);
  return result.getTime();
}

function toInputDate(value: Date) {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function recordTime(...values: unknown[]) {
  for (const value of values) {
    const date = toDate(value as TimestampValue);
    if (date) return date.getTime();
  }
  return 0;
}

function isTimeWithinRange(time: number, range: DateRange) {
  if (range.start === null || range.end === null) return true;
  return time > 0 && time >= range.start && time <= range.end;
}

function orderTime(order: Order) {
  return recordTime(order.completedAt, order.createdAt, order.updatedAt, order.date);
}

function applicationTime(application: VendorApplication) {
  return recordTime(
    application.submittedAt,
    application.createdAt,
    application.updatedAt,
    application.dateApplied,
  );
}

function customerTime(customer: Customer) {
  return recordTime(customer.createdAt, customer.updatedAt, customer.dateRegistered);
}

function vendorTime(vendor: Vendor) {
  return recordTime(
    vendor.approvedAt,
    vendor.createdAt,
    vendor.updatedAt,
    vendor.dateRegistered,
    vendor.dateApplied,
  );
}

function caseTime(report: ReportCase) {
  return recordTime(report.createdAt, report.updatedAt);
}

function activityTime(activity: ActivityLog) {
  return recordTime(activity.createdAt, activity.updatedAt, activity.timestamp);
}

function orderAmount(order: Order) {
  return Math.max(
    0,
    toNumber(order.totalAmount ?? order.grandTotal ?? order.total ?? order.amount, 0),
  );
}

function orderStatus(order: Order) {
  return normalizeStatus(order.status || "pending");
}

function isSuccessfulOrder(order: Order) {
  return SUCCESS_ORDER_STATUSES.has(orderStatus(order));
}

function isCancelledOrder(order: Order) {
  return CANCELLED_ORDER_STATUSES.has(orderStatus(order));
}

function percent(part: number, total: number) {
  if (total <= 0) return 0;
  return Math.round((part / total) * 1000) / 10;
}

function safeName(value?: string | null, fallback = "Not provided") {
  return value?.trim() || fallback;
}

function getVendorDisplayName(vendor: Vendor) {
  return safeName(
    vendor.businessName || vendor.storeName || vendor.vendorName || vendor.name,
    "Unnamed vendor",
  );
}

function getProductDisplayName(product: Product) {
  return safeName(product.name || product.productName, "Unnamed seafood product");
}

function getOrderItemName(item: FlattenedOrderItem) {
  return safeName(item.productName || item.name, "Unidentified product");
}

function getCaseCategory(report: ReportCase) {
  return safeName(report.category || report.type, "Other");
}

function isApprovedVendor(vendor: Vendor) {
  const status = normalizeStatus(vendor.status || "active");
  const applicationStatus = normalizeStatus(vendor.applicationStatus || "approved");
  return (
    !["disabled", "rejected", "blocked"].includes(status) &&
    applicationStatus !== "rejected" &&
    applicationStatus !== "pending"
  );
}

function isActiveProduct(product: Product) {
  const status = normalizeStatus(product.status || product.availability || "active");
  return (
    !["inactive", "disabled", "rejected", "removed", "archived", "out of stock"].includes(status) &&
    toNumber(product.stock, 0) > 0
  );
}

function useFlattenedOrderItems() {
  const [data, setData] = useState<FlattenedOrderItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const unsubscribe = onValue(
      ref(db, "order_items"),
      (snapshot) => {
        const root = snapshot.val() as Record<string, unknown> | null;
        const rows: FlattenedOrderItem[] = [];

        if (root && typeof root === "object") {
          Object.entries(root).forEach(([orderId, rawItems]) => {
            if (!rawItems || typeof rawItems !== "object" || Array.isArray(rawItems)) return;

            Object.entries(rawItems as Record<string, unknown>).forEach(([itemId, rawItem]) => {
              if (!rawItem || typeof rawItem !== "object" || Array.isArray(rawItem)) return;
              rows.push({ ...(rawItem as OrderItem), id: itemId, orderId });
            });
          });
        }

        setData(rows);
        setLoading(false);
        setError("");
      },
      (firebaseError) => {
        console.error("Failed to load order_items for system report:", firebaseError);
        setData([]);
        setLoading(false);
        setError(firebaseError.message || "Failed to load order item records.");
      },
    );

    return () => unsubscribe();
  }, []);

  return { data, loading, error };
}

function ReportMetric({ label, value, note, icon: Icon }: MetricProps) {
  return (
    <article className={styles.metricCard}>
      <div className={styles.metricIcon} aria-hidden="true">
        <Icon size={22} strokeWidth={2.2} />
      </div>
      <div>
        <span>{label}</span>
        <strong>{value}</strong>
        <p>{note}</p>
      </div>
    </article>
  );
}

export default function SystemReportsPage() {
  const now = useMemo(() => new Date(), []);
  const monthStart = useMemo(() => new Date(now.getFullYear(), now.getMonth(), 1), [now]);
  const [preset, setPreset] = useState<DatePreset>("this-month");
  const [customStart, setCustomStart] = useState(toInputDate(monthStart));
  const [customEnd, setCustomEnd] = useState(toInputDate(now));

  const customersQuery = useRealtimeCollection<Customer>("customers", "createdAt");
  const vendorsQuery = useRealtimeCollection<Vendor>("vendors", "createdAt");
  const applicationsQuery = useRealtimeCollection<VendorApplication>("vendor_applications", "createdAt");
  const productsQuery = useRealtimeCollection<Product>("products", "createdAt");
  const ordersQuery = useRealtimeCollection<Order>("orders", "createdAt");
  const casesQuery = useRealtimeCollection<ReportCase>("reports", "createdAt");
  const activityQuery = useRealtimeCollection<ActivityLog>("activity_logs", "createdAt", { limit: 1000 });
  const orderItemsQuery = useFlattenedOrderItems();

  const range = useMemo<DateRange>(() => {
    if (preset === "all") return { start: null, end: null };

    if (preset === "this-month") {
      return {
        start: startOfDay(new Date(now.getFullYear(), now.getMonth(), 1)),
        end: endOfDay(now),
      };
    }

    if (preset === "last-30") {
      const start = new Date(now);
      start.setDate(start.getDate() - 29);
      return { start: startOfDay(start), end: endOfDay(now) };
    }

    const startDate = new Date(`${customStart}T00:00:00`);
    const endDate = new Date(`${customEnd}T23:59:59.999`);
    if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) {
      return { start: null, end: null };
    }

    return {
      start: Math.min(startDate.getTime(), endDate.getTime()),
      end: Math.max(startDate.getTime(), endDate.getTime()),
    };
  }, [customEnd, customStart, now, preset]);

  const periodLabel = useMemo(() => {
    if (range.start === null || range.end === null) return "All available system records";
    return `${formatDate(range.start)} – ${formatDate(range.end)}`;
  }, [range]);

  const customers = customersQuery.data;
  const vendors = vendorsQuery.data;
  const applications = applicationsQuery.data;
  const products = productsQuery.data;
  const orders = ordersQuery.data;
  const reports = casesQuery.data;
  const activities = activityQuery.data;
  const orderItems = orderItemsQuery.data;

  const report = useMemo(() => {
    const periodOrders = orders.filter((order) => isTimeWithinRange(orderTime(order), range));
    const completedOrders = periodOrders.filter(isSuccessfulOrder);
    const cancelledOrders = periodOrders.filter(isCancelledOrder);
    const inProgressOrders = periodOrders.filter((order) => IN_PROGRESS_ORDER_STATUSES.has(orderStatus(order)));
    const pendingOrders = periodOrders.filter((order) => orderStatus(order) === "pending");

    const approvedVendors = vendors.filter(isApprovedVendor);
    const activeProducts = products.filter(isActiveProduct);
    const outOfStockProducts = products.filter((product) => toNumber(product.stock, 0) <= 0);
    const lowStockProducts = products.filter((product) => {
      const stock = toNumber(product.stock, 0);
      return stock > 0 && stock <= 5;
    });

    const newCustomers = customers.filter((customer) => isTimeWithinRange(customerTime(customer), range)).length;
    const newVendors = vendors.filter((vendor) => isTimeWithinRange(vendorTime(vendor), range)).length;
    const periodApplications = applications.filter((application) => isTimeWithinRange(applicationTime(application), range));
    const periodCases = reports.filter((item) => isTimeWithinRange(caseTime(item), range));
    const periodActivities = activities.filter((activity) => isTimeWithinRange(activityTime(activity), range));

    const pendingApplications = applications.filter((application) => {
      const status = normalizeStatus(application.status || application.applicationStatus || "pending");
      return status.includes("pending") || status === "submitted" || status === "under review";
    }).length;
    const approvedApplications = applications.filter((application) =>
      ["approved", "active"].includes(normalizeStatus(application.status || application.applicationStatus)),
    ).length;
    const rejectedApplications = applications.filter((application) =>
      normalizeStatus(application.status || application.applicationStatus) === "rejected",
    ).length;

    const verifiedVendors = vendors.filter(
      (vendor) => normalizeStatus(vendor.identityVerificationStatus) === "verified",
    ).length;
    const submittedCustomerIds = customers.filter((customer) =>
      ["submitted", "verified", "approved"].includes(normalizeStatus(customer.identityVerificationStatus)),
    ).length;

    const successfulOrderIds = new Set(completedOrders.map((order) => order.orderId || order.id).filter(Boolean));
    const vendorOrderCounts = new Map<string, number>();
    const vendorCancelledCounts = new Map<string, number>();
    const vendorProductCounts = new Map<string, number>();

    completedOrders.forEach((order) => {
      const vendorId = order.vendorId?.trim();
      if (vendorId) vendorOrderCounts.set(vendorId, (vendorOrderCounts.get(vendorId) || 0) + 1);
    });
    cancelledOrders.forEach((order) => {
      const vendorId = order.vendorId?.trim();
      if (vendorId) vendorCancelledCounts.set(vendorId, (vendorCancelledCounts.get(vendorId) || 0) + 1);
    });
    activeProducts.forEach((product) => {
      const vendorId = product.vendorId?.trim();
      if (vendorId) vendorProductCounts.set(vendorId, (vendorProductCounts.get(vendorId) || 0) + 1);
    });

    const vendorsReceivingOrders = new Set(completedOrders.map((order) => order.vendorId?.trim()).filter(Boolean));
    const vendorsWithListings = new Set(activeProducts.map((product) => product.vendorId?.trim()).filter(Boolean));
    const participatingVendorIds = new Set([...vendorsReceivingOrders, ...vendorsWithListings]);

    const marketplaceValue = completedOrders.reduce((total, order) => total + orderAmount(order), 0);
    const averageCompletedOrder = completedOrders.length > 0 ? marketplaceValue / completedOrders.length : 0;

    const demandMap = new Map<string, { name: string; quantity: number; orders: Set<string> }>();
    orderItems.forEach((item) => {
      if (!successfulOrderIds.has(item.orderId)) return;
      const key = (item.productId || getOrderItemName(item)).trim().toLowerCase();
      if (!key) return;
      const current = demandMap.get(key) || { name: getOrderItemName(item), quantity: 0, orders: new Set<string>() };
      current.quantity += Math.max(0, toNumber(item.quantity, 0));
      current.orders.add(item.orderId);
      demandMap.set(key, current);
    });
    const demandRows = [...demandMap.values()]
      .map((item) => ({ name: item.name, quantity: item.quantity, orders: item.orders.size }))
      .sort((a, b) => b.quantity - a.quantity || b.orders - a.orders)
      .slice(0, 10);

    const priceMap = new Map<string, { name: string; values: number[]; unit: string }>();
    products.forEach((product) => {
      const price = toNumber(product.price, 0);
      if (price <= 0) return;
      const name = getProductDisplayName(product);
      const key = name.toLowerCase();
      const current = priceMap.get(key) || { name, values: [], unit: safeName(product.unit, "unit") };
      current.values.push(price);
      priceMap.set(key, current);
    });
    const priceRows = [...priceMap.values()]
      .map((item) => ({
        name: item.name,
        listings: item.values.length,
        unit: item.unit,
        min: Math.min(...item.values),
        max: Math.max(...item.values),
        average: item.values.reduce((total, value) => total + value, 0) / item.values.length,
      }))
      .sort((a, b) => b.listings - a.listings || a.name.localeCompare(b.name))
      .slice(0, 12);

    const barangayMap = new Map<string, number>();
    approvedVendors.forEach((vendor) => {
      const barangay = safeName(vendor.barangay, "Not provided");
      barangayMap.set(barangay, (barangayMap.get(barangay) || 0) + 1);
    });
    const barangayRows = [...barangayMap.entries()]
      .map(([barangay, count]) => ({ barangay, count }))
      .sort((a, b) => b.count - a.count || a.barangay.localeCompare(b.barangay))
      .slice(0, 12);

    const assistanceRows = approvedVendors
      .map((vendor) => {
        const vendorId = (vendor.uid || vendor.id).trim();
        const reasons: string[] = [];
        const listingCount = vendorProductCounts.get(vendorId) || 0;
        const completedCount = vendorOrderCounts.get(vendorId) || 0;
        const cancelledCount = vendorCancelledCounts.get(vendorId) || 0;
        if (listingCount === 0) reasons.push("No active product listings");
        if (completedCount === 0) reasons.push("No completed orders in period");
        if (cancelledCount >= 3) reasons.push(`${cancelledCount} cancelled/failed orders`);
        return {
          id: vendorId,
          name: getVendorDisplayName(vendor),
          barangay: safeName(vendor.barangay),
          listings: listingCount,
          completed: completedCount,
          cancelled: cancelledCount,
          reasons,
        };
      })
      .filter((vendor) => vendor.reasons.length > 0)
      .sort((a, b) => (b.reasons.length * 100 + b.cancelled) - (a.reasons.length * 100 + a.cancelled) || a.name.localeCompare(b.name))
      .slice(0, 12);

    const caseStatusCounts = {
      open: periodCases.filter((item) => OPEN_CASE_STATUSES.has(normalizeStatus(item.status || "submitted"))).length,
      resolved: periodCases.filter((item) => RESOLVED_CASE_STATUSES.has(normalizeStatus(item.status))).length,
    };
    const categoryMap = new Map<string, number>();
    periodCases.forEach((item) => {
      const category = getCaseCategory(item);
      categoryMap.set(category, (categoryMap.get(category) || 0) + 1);
    });
    const caseCategories = [...categoryMap.entries()]
      .map(([category, count]) => ({ category, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 6);

    return {
      periodOrders,
      completedOrders,
      cancelledOrders,
      inProgressOrders,
      pendingOrders,
      approvedVendors,
      activeProducts,
      outOfStockProducts,
      lowStockProducts,
      newCustomers,
      newVendors,
      periodApplications,
      periodCases,
      periodActivities,
      pendingApplications,
      approvedApplications,
      rejectedApplications,
      verifiedVendors,
      submittedCustomerIds,
      vendorsReceivingOrders,
      participatingVendorIds,
      marketplaceValue,
      averageCompletedOrder,
      demandRows,
      priceRows,
      barangayRows,
      assistanceRows,
      caseStatusCounts,
      caseCategories,
    };
  }, [activities, applications, customers, orderItems, orders, products, range, reports, vendors]);

  const isLoading =
    customersQuery.loading || vendorsQuery.loading || applicationsQuery.loading ||
    productsQuery.loading || ordersQuery.loading || casesQuery.loading ||
    activityQuery.loading || orderItemsQuery.loading;
  const error =
    customersQuery.error || vendorsQuery.error || applicationsQuery.error ||
    productsQuery.error || ordersQuery.error || casesQuery.error ||
    activityQuery.error || orderItemsQuery.error;

  const completionRate = percent(report.completedOrders.length, report.periodOrders.length);
  const vendorParticipationRate = percent(report.participatingVendorIds.size, report.approvedVendors.length);
  const maxDemandQuantity = Math.max(1, ...report.demandRows.map((item) => item.quantity));

  return (
    <DashboardShell
      title="Whole-System Report"
      description="LGU-oriented system, marketplace participation, fish availability, and livelihood-support reporting."
    >
      <div className={styles.page}>
        <section className={`${styles.controls} ${styles.noPrint}`}>
          <div className={styles.controlIntro}>
            <div className={styles.controlIcon}><BarChart3 size={24} strokeWidth={2.2} /></div>
            <div>
              <h2>Generate LGU Whole-System Report</h2>
              <p>Select a reporting period, review the live Firebase results, then print or save the report as PDF.</p>
            </div>
          </div>

          <div className={styles.filters}>
            <label>
              <span>Reporting period</span>
              <select value={preset} onChange={(event) => setPreset(event.target.value as DatePreset)}>
                <option value="this-month">This month</option>
                <option value="last-30">Last 30 days</option>
                <option value="all">All records</option>
                <option value="custom">Custom range</option>
              </select>
            </label>
            {preset === "custom" && (
              <>
                <label><span>Date from</span><input type="date" value={customStart} onChange={(event) => setCustomStart(event.target.value)} /></label>
                <label><span>Date to</span><input type="date" value={customEnd} onChange={(event) => setCustomEnd(event.target.value)} /></label>
              </>
            )}
            <button type="button" className={styles.printButton} onClick={() => window.print()}>
              <Printer size={18} strokeWidth={2.3} /> Print / Save PDF
            </button>
          </div>
        </section>

        {error && (
          <div className={`${styles.errorBox} ${styles.noPrint}`} role="alert">
            <AlertTriangle size={20} />
            <div><strong>Some report data could not be loaded.</strong><p>{error}</p></div>
          </div>
        )}

        <article className={styles.reportDocument}>
          <header className={styles.reportHeader}>
            <div className={styles.reportBrand}>
              <div className={styles.reportMark}>IG</div>
              <div>
                <span>ISDAGO • CATBALOGAN CITY</span>
                <h1>LGU Whole-System &amp; Livelihood Report</h1>
                <p>Digital marketplace monitoring for participating fish vendors and customers.</p>
              </div>
            </div>
            <dl className={styles.reportMeta}>
              <div><dt>Reporting period</dt><dd>{periodLabel}</dd></div>
              <div><dt>Generated</dt><dd>{formatDateTime(Date.now())}</dd></div>
              <div><dt>Data source</dt><dd>IsdaGo Firebase Realtime Database</dd></div>
            </dl>
          </header>

          {isLoading ? (
            <div className={styles.loadingState}>
              <BarChart3 size={28} /><strong>Loading live system records…</strong><span>The printable report will update automatically.</span>
            </div>
          ) : (
            <>
              <section className={styles.executiveSection}>
                <div className={styles.sectionHeading}><div><span>01</span><div><h2>Executive system overview</h2><p>Current platform size plus activity recorded during the selected reporting period.</p></div></div></div>
                <div className={styles.metricsGrid}>
                  <ReportMetric label="Registered customers" value={formatNumber(customers.length)} note={`${formatNumber(report.newCustomers)} registered in period`} icon={Users} />
                  <ReportMetric label="Approved vendors" value={formatNumber(report.approvedVendors.length)} note={`${formatNumber(report.newVendors)} vendor records added/approved in period`} icon={Store} />
                  <ReportMetric label="Orders in period" value={formatNumber(report.periodOrders.length)} note={`${completionRate}% completed/delivered`} icon={ShoppingBag} />
                  <ReportMetric label="Completed transaction value" value={formatMoney(report.marketplaceValue, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} note="Gross order value, not vendor profit or net income" icon={BarChart3} />
                </div>
                <div className={styles.summaryCallout}><CheckCircle2 size={21} strokeWidth={2.2} /><p>During <strong>{periodLabel}</strong>, IsdaGo recorded <strong>{formatNumber(report.completedOrders.length)}</strong> completed/delivered orders involving <strong>{formatNumber(report.vendorsReceivingOrders.size)}</strong> vendors. Current marketplace participation is <strong>{vendorParticipationRate}%</strong> of approved vendors based on active listings or completed orders.</p></div>
              </section>

              <section className={styles.reportSection}>
                <div className={styles.sectionHeading}><div><span>02</span><div><h2>Vendor registration &amp; document readiness</h2><p>Verification counts only; private ID and permit images are deliberately excluded from this report.</p></div></div><BadgeCheck size={24} /></div>
                <div className={styles.compactStats}>
                  <div><span>Vendor applications</span><strong>{formatNumber(applications.length)}</strong></div>
                  <div><span>Approved applications</span><strong>{formatNumber(report.approvedApplications)}</strong></div>
                  <div><span>Pending review</span><strong>{formatNumber(report.pendingApplications)}</strong></div>
                  <div><span>Rejected</span><strong>{formatNumber(report.rejectedApplications)}</strong></div>
                  <div><span>Verified vendor documents</span><strong>{formatNumber(report.verifiedVendors)}</strong></div>
                  <div><span>Customer IDs submitted</span><strong>{formatNumber(report.submittedCustomerIds)}</strong></div>
                </div>
              </section>

              <section className={styles.reportSection}>
                <div className={styles.sectionHeading}><div><span>03</span><div><h2>Vendor participation &amp; assistance indicators</h2><p>Helps the LGU identify vendors who are participating and vendors who may need onboarding or marketplace support.</p></div></div><Store size={24} /></div>
                <div className={styles.compactStats}>
                  <div><span>Approved vendors</span><strong>{formatNumber(report.approvedVendors.length)}</strong></div>
                  <div><span>Participating vendors</span><strong>{formatNumber(report.participatingVendorIds.size)}</strong></div>
                  <div><span>Vendors receiving completed orders</span><strong>{formatNumber(report.vendorsReceivingOrders.size)}</strong></div>
                  <div><span>Possible assistance list</span><strong>{formatNumber(report.assistanceRows.length)}</strong></div>
                </div>
                <div className={styles.tableBlock}>
                  <div className={styles.tableTitle}><h3>Vendors that may need attention</h3><p>Indicators are based on active listings and order activity in the selected reporting period; they are not disciplinary findings.</p></div>
                  <div className={styles.tableWrap}>
                    <table className={styles.reportTable}>
                      <thead><tr><th>Vendor</th><th>Barangay</th><th>Active listings</th><th>Completed orders</th><th>Indicator</th></tr></thead>
                      <tbody>
                        {report.assistanceRows.length === 0 ? <tr><td colSpan={5} className={styles.emptyCell}>No assistance indicators found for this period.</td></tr> : report.assistanceRows.map((vendor) => (
                          <tr key={vendor.id}><td><strong>{vendor.name}</strong></td><td>{vendor.barangay}</td><td>{formatNumber(vendor.listings)}</td><td>{formatNumber(vendor.completed)}</td><td>{vendor.reasons.join("; ")}</td></tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </section>

              <section className={styles.reportSection}>
                <div className={styles.sectionHeading}><div><span>04</span><div><h2>Fish/product availability &amp; market demand</h2><p>Current listing availability combined with demand from completed/delivered orders.</p></div></div><Fish size={24} /></div>
                <div className={styles.compactStats}>
                  <div><span>Total product listings</span><strong>{formatNumber(products.length)}</strong></div>
                  <div><span>Currently available</span><strong>{formatNumber(report.activeProducts.length)}</strong></div>
                  <div><span>Low-stock listings (≤5)</span><strong>{formatNumber(report.lowStockProducts.length)}</strong></div>
                  <div><span>Out of stock</span><strong>{formatNumber(report.outOfStockProducts.length)}</strong></div>
                </div>
                <div className={styles.twoColumn}>
                  <div className={styles.tableBlock}>
                    <div className={styles.tableTitle}><h3>Most demanded products</h3><p>Quantity recorded in successful orders for the selected period.</p></div>
                    <div className={styles.demandList}>
                      {report.demandRows.length === 0 ? <p className={styles.emptyMessage}>No completed order-item demand data is available for this period.</p> : report.demandRows.map((item, index) => (
                        <div key={`${item.name}-${index}`} className={styles.demandRow}>
                          <div className={styles.demandLabel}><strong>{index + 1}. {item.name}</strong><span>{formatNumber(item.quantity)} qty • {formatNumber(item.orders)} orders</span></div>
                          <div className={styles.demandTrack}><span style={{ width: `${Math.max(5, (item.quantity / maxDemandQuantity) * 100)}%` }} /></div>
                        </div>
                      ))}
                    </div>
                  </div>
                  <div className={styles.tableBlock}>
                    <div className={styles.tableTitle}><h3>Vendor coverage by barangay</h3><p>Current approved vendor records with barangay information.</p></div>
                    <div className={styles.tableWrap}>
                      <table className={styles.reportTable}>
                        <thead><tr><th>Barangay</th><th>Approved vendors</th></tr></thead>
                        <tbody>{report.barangayRows.length === 0 ? <tr><td colSpan={2} className={styles.emptyCell}>No barangay information available.</td></tr> : report.barangayRows.map((item) => <tr key={item.barangay}><td><MapPin size={15} /> {item.barangay}</td><td>{formatNumber(item.count)}</td></tr>)}</tbody>
                      </table>
                    </div>
                  </div>
                </div>
              </section>

              <section className={styles.reportSection}>
                <div className={styles.sectionHeading}><div><span>05</span><div><h2>Order performance &amp; marketplace activity</h2><p>Operational order results for the selected reporting period.</p></div></div><ShoppingBag size={24} /></div>
                <div className={styles.compactStats}>
                  <div><span>Completed / delivered</span><strong>{formatNumber(report.completedOrders.length)}</strong></div>
                  <div><span>Pending</span><strong>{formatNumber(report.pendingOrders.length)}</strong></div>
                  <div><span>In progress</span><strong>{formatNumber(report.inProgressOrders.length)}</strong></div>
                  <div><span>Cancelled / failed</span><strong>{formatNumber(report.cancelledOrders.length)}</strong></div>
                  <div><span>Completion rate</span><strong>{completionRate}%</strong></div>
                  <div><span>Average completed order</span><strong>{formatMoney(report.averageCompletedOrder, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong></div>
                </div>
                <div className={styles.marketplaceValueNote}><BarChart3 size={20} /><div><strong>Completed marketplace transaction value: {formatMoney(report.marketplaceValue, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong><p>This is the gross value of successful IsdaGo orders. It must not be interpreted as vendor profit, take-home income, or LGU revenue.</p></div></div>
              </section>

              <section className={styles.reportSection}>
                <div className={styles.sectionHeading}><div><span>06</span><div><h2>IsdaGo listing price monitoring</h2><p>Current asking prices from vendor listings. These are not official citywide market prices.</p></div></div><Package size={24} /></div>
                <div className={styles.tableWrap}>
                  <table className={styles.reportTable}>
                    <thead><tr><th>Product</th><th>Listings</th><th>Lowest</th><th>Average</th><th>Highest</th></tr></thead>
                    <tbody>{report.priceRows.length === 0 ? <tr><td colSpan={5} className={styles.emptyCell}>No priced product listings are available.</td></tr> : report.priceRows.map((item) => (
                      <tr key={item.name}><td><strong>{item.name}</strong><small> / {item.unit}</small></td><td>{formatNumber(item.listings)}</td><td>{formatMoney(item.min, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td><td>{formatMoney(item.average, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td><td>{formatMoney(item.max, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td></tr>
                    ))}</tbody>
                  </table>
                </div>
              </section>

              <section className={styles.reportSection}>
                <div className={styles.sectionHeading}><div><span>07</span><div><h2>Reports, complaints &amp; system activity</h2><p>Trust-and-safety workload and administrative activity recorded during the reporting period.</p></div></div><ClipboardList size={24} /></div>
                <div className={styles.compactStats}>
                  <div><span>Cases submitted in period</span><strong>{formatNumber(report.periodCases.length)}</strong></div>
                  <div><span>Open / under review</span><strong>{formatNumber(report.caseStatusCounts.open)}</strong></div>
                  <div><span>Resolved / closed</span><strong>{formatNumber(report.caseStatusCounts.resolved)}</strong></div>
                  <div><span>Admin/system activity records</span><strong>{formatNumber(report.periodActivities.length)}</strong></div>
                  <div><span>Vendor applications in period</span><strong>{formatNumber(report.periodApplications.length)}</strong></div>
                  <div><span>New customer records in period</span><strong>{formatNumber(report.newCustomers)}</strong></div>
                </div>
                {report.caseCategories.length > 0 && <div className={styles.categoryRow}>{report.caseCategories.map((item) => <span key={item.category}>{item.category}: <strong>{formatNumber(item.count)}</strong></span>)}</div>}
              </section>

              <section className={styles.reportSection}>
                <div className={styles.sectionHeading}><div><span>08</span><div><h2>LGU program-use summary</h2><p>High-level indicators that can be used when discussing IsdaGo adoption and vendor support.</p></div></div><ClipboardList size={24} /></div>
                <div className={styles.programSummary}>
                  <div><strong>{formatNumber(report.approvedVendors.length)}</strong><span>approved fish vendors currently represented in the system</span></div>
                  <div><strong>{formatNumber(report.participatingVendorIds.size)}</strong><span>vendors with active listings or completed-order participation</span></div>
                  <div><strong>{formatNumber(report.completedOrders.length)}</strong><span>successful customer orders facilitated during the selected period</span></div>
                  <div><strong>{formatNumber(report.activeProducts.length)}</strong><span>currently available seafood/product listings</span></div>
                </div>
                <div className={styles.disclaimer}><AlertTriangle size={18} /><p><strong>Interpretation note:</strong> This report summarizes records inside IsdaGo. It does not represent all fish vendors, all seafood sales, official market prices, or household income across Catbalogan City. Identity documents and other sensitive verification images are intentionally excluded from printable reports.</p></div>
              </section>
            </>
          )}

          <footer className={styles.reportFooter}>
            <div><strong>IsdaGo • LGU Whole-System &amp; Livelihood Report</strong><span>System-generated from live administrative records.</span></div>
            <div className={styles.signatureArea}><span>Prepared/Reviewed by</span><strong>____________________________</strong></div>
          </footer>
        </article>
      </div>
    </DashboardShell>
  );
}
