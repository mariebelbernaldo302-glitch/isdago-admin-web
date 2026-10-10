"use client";

import { useEffect, useMemo, useState } from "react";
import type { ComponentType } from "react";
import {
  AlertTriangle,
  BadgeCheck,
  BarChart3,
  Calendar,
  CheckCircle2,
  ClipboardList,
  Fish,
  HelpCircle,
  ImageIcon,
  MapPin,
  Package,
  Printer,
  ShoppingBag,
  Store,
  Trash2,
  TrendingDown,
  TrendingUp,
  Users,
} from "lucide-react";
import { onValue, ref } from "firebase/database";

import { DashboardShell } from "../components/DashboardShell";
import { createActivityLog } from "../lib/activity";
import { deleteProductCascade } from "../lib/database";
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

type DatePreset =
  | "today"
  | "this-week"
  | "this-month"
  | "last-30"
  | "last-month"
  | "all"
  | "custom";

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

type HighestSoldItem = {
  name: string;
  price: number;
  vendorId?: string;
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

type SalesView = "daily" | "weekly" | "monthly";

type ReportSectionKey =
  | "overview"
  | "sales"
  | "fish"
  | "support"
  | "registration"
  | "orders"
  | "coverage";

const REPORT_SECTIONS: { key: ReportSectionKey; label: string; short: string }[] = [
  { key: "overview", label: "Executive overview", short: "Overview" },
  { key: "sales", label: "Vendor sales (daily / weekly / monthly)", short: "Vendor sales" },
  { key: "fish", label: "Fish market & prices", short: "Fish market" },
  { key: "support", label: "Vendor livelihood support", short: "Vendor help" },
  { key: "registration", label: "Registration & documents", short: "Registration" },
  { key: "orders", label: "Order performance", short: "Orders" },
  { key: "coverage", label: "Coverage & cases", short: "Coverage" },
];

const DEFAULT_VISIBLE_SECTIONS: Record<ReportSectionKey, boolean> = {
  overview: true,
  sales: true,
  fish: true,
  support: true,
  registration: true,
  orders: true,
  coverage: true,
};

// Match mobile app final states + common variants after normalizeStatus()
const SUCCESS_ORDER_STATUSES = new Set([
  "completed",
  "delivered",
  "complete",
  "order completed",
  "successfully completed",
  "successfully delivered",
  "delivery completed",
  "fulfilled",
  "done",
]);
const CANCELLED_ORDER_STATUSES = new Set([
  "cancelled",
  "canceled",
  "failed",
  "declined",
  "rejected",
]);
const IN_PROGRESS_ORDER_STATUSES = new Set([
  "accepted",
  "processing",
  "preparing",
  "ready",
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

function startOfWeek(value: Date) {
  const result = new Date(value);
  const day = result.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  result.setDate(result.getDate() + diff);
  result.setHours(0, 0, 0, 0);
  return result;
}

function endOfWeek(value: Date) {
  const start = startOfWeek(value);
  const end = new Date(start);
  end.setDate(end.getDate() + 6);
  end.setHours(23, 59, 59, 999);
  return end;
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
  // Prefer completion/delivery timestamps so period filters align with when the sale finished.
  return recordTime(
    order.completedAt,
    order.deliveredAt,
    order.outForDeliveryAt,
    order.readyAt,
    order.preparingAt,
    order.acceptedAt,
    order.createdAt,
    order.updatedAt,
    order.date,
  );
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

/**
 * Prefer per-vendor status written by the mobile app (vendorStatuses/{vendorId}/status)
 * when present; fall back to top-level status. This matches VendorOrdersActivity resolution.
 */
function orderStatus(order: Order) {
  const topLevel = normalizeStatus(order.status || "pending");
  const vendorId = order.vendorId?.trim();
  const vendorStatuses = order.vendorStatuses;

  if (vendorStatuses && typeof vendorStatuses === "object") {
    if (vendorId && vendorStatuses[vendorId]?.status) {
      return normalizeStatus(vendorStatuses[vendorId].status);
    }
    // Any vendor progress that is further along than pending
    for (const entry of Object.values(vendorStatuses)) {
      const s = normalizeStatus(entry?.status);
      if (s && s !== "pending" && s !== "unknown") {
        return s;
      }
    }
  }

  return topLevel;
}

function isSuccessfulOrder(order: Order) {
  const status = orderStatus(order);
  if (SUCCESS_ORDER_STATUSES.has(status)) return true;

  // Treat paid + non-cancelled as successful sale (covers edge cases where
  // status lag behind paymentStatus after delivery/completion).
  const payment = normalizeStatus(order.paymentStatus);
  if (
    (payment === "paid" || payment === "completed") &&
    !CANCELLED_ORDER_STATUSES.has(status) &&
    status !== "pending"
  ) {
    return true;
  }

  return false;
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

function getOrderItemName(item: FlattenedOrderItem | OrderItem) {
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

function resolveProductImage(product: Product | null | undefined): string | null {
  if (!product) return null;
  const url = product.imageUrl?.trim();
  if (url) return url;
  const img = product.image?.trim();
  if (img) {
    if (img.startsWith("http") || img.startsWith("data:")) return img;
    if (img.length > 80) return `data:image/jpeg;base64,${img}`;
    return img;
  }
  const b64 = product.imageBase64?.trim();
  if (b64) {
    if (b64.startsWith("data:")) return b64;
    return `data:image/jpeg;base64,${b64}`;
  }
  return null;
}

function dayKey(ms: number) {
  const d = new Date(ms);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function weekKey(ms: number) {
  const d = new Date(ms);
  const start = startOfWeek(d);
  return dayKey(start.getTime());
}

function monthKey(ms: number) {
  const d = new Date(ms);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function formatWeekLabel(key: string) {
  const start = new Date(`${key}T00:00:00`);
  if (Number.isNaN(start.getTime())) return key;
  const end = new Date(start);
  end.setDate(end.getDate() + 6);
  return `${formatDate(start)} – ${formatDate(end)}`;
}

function formatMonthLabel(key: string) {
  const [y, m] = key.split("-").map(Number);
  if (!y || !m) return key;
  const d = new Date(y, m - 1, 1);
  return d.toLocaleDateString("en-PH", { month: "long", year: "numeric" });
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
            if (!rawItems || typeof rawItems !== "object") return;

            // Support both map and array shapes under order_items/{orderId}
            const entries = Array.isArray(rawItems)
              ? rawItems.map((item, idx) => [String(idx), item] as const)
              : Object.entries(rawItems as Record<string, unknown>);

            entries.forEach(([itemId, rawItem]) => {
              if (!rawItem || typeof rawItem !== "object" || Array.isArray(rawItem)) return;
              const item = rawItem as OrderItem;
              rows.push({
                ...item,
                id: item.id || itemId,
                orderId: (item as { orderId?: string }).orderId || orderId,
                // Keep real productId only — never fall back to the RTDB item key
                // (that would falsely treat order-item keys as product ids).
                productId: item.productId || undefined,
              });
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
        <Icon size={20} strokeWidth={2.2} />
      </div>
      <div>
        <span>{label}</span>
        <strong>{value}</strong>
        <p>{note}</p>
      </div>
    </article>
  );
}

function ProductThumb({ src, alt }: { src: string | null; alt: string }) {
  if (!src) {
    return (
      <div className={styles.thumbPlaceholder} aria-hidden="true">
        <ImageIcon size={18} strokeWidth={2} />
      </div>
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img className={styles.thumb} src={src} alt={alt} loading="lazy" />
  );
}

export default function SystemReportsPage() {
  const now = useMemo(() => new Date(), []);
  const monthStart = useMemo(() => new Date(now.getFullYear(), now.getMonth(), 1), [now]);
  // Default to all-time so fish-market sales/demand cards are not empty when
  // completed orders fall outside the current calendar month.
  const [preset, setPreset] = useState<DatePreset>("all");
  const [customStart, setCustomStart] = useState(toInputDate(monthStart));
  const [customEnd, setCustomEnd] = useState(toInputDate(now));
  const [salesView, setSalesView] = useState<SalesView>("daily");
  const [vendorSearch, setVendorSearch] = useState("");
  const [visibleSections, setVisibleSections] =
    useState<Record<ReportSectionKey, boolean>>(DEFAULT_VISIBLE_SECTIONS);
  const [deletingProductId, setDeletingProductId] = useState<string | null>(null);
  const [deleteMessage, setDeleteMessage] = useState("");

  const toggleSection = (key: ReportSectionKey) => {
    setVisibleSections((prev) => {
      const next = { ...prev, [key]: !prev[key] };
      // Keep at least one section visible
      if (!Object.values(next).some(Boolean)) return prev;
      return next;
    });
  };

  const showAllSections = () => setVisibleSections({ ...DEFAULT_VISIBLE_SECTIONS });

  const showOnlySection = (key: ReportSectionKey) => {
    const next = { ...DEFAULT_VISIBLE_SECTIONS };
    (Object.keys(next) as ReportSectionKey[]).forEach((k) => {
      next[k] = k === key;
    });
    setVisibleSections(next);
  };

  const visibleSectionLabels = REPORT_SECTIONS.filter((s) => visibleSections[s.key]).map(
    (s) => s.short,
  );

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

    if (preset === "today") {
      return { start: startOfDay(now), end: endOfDay(now) };
    }

    if (preset === "this-week") {
      return { start: startOfWeek(now).getTime(), end: endOfWeek(now).getTime() };
    }

    if (preset === "this-month") {
      return {
        start: startOfDay(new Date(now.getFullYear(), now.getMonth(), 1)),
        end: endOfDay(now),
      };
    }

    if (preset === "last-month") {
      const start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const end = new Date(now.getFullYear(), now.getMonth(), 0);
      return { start: startOfDay(start), end: endOfDay(end) };
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
    const inProgressOrders = periodOrders.filter((order) =>
      IN_PROGRESS_ORDER_STATUSES.has(orderStatus(order)),
    );
    const pendingOrders = periodOrders.filter((order) => orderStatus(order) === "pending");

    const approvedVendors = vendors.filter(isApprovedVendor);
    const activeProducts = products.filter(isActiveProduct);
    const outOfStockProducts = products.filter((product) => toNumber(product.stock, 0) <= 0);
    const lowStockProducts = products.filter((product) => {
      const stock = toNumber(product.stock, 0);
      return stock > 0 && stock <= 5;
    });

    const newCustomers = customers.filter((customer) =>
      isTimeWithinRange(customerTime(customer), range),
    ).length;
    const newVendors = vendors.filter((vendor) => isTimeWithinRange(vendorTime(vendor), range)).length;
    const periodApplications = applications.filter((application) =>
      isTimeWithinRange(applicationTime(application), range),
    );
    const periodCases = reports.filter((item) => isTimeWithinRange(caseTime(item), range));
    const periodActivities = activities.filter((activity) =>
      isTimeWithinRange(activityTime(activity), range),
    );

    const pendingApplications = applications.filter((application) => {
      const status = normalizeStatus(application.status || application.applicationStatus || "pending");
      return status.includes("pending") || status === "submitted" || status === "under review";
    }).length;
    const approvedApplications = applications.filter((application) =>
      ["approved", "active"].includes(
        normalizeStatus(application.status || application.applicationStatus),
      ),
    ).length;
    const rejectedApplications = applications.filter(
      (application) =>
        normalizeStatus(application.status || application.applicationStatus) === "rejected",
    ).length;

    const verifiedVendors = vendors.filter(
      (vendor) => normalizeStatus(vendor.identityVerificationStatus) === "verified",
    ).length;
    const submittedCustomerIds = customers.filter((customer) =>
      ["submitted", "verified", "approved"].includes(
        normalizeStatus(customer.identityVerificationStatus),
      ),
    ).length;

    // Collect every possible order key so order_items/{key} and embedded items match
    // whether the RTDB key or the orderId field is used.
    const successfulOrderIds = new Set<string>();
    completedOrders.forEach((order) => {
      const a = order.orderId?.trim();
      const b = order.id?.trim();
      if (a) successfulOrderIds.add(a);
      if (b) successfulOrderIds.add(b);
    });

    const vendorOrderCounts = new Map<string, number>();
    const vendorCancelledCounts = new Map<string, number>();
    const vendorSalesMap = new Map<string, number>();
    const vendorProductCounts = new Map<string, number>();

    completedOrders.forEach((order) => {
      const vendorId = order.vendorId?.trim();
      if (!vendorId) return;
      vendorOrderCounts.set(vendorId, (vendorOrderCounts.get(vendorId) || 0) + 1);
      vendorSalesMap.set(vendorId, (vendorSalesMap.get(vendorId) || 0) + orderAmount(order));
    });
    cancelledOrders.forEach((order) => {
      const vendorId = order.vendorId?.trim();
      if (vendorId) vendorCancelledCounts.set(vendorId, (vendorCancelledCounts.get(vendorId) || 0) + 1);
    });
    activeProducts.forEach((product) => {
      const vendorId = product.vendorId?.trim();
      if (vendorId) vendorProductCounts.set(vendorId, (vendorProductCounts.get(vendorId) || 0) + 1);
    });

    const vendorsReceivingOrders = new Set(
      completedOrders.map((order) => order.vendorId?.trim()).filter(Boolean) as string[],
    );
    const vendorsWithListings = new Set(
      activeProducts.map((product) => product.vendorId?.trim()).filter(Boolean) as string[],
    );
    const participatingVendorIds = new Set([...vendorsReceivingOrders, ...vendorsWithListings]);

    const marketplaceValue = completedOrders.reduce((total, order) => total + orderAmount(order), 0);
    const averageCompletedOrder =
      completedOrders.length > 0 ? marketplaceValue / completedOrders.length : 0;

    // Flatten items from order_items path + embedded order.items
    const allSuccessfulItems: Array<FlattenedOrderItem & { vendorId?: string; time: number }> = [];
    const seenItemKeys = new Set<string>();

    const orderMatchesId = (order: Order, id: string) => {
      const a = order.orderId?.trim();
      const b = order.id?.trim();
      return (a && a === id) || (b && b === id);
    };

    orderItems.forEach((item) => {
      const oid = (item.orderId || "").trim();
      if (!oid || !successfulOrderIds.has(oid)) return;
      const parent = completedOrders.find((o) => orderMatchesId(o, oid));
      const dedupeKey = `${oid}:${item.id || item.productId || item.productName || ""}`;
      if (seenItemKeys.has(dedupeKey)) return;
      seenItemKeys.add(dedupeKey);
      allSuccessfulItems.push({
        ...item,
        orderId: oid,
        vendorId: item.vendorId || parent?.vendorId,
        time: parent ? orderTime(parent) : 0,
      });
    });
    completedOrders.forEach((order) => {
      const oid = (order.orderId || order.id || "").trim();
      if (!oid || !order.items) return;
      const items = Array.isArray(order.items)
        ? order.items
        : Object.entries(order.items).map(([id, row]) => ({ ...row, id }));
      items.forEach((raw, idx) => {
        if (!raw || typeof raw !== "object") return;
        const item = raw as OrderItem;
        const itemId = item.id || `embedded-${oid}-${idx}`;
        const dedupeKey = `${oid}:${itemId}`;
        if (seenItemKeys.has(dedupeKey)) return;
        seenItemKeys.add(dedupeKey);
        allSuccessfulItems.push({
          ...item,
          id: itemId,
          orderId: oid,
          vendorId: item.vendorId || order.vendorId,
          time: orderTime(order),
        });
      });
    });

    // Live product keys — demand / best-seller cards only show products that
    // still exist in the catalog (deleted listings are hidden from these ranks).
    const liveProductIds = new Set(
      products.map((p) => (p.id || "").trim().toLowerCase()).filter(Boolean),
    );
    const liveProductNames = new Set(
      products.map((p) => getProductDisplayName(p).trim().toLowerCase()).filter(Boolean),
    );
    const isLiveProduct = (productId: string | undefined, name: string) => {
      const id = (productId || "").trim().toLowerCase();
      const nm = name.trim().toLowerCase();
      // Prefer id match; only fall back to name when no productId was stored.
      if (id) return liveProductIds.has(id);
      if (nm) return liveProductNames.has(nm);
      return false;
    };

    // Demand / best seller
    const demandMap = new Map<
      string,
      {
        name: string;
        productId: string;
        quantity: number;
        revenue: number;
        orders: Set<string>;
        image: string | null;
      }
    >();
    allSuccessfulItems.forEach((item) => {
      const name = getOrderItemName(item);
      const productId = (item.productId || "").trim();
      // Skip items whose product was deleted from the catalog
      if (!isLiveProduct(productId, name)) return;
      const key = (productId || name).trim().toLowerCase();
      if (!key) return;
      const qty = Math.max(0, toNumber(item.quantity, 0));
      const price = toNumber(item.price, 0);
      const sub = toNumber(item.subtotal, qty * price);
      const current = demandMap.get(key) || {
        name,
        productId,
        quantity: 0,
        revenue: 0,
        orders: new Set<string>(),
        image: item.image?.trim() || null,
      };
      current.quantity += qty;
      current.revenue += sub > 0 ? sub : qty * price;
      current.orders.add(item.orderId);
      if (!current.image && item.image) current.image = item.image;
      demandMap.set(key, current);
    });

    // Attach listing images from products
    products.forEach((product) => {
      const key = (product.id || getProductDisplayName(product)).trim().toLowerCase();
      const byName = getProductDisplayName(product).toLowerCase();
      const img = resolveProductImage(product);
      if (!img) return;
      const hit = demandMap.get(key) || demandMap.get(byName);
      if (hit && !hit.image) hit.image = img;
    });

    const demandRows = [...demandMap.values()]
      .map((item) => ({
        name: item.name,
        quantity: item.quantity,
        revenue: item.revenue,
        orders: item.orders.size,
        image: item.image,
      }))
      .sort((a, b) => b.quantity - a.quantity || b.revenue - a.revenue)
      .slice(0, 15);

    const bestSellerByRevenue = [...demandMap.values()]
      .sort((a, b) => b.revenue - a.revenue || b.quantity - a.quantity)
      .slice(0, 10)
      .map((item) => ({
        name: item.name,
        quantity: item.quantity,
        revenue: item.revenue,
        orders: item.orders.size,
        image: item.image,
      }));

    // Price board + most expensive listings (with photos)
    type ListingRow = {
      id: string;
      name: string;
      vendorId: string;
      vendorName: string;
      price: number;
      stock: number;
      unit: string;
      image: string | null;
      status: string;
    };
    const listingRows: ListingRow[] = products
      .map((product) => {
        const price = toNumber(product.price, 0);
        if (price <= 0) return null;
        const vendorId = product.vendorId?.trim() || "";
        const vendor = vendors.find((v) => (v.uid || v.id) === vendorId || v.id === vendorId);
        return {
          id: product.id,
          name: getProductDisplayName(product),
          vendorId,
          vendorName: vendor ? getVendorDisplayName(vendor) : safeName(product.vendorName, "Unknown vendor"),
          price,
          stock: toNumber(product.stock, 0),
          unit: safeName(product.unit, "kg"),
          image: resolveProductImage(product),
          status: normalizeStatus(product.status || product.availability || "active"),
        };
      })
      .filter((row): row is ListingRow => row !== null)
      .sort((a, b) => b.price - a.price || a.name.localeCompare(b.name));

    const mostExpensiveListings = listingRows.slice(0, 12);

    const priceMap = new Map<string, { name: string; values: number[]; unit: string }>();
    listingRows.forEach((row) => {
      const key = row.name.toLowerCase();
      const current = priceMap.get(key) || { name: row.name, values: [], unit: row.unit };
      current.values.push(row.price);
      priceMap.set(key, current);
    });
    const priceRows = [...priceMap.values()]
      .map((item) => ({
        name: item.name,
        listings: item.values.length,
        unit: item.unit,
        min: Math.min(...item.values),
        max: Math.max(...item.values),
        average: item.values.reduce((t, v) => t + v, 0) / item.values.length,
      }))
      .sort((a, b) => b.listings - a.listings || a.name.localeCompare(b.name))
      .slice(0, 15);

    // Highest sold unit price from order items (live products only)
    let highestSold: HighestSoldItem | null = null;
    for (const item of allSuccessfulItems) {
      const name = getOrderItemName(item);
      if (!isLiveProduct(item.productId, name)) continue;
      const price = toNumber(item.price, 0);
      if (price <= 0) continue;
      if (!highestSold || price > highestSold.price) {
        highestSold = {
          name,
          price,
          vendorId: item.vendorId,
        };
      }
    }

    const barangayMap = new Map<string, number>();
    approvedVendors.forEach((vendor) => {
      const barangay = safeName(vendor.barangay, "Not provided");
      barangayMap.set(barangay, (barangayMap.get(barangay) || 0) + 1);
    });
    const barangayRows = [...barangayMap.entries()]
      .map(([barangay, count]) => ({ barangay, count }))
      .sort((a, b) => b.count - a.count || a.barangay.localeCompare(b.barangay))
      .slice(0, 12);

    // Vendor assistance with actionable tips
    const assistanceRows = approvedVendors
      .map((vendor) => {
        const vendorId = (vendor.uid || vendor.id).trim();
        const reasons: string[] = [];
        const tips: string[] = [];
        const listingCount = vendorProductCounts.get(vendorId) || 0;
        const completedCount = vendorOrderCounts.get(vendorId) || 0;
        const cancelledCount = vendorCancelledCounts.get(vendorId) || 0;
        const sales = vendorSalesMap.get(vendorId) || 0;

        if (listingCount === 0) {
          reasons.push("No active product listings");
          tips.push("Guide vendor to add fish products with clear photos and correct prices.");
        }
        if (completedCount === 0) {
          reasons.push("No completed orders in period");
          tips.push("Review pricing vs city average; ensure stock and delivery coverage.");
        }
        if (cancelledCount >= 3) {
          reasons.push(`${cancelledCount} cancelled/failed orders`);
          tips.push("Check order response time and delivery reliability with the vendor.");
        }
        const vendorListings = listingRows.filter((r) => r.vendorId === vendorId);
        const avgCityByName = new Map(priceRows.map((r) => [r.name.toLowerCase(), r.average]));
        vendorListings.forEach((listing) => {
          const avg = avgCityByName.get(listing.name.toLowerCase());
          if (avg && avg > 0 && listing.price > avg * 1.35) {
            reasons.push(`High price on ${listing.name}`);
            tips.push(
              `Suggest competitive range near ${formatMoney(avg, { minimumFractionDigits: 0, maximumFractionDigits: 0 })} for ${listing.name}.`,
            );
          }
        });
        const lowStock = vendorListings.filter((r) => r.stock > 0 && r.stock <= 5).length;
        if (lowStock > 0 && completedCount > 0) {
          reasons.push(`${lowStock} low-stock listing(s)`);
          tips.push("Remind vendor to restock popular items before peak days.");
        }

        return {
          id: vendorId,
          name: getVendorDisplayName(vendor),
          barangay: safeName(vendor.barangay),
          listings: listingCount,
          completed: completedCount,
          cancelled: cancelledCount,
          sales,
          reasons,
          tips: [...new Set(tips)],
        };
      })
      .filter((vendor) => vendor.reasons.length > 0)
      .sort(
        (a, b) =>
          b.reasons.length * 100 + b.cancelled - (a.reasons.length * 100 + a.cancelled) ||
          a.name.localeCompare(b.name),
      )
      .slice(0, 20);

    // Vendor sales leaderboard for period
    const vendorSalesRows = approvedVendors
      .map((vendor) => {
        const vendorId = (vendor.uid || vendor.id).trim();
        return {
          id: vendorId,
          name: getVendorDisplayName(vendor),
          barangay: safeName(vendor.barangay),
          sales: vendorSalesMap.get(vendorId) || 0,
          orders: vendorOrderCounts.get(vendorId) || 0,
          cancelled: vendorCancelledCounts.get(vendorId) || 0,
          listings: vendorProductCounts.get(vendorId) || 0,
          avgOrder:
            (vendorOrderCounts.get(vendorId) || 0) > 0
              ? (vendorSalesMap.get(vendorId) || 0) / (vendorOrderCounts.get(vendorId) || 1)
              : 0,
        };
      })
      .filter((v) => v.sales > 0 || v.orders > 0)
      .sort((a, b) => b.sales - a.sales || b.orders - a.orders);

    // Daily / weekly / monthly breakdowns
    type Bucket = { key: string; label: string; sales: number; orders: number; vendors: Set<string> };
    const dailyMap = new Map<string, Bucket>();
    const weeklyMap = new Map<string, Bucket>();
    const monthlyMap = new Map<string, Bucket>();

    completedOrders.forEach((order) => {
      const t = orderTime(order);
      if (!t) return;
      const amount = orderAmount(order);
      const vid = order.vendorId?.trim() || "";

      const dk = dayKey(t);
      const dBucket = dailyMap.get(dk) || {
        key: dk,
        label: formatDate(t),
        sales: 0,
        orders: 0,
        vendors: new Set<string>(),
      };
      dBucket.sales += amount;
      dBucket.orders += 1;
      if (vid) dBucket.vendors.add(vid);
      dailyMap.set(dk, dBucket);

      const wk = weekKey(t);
      const wBucket = weeklyMap.get(wk) || {
        key: wk,
        label: formatWeekLabel(wk),
        sales: 0,
        orders: 0,
        vendors: new Set<string>(),
      };
      wBucket.sales += amount;
      wBucket.orders += 1;
      if (vid) wBucket.vendors.add(vid);
      weeklyMap.set(wk, wBucket);

      const mk = monthKey(t);
      const mBucket = monthlyMap.get(mk) || {
        key: mk,
        label: formatMonthLabel(mk),
        sales: 0,
        orders: 0,
        vendors: new Set<string>(),
      };
      mBucket.sales += amount;
      mBucket.orders += 1;
      if (vid) mBucket.vendors.add(vid);
      monthlyMap.set(mk, mBucket);
    });

    const toRows = (map: Map<string, Bucket>) =>
      [...map.values()]
        .map((b) => ({
          key: b.key,
          label: b.label,
          sales: b.sales,
          orders: b.orders,
          vendorCount: b.vendors.size,
          avgOrder: b.orders > 0 ? b.sales / b.orders : 0,
        }))
        .sort((a, b) => b.key.localeCompare(a.key));

    const dailyRows = toRows(dailyMap);
    const weeklyRows = toRows(weeklyMap);
    const monthlyRows = toRows(monthlyMap);

    // Per-vendor daily/weekly/monthly (top vendors expanded)
    type VendorPeriodRow = {
      vendorId: string;
      vendorName: string;
      periodKey: string;
      periodLabel: string;
      sales: number;
      orders: number;
    };
    const vendorPeriodMaps = {
      daily: new Map<string, VendorPeriodRow>(),
      weekly: new Map<string, VendorPeriodRow>(),
      monthly: new Map<string, VendorPeriodRow>(),
    };

    completedOrders.forEach((order) => {
      const t = orderTime(order);
      const vendorId = order.vendorId?.trim();
      if (!t || !vendorId) return;
      const vendor = vendors.find((v) => (v.uid || v.id) === vendorId || v.id === vendorId);
      const vendorName = vendor ? getVendorDisplayName(vendor) : safeName(order.vendorName, vendorId);
      const amount = orderAmount(order);

      const add = (
        mode: SalesView,
        key: string,
        label: string,
      ) => {
        const map = vendorPeriodMaps[mode];
        const id = `${vendorId}::${key}`;
        const row = map.get(id) || {
          vendorId,
          vendorName,
          periodKey: key,
          periodLabel: label,
          sales: 0,
          orders: 0,
        };
        row.sales += amount;
        row.orders += 1;
        map.set(id, row);
      };

      const dk = dayKey(t);
      add("daily", dk, formatDate(t));
      const wk = weekKey(t);
      add("weekly", wk, formatWeekLabel(wk));
      const mk = monthKey(t);
      add("monthly", mk, formatMonthLabel(mk));
    });

    const caseStatusCounts = {
      open: periodCases.filter((item) =>
        OPEN_CASE_STATUSES.has(normalizeStatus(item.status || "submitted")),
      ).length,
      resolved: periodCases.filter((item) =>
        RESOLVED_CASE_STATUSES.has(normalizeStatus(item.status)),
      ).length,
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
      bestSellerByRevenue,
      priceRows,
      listingRows,
      mostExpensiveListings,
      highestSold: highestSold as HighestSoldItem | null,
      barangayRows,
      assistanceRows,
      vendorSalesRows,
      dailyRows,
      weeklyRows,
      monthlyRows,
      vendorPeriodMaps,
      caseStatusCounts,
      caseCategories,
    };
  }, [activities, applications, customers, orderItems, orders, products, range, reports, vendors]);

  const isLoading =
    customersQuery.loading ||
    vendorsQuery.loading ||
    applicationsQuery.loading ||
    productsQuery.loading ||
    ordersQuery.loading ||
    casesQuery.loading ||
    activityQuery.loading ||
    orderItemsQuery.loading;
  const error =
    customersQuery.error ||
    vendorsQuery.error ||
    applicationsQuery.error ||
    productsQuery.error ||
    ordersQuery.error ||
    casesQuery.error ||
    activityQuery.error ||
    orderItemsQuery.error;

  async function handleDeleteProduct(row: {
    id: string;
    name: string;
    vendorId: string;
    vendorName: string;
  }) {
    if (!row.id) return;
    const confirmed = window.confirm(
      `Delete product "${row.name}" from ${row.vendorName}?\n\nThis removes the listing and clears related cart / compliance links so it will no longer appear for customers or vendors. Order history is kept.`,
    );
    if (!confirmed) return;

    setDeletingProductId(row.id);
    setDeleteMessage("");
    try {
      const result = await deleteProductCascade(row.id);
      try {
        await createActivityLog({
          type: "product_deleted",
          action: "delete",
          module: "system-reports",
          description: `Deleted product "${row.name}" (vendor: ${row.vendorName}). Cart items removed: ${result.cartItemsRemoved}. Compliance cases closed: ${result.complianceCasesClosed}.`,
          entityType: "product",
          entityId: row.id,
          severity: "warning",
          metadata: {
            productName: row.name,
            vendorId: row.vendorId,
            vendorName: row.vendorName,
            cartItemsRemoved: result.cartItemsRemoved,
            complianceCasesClosed: result.complianceCasesClosed,
          },
        });
      } catch {
        // Activity log failure should not block the delete result.
      }
      const extras: string[] = [];
      if (result.cartItemsRemoved > 0) {
        extras.push(`${result.cartItemsRemoved} cart item(s) cleared`);
      }
      if (result.complianceCasesClosed > 0) {
        extras.push(`${result.complianceCasesClosed} compliance case(s) closed`);
      }
      setDeleteMessage(
        extras.length > 0
          ? `Deleted "${row.name}" — ${extras.join(", ")}.`
          : `Deleted "${row.name}". It will no longer appear in live listings.`,
      );
    } catch (e) {
      setDeleteMessage(e instanceof Error ? e.message : "Failed to delete product.");
    } finally {
      setDeletingProductId(null);
    }
  }

  // Explicit local — bypasses useMemo inference that can collapse highestSold to `never`.
  const highestSoldItem: HighestSoldItem | null =
    (report as { highestSold?: HighestSoldItem | null }).highestSold ?? null;

  const completionRate = percent(report.completedOrders.length, report.periodOrders.length);
  const vendorParticipationRate = percent(
    report.participatingVendorIds.size,
    report.approvedVendors.length,
  );
  const maxDemandQuantity = Math.max(1, ...report.demandRows.map((item) => item.quantity));

  const periodSalesRows =
    salesView === "daily"
      ? report.dailyRows
      : salesView === "weekly"
        ? report.weeklyRows
        : report.monthlyRows;

  const vendorDetailRows = useMemo(() => {
    const map = report.vendorPeriodMaps[salesView];
    const rows = [...map.values()];
    const q = vendorSearch.trim().toLowerCase();
    const filtered = q
      ? rows.filter(
          (r) =>
            r.vendorName.toLowerCase().includes(q) ||
            r.vendorId.toLowerCase().includes(q) ||
            r.periodLabel.toLowerCase().includes(q),
        )
      : rows;
    return filtered
      .sort((a, b) => b.periodKey.localeCompare(a.periodKey) || b.sales - a.sales)
      .slice(0, 80);
  }, [report.vendorPeriodMaps, salesView, vendorSearch]);

  const searchFilteredVendorSales = useMemo(() => {
    const q = vendorSearch.trim().toLowerCase();
    if (!q) return report.vendorSalesRows;
    return report.vendorSalesRows.filter(
      (v) =>
        v.name.toLowerCase().includes(q) ||
        v.barangay.toLowerCase().includes(q) ||
        v.id.toLowerCase().includes(q),
    );
  }, [report.vendorSalesRows, vendorSearch]);

  return (
    <DashboardShell
      title="System Reports"
      description="Office-ready marketplace, vendor sales, and fish market reporting for IsdaGo."
    >
      <div className={styles.page}>
        <section className={`${styles.controls} ${styles.noPrint}`}>
          <div className={styles.controlIntro}>
            <div className={styles.controlIcon}>
              <BarChart3 size={22} strokeWidth={2.2} />
            </div>
            <div>
              <h2>System &amp; sales report</h2>
              <p>
                Choose a period and which report sections to show. Only selected sections appear on
                screen and in the printed PDF.
              </p>
            </div>
          </div>

          <div className={styles.filters}>
            <label>
              <span>Reporting period</span>
              <select
                value={preset}
                onChange={(event) => setPreset(event.target.value as DatePreset)}
              >
                <option value="today">Today</option>
                <option value="this-week">This week</option>
                <option value="this-month">This month</option>
                <option value="last-month">Last month</option>
                <option value="last-30">Last 30 days</option>
                <option value="all">All records</option>
                <option value="custom">Custom range</option>
              </select>
            </label>
            {preset === "custom" && (
              <>
                <label>
                  <span>Date from</span>
                  <input
                    type="date"
                    value={customStart}
                    onChange={(event) => setCustomStart(event.target.value)}
                  />
                </label>
                <label>
                  <span>Date to</span>
                  <input
                    type="date"
                    value={customEnd}
                    onChange={(event) => setCustomEnd(event.target.value)}
                  />
                </label>
              </>
            )}
            <button type="button" className={styles.printButton} onClick={() => window.print()}>
              <Printer size={17} strokeWidth={2.3} /> Print / Save PDF
            </button>
          </div>
        </section>

        <section className={`${styles.sectionPicker} ${styles.noPrint}`} aria-label="Choose reports to display">
          <div className={styles.sectionPickerHeader}>
            <div>
              <h3>Which reports do you want to see?</h3>
              <p>Click a button to show or hide that section. Print only includes what is selected.</p>
            </div>
            <div className={styles.sectionPickerActions}>
              <button type="button" className={styles.ghostButton} onClick={showAllSections}>
                Show all
              </button>
            </div>
          </div>
          <div className={styles.sectionChips}>
            {REPORT_SECTIONS.map((section) => {
              const active = visibleSections[section.key];
              return (
                <button
                  key={section.key}
                  type="button"
                  className={active ? styles.sectionChipActive : styles.sectionChip}
                  onClick={() => toggleSection(section.key)}
                  onDoubleClick={() => showOnlySection(section.key)}
                  title={`${section.label} — double-click to show only this`}
                  aria-pressed={active}
                >
                  {active ? "✓ " : ""}
                  {section.short}
                </button>
              );
            })}
          </div>
          <p className={styles.sectionPickerHint}>
            Tip: double-click a button to show <strong>only</strong> that report. Selected:{" "}
            {visibleSectionLabels.length > 0 ? visibleSectionLabels.join(" · ") : "none"}
          </p>
        </section>

        {error && (
          <div className={`${styles.errorBox} ${styles.noPrint}`} role="alert">
            <AlertTriangle size={20} />
            <div>
              <strong>Some report data could not be loaded.</strong>
              <p>{error}</p>
            </div>
          </div>
        )}

        <article className={styles.reportDocument}>
          <header className={styles.reportHeader}>
            <div className={styles.reportBrand}>
              <div className={styles.reportMark}>IG</div>
              <div>
                <span>ISDAGO • CATBALOGAN CITY</span>
                <h1>System, Sales &amp; Livelihood Report</h1>
                <p>
                  Official-style monitoring of vendor sales, fish prices, demand, and support needs.
                </p>
              </div>
            </div>
            <dl className={styles.reportMeta}>
              <div>
                <dt>Reporting period</dt>
                <dd>{periodLabel}</dd>
              </div>
              <div>
                <dt>Generated</dt>
                <dd>{formatDateTime(Date.now())}</dd>
              </div>
              <div>
                <dt>Data source</dt>
                <dd>IsdaGo Firebase Realtime Database</dd>
              </div>
              <div>
                <dt>Sections included</dt>
                <dd>
                  {visibleSectionLabels.length > 0
                    ? visibleSectionLabels.join(", ")
                    : "None selected"}
                </dd>
              </div>
            </dl>
          </header>

          {isLoading ? (
            <div className={styles.loadingState}>
              <BarChart3 size={28} />
              <strong>Loading live system records…</strong>
              <span>The report updates automatically when data is ready.</span>
            </div>
          ) : (
            <>
              {/* 01 Executive */}
              {visibleSections.overview && (
              <section className={`${styles.executiveSection} ${styles.printSection}`}>
                <div className={styles.sectionHeading}>
                  <div>
                    <span>01</span>
                    <div>
                      <h2>Executive overview</h2>
                      <p>Platform size and activity for the selected period.</p>
                    </div>
                  </div>
                </div>
                <div className={styles.metricsGrid}>
                  <ReportMetric
                    label="Registered customers"
                    value={formatNumber(customers.length)}
                    note={`${formatNumber(report.newCustomers)} new in period`}
                    icon={Users}
                  />
                  <ReportMetric
                    label="Approved vendors"
                    value={formatNumber(report.approvedVendors.length)}
                    note={`${formatNumber(report.newVendors)} added/approved in period`}
                    icon={Store}
                  />
                  <ReportMetric
                    label="Orders in period"
                    value={formatNumber(report.periodOrders.length)}
                    note={`${completionRate}% completed/delivered`}
                    icon={ShoppingBag}
                  />
                  <ReportMetric
                    label="Completed sales value"
                    value={formatMoney(report.marketplaceValue, {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2,
                    })}
                    note="Gross marketplace GMV (not net profit)"
                    icon={BarChart3}
                  />
                </div>
                <div className={styles.summaryCallout}>
                  <CheckCircle2 size={20} strokeWidth={2.2} />
                  <p>
                    During <strong>{periodLabel}</strong>, IsdaGo recorded{" "}
                    <strong>{formatNumber(report.completedOrders.length)}</strong> completed
                    orders involving{" "}
                    <strong>{formatNumber(report.vendorsReceivingOrders.size)}</strong> vendors.
                    Participation is{" "}
                    <strong>{vendorParticipationRate}%</strong> of approved vendors (active listings
                    or completed orders).
                  </p>
                </div>
              </section>
              )}

              {/* 02 Vendor sales daily/weekly/monthly */}
              {visibleSections.sales && (
              <section className={`${styles.reportSection} ${styles.printSection}`}>
                <div className={styles.sectionHeading}>
                  <div>
                    <span>02</span>
                    <div>
                      <h2>Vendor sales — daily, weekly, monthly</h2>
                      <p>
                        Marketplace totals and per-vendor sales for the selected reporting period.
                      </p>
                    </div>
                  </div>
                  <Calendar size={22} />
                </div>

                <div className={`${styles.viewTabs} ${styles.noPrint}`}>
                  {(
                    [
                      ["daily", "Daily"],
                      ["weekly", "Weekly"],
                      ["monthly", "Monthly"],
                    ] as const
                  ).map(([key, label]) => (
                    <button
                      key={key}
                      type="button"
                      className={salesView === key ? styles.viewTabActive : styles.viewTab}
                      onClick={() => setSalesView(key)}
                    >
                      {label}
                    </button>
                  ))}
                </div>

                <div className={styles.compactStats}>
                  <div>
                    <span>Period GMV</span>
                    <strong>
                      {formatMoney(report.marketplaceValue, {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                      })}
                    </strong>
                  </div>
                  <div>
                    <span>Completed orders</span>
                    <strong>{formatNumber(report.completedOrders.length)}</strong>
                  </div>
                  <div>
                    <span>Vendors with sales</span>
                    <strong>{formatNumber(report.vendorsReceivingOrders.size)}</strong>
                  </div>
                  <div>
                    <span>Avg completed order</span>
                    <strong>
                      {formatMoney(report.averageCompletedOrder, {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                      })}
                    </strong>
                  </div>
                </div>

                <div className={styles.tableBlock}>
                  <div className={styles.tableTitle}>
                    <h3>
                      {salesView === "daily"
                        ? "Daily"
                        : salesView === "weekly"
                          ? "Weekly"
                          : "Monthly"}{" "}
                      marketplace totals
                    </h3>
                    <p>Grouped completed order value within the reporting period.</p>
                  </div>
                  <div className={styles.tableWrap}>
                    <table className={styles.reportTable}>
                      <thead>
                        <tr>
                          <th>Period</th>
                          <th>Sales (₱)</th>
                          <th>Orders</th>
                          <th>Active vendors</th>
                          <th>Avg order</th>
                        </tr>
                      </thead>
                      <tbody>
                        {periodSalesRows.length === 0 ? (
                          <tr>
                            <td colSpan={5} className={styles.emptyCell}>
                              No completed sales in this period.
                            </td>
                          </tr>
                        ) : (
                          periodSalesRows.map((row) => (
                            <tr key={row.key}>
                              <td>
                                <strong>{row.label}</strong>
                              </td>
                              <td>
                                {formatMoney(row.sales, {
                                  minimumFractionDigits: 2,
                                  maximumFractionDigits: 2,
                                })}
                              </td>
                              <td>{formatNumber(row.orders)}</td>
                              <td>{formatNumber(row.vendorCount)}</td>
                              <td>
                                {formatMoney(row.avgOrder, {
                                  minimumFractionDigits: 2,
                                  maximumFractionDigits: 2,
                                })}
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>

                <div className={styles.tableBlock}>
                  <div className={styles.tableTitle}>
                    <h3>Vendor sales ranking (period)</h3>
                    <p>Vendors ranked by completed sales value in the selected period.</p>
                    <div className={`${styles.inlineSearch} ${styles.noPrint}`}>
                      <label>
                        <span>Search vendor</span>
                        <input
                          type="search"
                          placeholder="Name, barangay, or ID…"
                          value={vendorSearch}
                          onChange={(e) => setVendorSearch(e.target.value)}
                        />
                      </label>
                    </div>
                  </div>
                  <div className={styles.tableWrap}>
                    <table className={styles.reportTable}>
                      <thead>
                        <tr>
                          <th>#</th>
                          <th>Vendor</th>
                          <th>Barangay</th>
                          <th>Sales (₱)</th>
                          <th>Orders</th>
                          <th>Cancelled</th>
                          <th>Avg order</th>
                          <th>Listings</th>
                        </tr>
                      </thead>
                      <tbody>
                        {searchFilteredVendorSales.length === 0 ? (
                          <tr>
                            <td colSpan={8} className={styles.emptyCell}>
                              No vendor sales match this period or search.
                            </td>
                          </tr>
                        ) : (
                          searchFilteredVendorSales.map((v, index) => (
                            <tr key={v.id}>
                              <td>{index + 1}</td>
                              <td>
                                <strong>{v.name}</strong>
                              </td>
                              <td>{v.barangay}</td>
                              <td>
                                {formatMoney(v.sales, {
                                  minimumFractionDigits: 2,
                                  maximumFractionDigits: 2,
                                })}
                              </td>
                              <td>{formatNumber(v.orders)}</td>
                              <td>{formatNumber(v.cancelled)}</td>
                              <td>
                                {formatMoney(v.avgOrder, {
                                  minimumFractionDigits: 2,
                                  maximumFractionDigits: 2,
                                })}
                              </td>
                              <td>{formatNumber(v.listings)}</td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>

                <div className={styles.tableBlock}>
                  <div className={styles.tableTitle}>
                    <h3>
                      Per-vendor breakdown (
                      {salesView === "daily"
                        ? "by day"
                        : salesView === "weekly"
                          ? "by week"
                          : "by month"}
                      )
                    </h3>
                    <p>Detailed sales per vendor per time bucket (top results shown).</p>
                  </div>
                  <div className={styles.tableWrap}>
                    <table className={styles.reportTable}>
                      <thead>
                        <tr>
                          <th>Vendor</th>
                          <th>Period</th>
                          <th>Sales (₱)</th>
                          <th>Orders</th>
                        </tr>
                      </thead>
                      <tbody>
                        {vendorDetailRows.length === 0 ? (
                          <tr>
                            <td colSpan={4} className={styles.emptyCell}>
                              No per-vendor period rows for this view.
                            </td>
                          </tr>
                        ) : (
                          vendorDetailRows.map((row) => (
                            <tr key={`${row.vendorId}-${row.periodKey}`}>
                              <td>
                                <strong>{row.vendorName}</strong>
                              </td>
                              <td>{row.periodLabel}</td>
                              <td>
                                {formatMoney(row.sales, {
                                  minimumFractionDigits: 2,
                                  maximumFractionDigits: 2,
                                })}
                              </td>
                              <td>{formatNumber(row.orders)}</td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              </section>
              )}

              {/* 03 Fish market */}
              {visibleSections.fish && (
              <section className={`${styles.reportSection} ${styles.printSection}`}>
                <div className={styles.sectionHeading}>
                  <div>
                    <span>03</span>
                    <div>
                      <h2>Fish market report</h2>
                      <p>
                        Best sellers, most expensive fish, and live listing prices with product
                        photos.
                      </p>
                    </div>
                  </div>
                  <Fish size={22} />
                </div>

                <div className={styles.highlightGrid}>
                  <article className={styles.highlightCard}>
                    <span className={styles.highlightLabel}>
                      <TrendingUp size={16} /> Best seller (by quantity)
                    </span>
                    {report.demandRows[0] ? (
                      <div className={styles.highlightBody}>
                        <ProductThumb
                          src={
                            report.demandRows[0].image?.startsWith("http") ||
                            report.demandRows[0].image?.startsWith("data:")
                              ? report.demandRows[0].image
                              : report.demandRows[0].image
                                ? `data:image/jpeg;base64,${report.demandRows[0].image}`
                                : null
                          }
                          alt={report.demandRows[0].name}
                        />
                        <div>
                          <strong>{report.demandRows[0].name}</strong>
                          <p>
                            {formatNumber(report.demandRows[0].quantity)} qty •{" "}
                            {formatNumber(report.demandRows[0].orders)} orders •{" "}
                            {formatMoney(report.demandRows[0].revenue, {
                              minimumFractionDigits: 2,
                              maximumFractionDigits: 2,
                            })}
                          </p>
                        </div>
                      </div>
                    ) : (
                      <p className={styles.emptyMessage}>No sales data in period.</p>
                    )}
                  </article>
                  <article className={styles.highlightCard}>
                    <span className={styles.highlightLabel}>
                      <BarChart3 size={16} /> Best seller (by revenue)
                    </span>
                    {report.bestSellerByRevenue[0] ? (
                      <div className={styles.highlightBody}>
                        <ProductThumb
                          src={
                            report.bestSellerByRevenue[0].image?.startsWith("http") ||
                            report.bestSellerByRevenue[0].image?.startsWith("data:")
                              ? report.bestSellerByRevenue[0].image
                              : report.bestSellerByRevenue[0].image
                                ? `data:image/jpeg;base64,${report.bestSellerByRevenue[0].image}`
                                : null
                          }
                          alt={report.bestSellerByRevenue[0].name}
                        />
                        <div>
                          <strong>{report.bestSellerByRevenue[0].name}</strong>
                          <p>
                            {formatMoney(report.bestSellerByRevenue[0].revenue, {
                              minimumFractionDigits: 2,
                              maximumFractionDigits: 2,
                            })}{" "}
                            • {formatNumber(report.bestSellerByRevenue[0].quantity)} qty
                          </p>
                        </div>
                      </div>
                    ) : (
                      <p className={styles.emptyMessage}>No revenue data in period.</p>
                    )}
                  </article>
                  <article className={styles.highlightCard}>
                    <span className={styles.highlightLabel}>
                      <TrendingDown size={16} /> Most Expensive (listed)
                    </span>
                    {report.mostExpensiveListings[0] ? (
                      <div className={styles.highlightBody}>
                        <ProductThumb
                          src={report.mostExpensiveListings[0].image}
                          alt={report.mostExpensiveListings[0].name}
                        />
                        <div>
                          <strong>{report.mostExpensiveListings[0].name}</strong>
                          <p>
                            {formatMoney(report.mostExpensiveListings[0].price, {
                              minimumFractionDigits: 2,
                              maximumFractionDigits: 2,
                            })}{" "}
                            / {report.mostExpensiveListings[0].unit} •{" "}
                            {report.mostExpensiveListings[0].vendorName}
                          </p>
                        </div>
                      </div>
                    ) : (
                      <p className={styles.emptyMessage}>No priced listings.</p>
                    )}
                  </article>
                  <article className={styles.highlightCard}>
                    <span className={styles.highlightLabel}>
                      <Package size={16} /> Highest sold unit price
                    </span>
                    {highestSoldItem ? (
                      <div className={styles.highlightBody}>
                        <div className={styles.thumbPlaceholder}>
                          <Fish size={18} />
                        </div>
                        <div>
                          <strong>{highestSoldItem.name}</strong>
                          <p>
                            {formatMoney(highestSoldItem.price, {
                              minimumFractionDigits: 2,
                              maximumFractionDigits: 2,
                            })}{" "}
                            unit price in a completed order
                          </p>
                        </div>
                      </div>
                    ) : (
                      <p className={styles.emptyMessage}>No sold unit prices in period.</p>
                    )}
                  </article>
                </div>

                <div className={styles.compactStats}>
                  <div>
                    <span>Total product listings</span>
                    <strong>{formatNumber(products.length)}</strong>
                  </div>
                  <div>
                    <span>Currently available</span>
                    <strong>{formatNumber(report.activeProducts.length)}</strong>
                  </div>
                  <div>
                    <span>Low stock (≤5)</span>
                    <strong>{formatNumber(report.lowStockProducts.length)}</strong>
                  </div>
                  <div>
                    <span>Out of stock</span>
                    <strong>{formatNumber(report.outOfStockProducts.length)}</strong>
                  </div>
                </div>

                <div className={styles.twoColumn}>
                  <div className={styles.tableBlock}>
                    <div className={styles.tableTitle}>
                      <h3>Most demanded fish (period)</h3>
                      <p>
                        Quantity from completed/delivered orders for products still in the catalog.
                        Deleted listings are excluded.
                      </p>
                    </div>
                    <div className={styles.demandList}>
                      {report.demandRows.length === 0 ? (
                        <p className={styles.emptyMessage}>No demand data for this period.</p>
                      ) : (
                        report.demandRows.map((item, index) => (
                          <div key={`${item.name}-${index}`} className={styles.demandRow}>
                            <div className={styles.demandLabel}>
                              <div className={styles.demandWithThumb}>
                                <ProductThumb
                                  src={
                                    item.image?.startsWith("http") || item.image?.startsWith("data:")
                                      ? item.image
                                      : item.image
                                        ? `data:image/jpeg;base64,${item.image}`
                                        : null
                                  }
                                  alt={item.name}
                                />
                                <strong>
                                  {index + 1}. {item.name}
                                </strong>
                              </div>
                              <span>
                                {formatNumber(item.quantity)} qty • {formatNumber(item.orders)}{" "}
                                orders
                              </span>
                            </div>
                            <div className={styles.demandTrack}>
                              <span
                                style={{
                                  width: `${Math.max(5, (item.quantity / maxDemandQuantity) * 100)}%`,
                                }}
                              />
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                  <div className={styles.tableBlock}>
                    <div className={styles.tableTitle}>
                      <h3>Price summary by fish name</h3>
                      <p>Min / average / max across current vendor listings.</p>
                    </div>
                    <div className={styles.tableWrap}>
                      <table className={styles.reportTable}>
                        <thead>
                          <tr>
                            <th>Fish</th>
                            <th>Listings</th>
                            <th>Min</th>
                            <th>Avg</th>
                            <th>Max</th>
                          </tr>
                        </thead>
                        <tbody>
                          {report.priceRows.length === 0 ? (
                            <tr>
                              <td colSpan={5} className={styles.emptyCell}>
                                No price data.
                              </td>
                            </tr>
                          ) : (
                            report.priceRows.map((row) => (
                              <tr key={row.name}>
                                <td>
                                  <strong>{row.name}</strong>
                                  <br />
                                  <small>/{row.unit}</small>
                                </td>
                                <td>{formatNumber(row.listings)}</td>
                                <td>
                                  {formatMoney(row.min, {
                                    minimumFractionDigits: 0,
                                    maximumFractionDigits: 0,
                                  })}
                                </td>
                                <td>
                                  {formatMoney(row.average, {
                                    minimumFractionDigits: 0,
                                    maximumFractionDigits: 0,
                                  })}
                                </td>
                                <td>
                                  {formatMoney(row.max, {
                                    minimumFractionDigits: 0,
                                    maximumFractionDigits: 0,
                                  })}
                                </td>
                              </tr>
                            ))
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>

                <div className={styles.tableBlock}>
                  <div className={styles.tableTitle}>
                    <h3>Vendor listings with photo &amp; actual price</h3>
                    <p>
                      Current product cards: image, fish name, vendor, actual price, stock. Sorted
                      by highest price first (pinaka mahal at top). Use Delete to permanently remove
                      a listing.
                    </p>
                  </div>
                  {deleteMessage ? (
                    <p className={styles.deleteMessage} role="status">
                      {deleteMessage}
                    </p>
                  ) : null}
                  <div className={styles.tableWrap}>
                    <table className={styles.reportTable}>
                      <thead>
                        <tr>
                          <th>Photo</th>
                          <th>Fish / product</th>
                          <th>Vendor</th>
                          <th>Actual price</th>
                          <th>Stock</th>
                          <th>Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {report.listingRows.length === 0 ? (
                          <tr>
                            <td colSpan={7} className={styles.emptyCell}>
                              No product listings with prices.
                            </td>
                          </tr>
                        ) : (
                          report.listingRows.slice(0, 40).map((row) => (
                            <tr key={row.id}>
                              <td>
                                <ProductThumb src={row.image} alt={row.name} />
                              </td>
                              <td>
                                <strong>{row.name}</strong>
                              </td>
                              <td>{row.vendorName}</td>
                              <td>
                                <strong>
                                  {formatMoney(row.price, {
                                    minimumFractionDigits: 2,
                                    maximumFractionDigits: 2,
                                  })}
                                </strong>
                                <br />
                                <small>/{row.unit}</small>
                              </td>
                              <td>{formatNumber(row.stock)}</td>
                              <td>
                                <span className={styles.statusPill}>{row.status}</span>
                              </td>
                              <td>
                                
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              </section>
              )}

              {/* 04 Vendor help */}
              {visibleSections.support && (
              <section className={`${styles.reportSection} ${styles.printSection}`}>
                <div className={styles.sectionHeading}>
                  <div>
                    <span>04</span>
                    <div>
                      <h2>Vendor livelihood support</h2>
                      <p>
                        Vendors who may need coaching or assistance — with concrete recommended
                        actions.
                      </p>
                    </div>
                  </div>
                  <HelpCircle size={22} />
                </div>
                <div className={styles.compactStats}>
                  <div>
                    <span>Approved vendors</span>
                    <strong>{formatNumber(report.approvedVendors.length)}</strong>
                  </div>
                  <div>
                    <span>Participating</span>
                    <strong>{formatNumber(report.participatingVendorIds.size)}</strong>
                  </div>
                  <div>
                    <span>With completed orders</span>
                    <strong>{formatNumber(report.vendorsReceivingOrders.size)}</strong>
                  </div>
                  <div>
                    <span>On assistance list</span>
                    <strong>{formatNumber(report.assistanceRows.length)}</strong>
                  </div>
                </div>
                <div className={styles.tableBlock}>
                  <div className={styles.tableTitle}>
                    <h3>Vendors that may need attention</h3>
                    <p>
                      Indicators are operational only — not disciplinary. Use tips for barangay or
                      LGU support visits.
                    </p>
                  </div>
                  <div className={styles.tableWrap}>
                    <table className={styles.reportTable}>
                      <thead>
                        <tr>
                          <th>Vendor</th>
                          <th>Barangay</th>
                          <th>Listings</th>
                          <th>Orders</th>
                          <th>Sales</th>
                          <th>Indicators</th>
                          <th>Recommended actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {report.assistanceRows.length === 0 ? (
                          <tr>
                            <td colSpan={7} className={styles.emptyCell}>
                              No assistance indicators for this period.
                            </td>
                          </tr>
                        ) : (
                          report.assistanceRows.map((vendor) => (
                            <tr key={vendor.id}>
                              <td>
                                <strong>{vendor.name}</strong>
                              </td>
                              <td>{vendor.barangay}</td>
                              <td>{formatNumber(vendor.listings)}</td>
                              <td>{formatNumber(vendor.completed)}</td>
                              <td>
                                {formatMoney(vendor.sales, {
                                  minimumFractionDigits: 0,
                                  maximumFractionDigits: 0,
                                })}
                              </td>
                              <td>
                                <ul className={styles.tipList}>
                                  {vendor.reasons.map((r) => (
                                    <li key={r}>{r}</li>
                                  ))}
                                </ul>
                              </td>
                              <td>
                                <ul className={styles.tipList}>
                                  {vendor.tips.map((t) => (
                                    <li key={t}>{t}</li>
                                  ))}
                                </ul>
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              </section>
              )}

              {/* 05 Registration */}
              {visibleSections.registration && (
              <section className={`${styles.reportSection} ${styles.printSection}`}>
                <div className={styles.sectionHeading}>
                  <div>
                    <span>05</span>
                    <div>
                      <h2>Registration &amp; document readiness</h2>
                      <p>Verification counts only; private ID images are not shown.</p>
                    </div>
                  </div>
                  <BadgeCheck size={22} />
                </div>
                <div className={styles.compactStats}>
                  <div>
                    <span>Vendor applications</span>
                    <strong>{formatNumber(applications.length)}</strong>
                  </div>
                  <div>
                    <span>Approved applications</span>
                    <strong>{formatNumber(report.approvedApplications)}</strong>
                  </div>
                  <div>
                    <span>Pending review</span>
                    <strong>{formatNumber(report.pendingApplications)}</strong>
                  </div>
                  <div>
                    <span>Rejected</span>
                    <strong>{formatNumber(report.rejectedApplications)}</strong>
                  </div>
                  <div>
                    <span>Verified vendor docs</span>
                    <strong>{formatNumber(report.verifiedVendors)}</strong>
                  </div>
                  <div>
                    <span>Customer IDs submitted</span>
                    <strong>{formatNumber(report.submittedCustomerIds)}</strong>
                  </div>
                </div>
              </section>
              )}

              {/* 06 Orders */}
              {visibleSections.orders && (
              <section className={`${styles.reportSection} ${styles.printSection}`}>
                <div className={styles.sectionHeading}>
                  <div>
                    <span>06</span>
                    <div>
                      <h2>Order performance</h2>
                      <p>Operational results for the selected period.</p>
                    </div>
                  </div>
                  <ShoppingBag size={22} />
                </div>
                <div className={styles.compactStats}>
                  <div>
                    <span>Completed / delivered</span>
                    <strong>{formatNumber(report.completedOrders.length)}</strong>
                  </div>
                  <div>
                    <span>Pending</span>
                    <strong>{formatNumber(report.pendingOrders.length)}</strong>
                  </div>
                  <div>
                    <span>In progress</span>
                    <strong>{formatNumber(report.inProgressOrders.length)}</strong>
                  </div>
                  <div>
                    <span>Cancelled / failed</span>
                    <strong>{formatNumber(report.cancelledOrders.length)}</strong>
                  </div>
                  <div>
                    <span>Completion rate</span>
                    <strong>{completionRate}%</strong>
                  </div>
                  <div>
                    <span>Average completed order</span>
                    <strong>
                      {formatMoney(report.averageCompletedOrder, {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                      })}
                    </strong>
                  </div>
                </div>
                <div className={styles.marketplaceValueNote}>
                  <strong>Note on sales value</strong>
                  <p>
                    Figures are gross order totals from completed/delivered orders. They do not
                    represent vendor net income, fees, or LGU collections.
                  </p>
                </div>
              </section>
              )}

              {/* 07 Coverage & cases */}
              {visibleSections.coverage && (
              <section className={`${styles.reportSection} ${styles.printSection}`}>
                <div className={styles.sectionHeading}>
                  <div>
                    <span>07</span>
                    <div>
                      <h2>Coverage &amp; cases</h2>
                      <p>Barangay vendor coverage and safety/report cases in period.</p>
                    </div>
                  </div>
                  <ClipboardList size={22} />
                </div>
                <div className={styles.twoColumn}>
                  <div className={styles.tableBlock}>
                    <div className={styles.tableTitle}>
                      <h3>Vendor coverage by barangay</h3>
                      <p>Approved vendors with barangay on record.</p>
                    </div>
                    <div className={styles.tableWrap}>
                      <table className={styles.reportTable}>
                        <thead>
                          <tr>
                            <th>Barangay</th>
                            <th>Vendors</th>
                          </tr>
                        </thead>
                        <tbody>
                          {report.barangayRows.length === 0 ? (
                            <tr>
                              <td colSpan={2} className={styles.emptyCell}>
                                No barangay information.
                              </td>
                            </tr>
                          ) : (
                            report.barangayRows.map((item) => (
                              <tr key={item.barangay}>
                                <td>
                                  <MapPin size={14} /> {item.barangay}
                                </td>
                                <td>{formatNumber(item.count)}</td>
                              </tr>
                            ))
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                  <div className={styles.tableBlock}>
                    <div className={styles.tableTitle}>
                      <h3>Cases in period</h3>
                      <p>Open vs resolved safety/user reports.</p>
                    </div>
                    <div className={styles.compactStats} style={{ margin: "12px" }}>
                      <div>
                        <span>Open</span>
                        <strong>{formatNumber(report.caseStatusCounts.open)}</strong>
                      </div>
                      <div>
                        <span>Resolved</span>
                        <strong>{formatNumber(report.caseStatusCounts.resolved)}</strong>
                      </div>
                      <div>
                        <span>Total in period</span>
                        <strong>{formatNumber(report.periodCases.length)}</strong>
                      </div>
                    </div>
                    {report.caseCategories.length > 0 && (
                      <div className={styles.categoryRow}>
                        {report.caseCategories.map((c) => (
                          <span key={c.category}>
                            {c.category}: {formatNumber(c.count)}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </section>
              )}

              <footer className={styles.disclaimer}>
                <AlertTriangle size={18} />
                <p>
                  This report is generated from live IsdaGo system data for administrative and
                  livelihood-support use. Treat assistance indicators as coaching signals, not
                  formal sanctions. Always verify sensitive decisions against primary records.
                </p>
              </footer>
            </>
          )}
        </article>
      </div>
    </DashboardShell>
  );
}
