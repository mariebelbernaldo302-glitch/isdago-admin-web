"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import type { ComponentType } from "react";
import {
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  Bell,
  CheckCircle2,
  Fish,
  HandHelping,
  Minus,
  Package,
  Plus,
  RotateCcw,
  Search,
  Store,
  TrendingUp,
  Wallet,
} from "lucide-react";

import { DashboardShell } from "../components/DashboardShell";
import {
  formatDate,
  formatDateTime,
  formatMoney,
  formatNumber,
  normalizeStatus,
  toDate,
  toNumber,
} from "../lib/format";
import {
  COMPLIANCE_HOURS,
  deleteMarketPrice,
  enforceExpiredComplianceCases,
  findMarketPrice,
  isOverMarket,
  issuePriceNotice,
  type MarketPrice,
  type PriceComplianceCase,
  reenableProduct,
  replyToVendorAboutPrice,
  saveMarketPrice,
  type ComplianceMessage,
} from "../lib/priceCompliance";
import type {
  Order,
  OrderItem,
  Product,
  TimestampValue,
  Vendor,
} from "../lib/types";
import { useRealtimeCollection } from "../lib/useFirestoreCollection";
import styles from "./page.module.css";

/* ─── Types ─────────────────────────────────────────────────────────────── */

type DatePreset = "today" | "this-week" | "this-month" | "last-30" | "all" | "custom";

type DateRange = {
  start: number | null;
  end: number | null;
};

type ActiveTab = "income" | "prices" | "help" | "compliance";

type VendorIncomeRow = {
  id: string;
  name: string;
  barangay: string;
  sales: number;
  prevSales: number;
  orders: number;
  cancelled: number;
  listings: number;
  avgOrder: number;
  trend: "up" | "down" | "flat";
  trendPct: number;
};

type PriceRow = {
  id: string;
  name: string;
  category: string;
  vendorId: string;
  vendorName: string;
  price: number;
  marketAvg: number;
  /** DTI / admin reference price when set; otherwise same as marketAvg */
  referencePrice: number;
  hasReference: boolean;
  diffPct: number;
  stock: number;
  unit: string;
  image: string | null;
  flag: "high" | "low" | "ok";
  /** True when vendor price is above DTI reference market price */
  overMarket: boolean;
  pendingCaseId?: string;
};

type HelpRow = {
  id: string;
  name: string;
  barangay: string;
  sales: number;
  orders: number;
  listings: number;
  cancelled: number;
  reasons: string[];
  tips: string[];
  severity: "high" | "medium" | "low";
};

/* ─── Constants ─────────────────────────────────────────────────────────── */

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

const PRESETS: { key: DatePreset; label: string }[] = [
  { key: "today", label: "Today" },
  { key: "this-week", label: "This week" },
  { key: "this-month", label: "This month" },
  { key: "last-30", label: "Last 30 days" },
  { key: "all", label: "All time" },
  { key: "custom", label: "Custom" },
];

/* ─── Helpers (aligned with system-reports + vendor app) ────────────────── */

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

function orderAmount(order: Order) {
  const top = toNumber(
    order.totalAmount ?? order.grandTotal ?? order.total ?? order.amount,
    0,
  );
  if (top > 0) return top;

  // Fallback: sum line items when order total was not written
  const items = order.items;
  if (!items) return 0;
  const list = Array.isArray(items) ? items : Object.values(items);
  return list.reduce((sum, item) => {
    const qty = toNumber(item.quantity, 0);
    const price = toNumber(item.price, 0);
    const sub = toNumber(item.subtotal, qty * price);
    return sum + (sub > 0 ? sub : qty * price);
  }, 0);
}

function orderStatus(order: Order) {
  const topLevel = normalizeStatus(order.status || "pending");
  const vendorId = order.vendorId?.trim();
  const vendorStatuses = order.vendorStatuses;

  if (vendorStatuses && typeof vendorStatuses === "object") {
    if (vendorId && vendorStatuses[vendorId]?.status) {
      return normalizeStatus(vendorStatuses[vendorId].status);
    }
    for (const entry of Object.values(vendorStatuses)) {
      const s = normalizeStatus(entry?.status);
      if (s && s !== "pending" && s !== "unknown") return s;
    }
  }
  return topLevel;
}

function isSuccessfulOrder(order: Order) {
  const status = orderStatus(order);
  if (SUCCESS_ORDER_STATUSES.has(status)) return true;
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

function safeName(value?: string | null, fallback = "Not provided") {
  return value?.trim() || fallback;
}

function getVendorDisplayName(vendor: Vendor) {
  return safeName(
    vendor.businessName || vendor.storeName || vendor.vendorName || vendor.name,
    "Unnamed vendor",
  );
}

/**
 * Registration saves business location under `address`.
 * Approval may also copy barangay / location / city.
 * Prefer barangay when present; otherwise fall back so the column is not empty.
 */
function getVendorBarangay(vendor: Vendor) {
  const barangay = vendor.barangay?.trim();
  if (barangay) return barangay;

  const location = vendor.location?.trim();
  if (location) return location;

  const address = vendor.address?.trim();
  if (address) return address;

  const city = vendor.city?.trim();
  if (city) return city;

  const province = (vendor as Vendor & { province?: string }).province?.trim();
  if (province) return province;

  return "Not provided";
}

function getProductDisplayName(product: Product) {
  return safeName(product.name || product.productName, "Unnamed seafood");
}

function isApprovedVendor(vendor: Vendor) {
  const status = normalizeStatus(vendor.status || "active");
  const applicationStatus = normalizeStatus(vendor.applicationStatus || "approved");
  return (
    !["disabled", "rejected", "blocked", "suspended"].includes(status) &&
    applicationStatus !== "rejected" &&
    applicationStatus !== "pending"
  );
}

/** All possible keys a vendor may appear under in orders/products. */
function vendorIdentityKeys(vendor: Vendor): string[] {
  const keys = new Set<string>();
  const push = (v?: string | null) => {
    const t = (v || "").trim();
    if (t) keys.add(t);
  };
  push(vendor.uid);
  push(vendor.id);
  return [...keys];
}

/** Sum map values for any of the vendor's identity keys. */
function mapGetForVendor(map: Map<string, number>, vendor: Vendor): number {
  let total = 0;
  for (const key of vendorIdentityKeys(vendor)) {
    total += map.get(key) || 0;
  }
  return total;
}

function primaryVendorId(vendor: Vendor): string {
  return (vendor.uid || vendor.id || "").trim();
}

function startOfDay(d: Date) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x.getTime();
}

function endOfDay(d: Date) {
  const x = new Date(d);
  x.setHours(23, 59, 59, 999);
  return x.getTime();
}

function resolveRange(
  preset: DatePreset,
  customStart: string,
  customEnd: string,
): DateRange {
  const now = new Date();
  if (preset === "all") return { start: null, end: null };
  if (preset === "custom") {
    const s = customStart ? startOfDay(new Date(customStart)) : null;
    const e = customEnd ? endOfDay(new Date(customEnd)) : null;
    return { start: s, end: e };
  }
  if (preset === "today") {
    return { start: startOfDay(now), end: endOfDay(now) };
  }
  if (preset === "this-week") {
    const day = now.getDay();
    const diff = day === 0 ? 6 : day - 1;
    const monday = new Date(now);
    monday.setDate(now.getDate() - diff);
    return { start: startOfDay(monday), end: endOfDay(now) };
  }
  if (preset === "this-month") {
    const first = new Date(now.getFullYear(), now.getMonth(), 1);
    return { start: startOfDay(first), end: endOfDay(now) };
  }
  // last-30
  const past = new Date(now);
  past.setDate(now.getDate() - 29);
  return { start: startOfDay(past), end: endOfDay(now) };
}

/** Previous period of equal length for trend comparison */
function previousRange(range: DateRange): DateRange {
  if (range.start === null || range.end === null) return { start: null, end: null };
  const length = range.end - range.start;
  return {
    start: range.start - length - 1,
    end: range.start - 1,
  };
}

function productImage(product: Product): string | null {
  const raw = product.imageUrl || product.image || product.imageBase64 || "";
  if (!raw) return null;
  if (raw.startsWith("http") || raw.startsWith("data:")) return raw;
  return `data:image/jpeg;base64,${raw}`;
}

/* ─── Small UI bits ─────────────────────────────────────────────────────── */

function Metric({
  label,
  value,
  note,
  icon: Icon,
  tone = "default",
}: {
  label: string;
  value: string;
  note: string;
  icon: ComponentType<{ size?: number; strokeWidth?: number }>;
  tone?: "default" | "good" | "warn" | "danger";
}) {
  return (
    <article className={`${styles.metric} ${styles[`tone_${tone}`]}`}>
      <div className={styles.metricIcon}>
        <Icon size={20} strokeWidth={2} />
      </div>
      <div>
        <span className={styles.metricLabel}>{label}</span>
        <strong className={styles.metricValue}>{value}</strong>
        <p className={styles.metricNote}>{note}</p>
      </div>
    </article>
  );
}

function TrendBadge({ trend, pct }: { trend: "up" | "down" | "flat"; pct: number }) {
  if (trend === "up") {
    return (
      <span className={`${styles.trend} ${styles.trendUp}`}>
        <ArrowUpRight size={14} /> {pct > 0 ? `+${pct}%` : "Up"}
      </span>
    );
  }
  if (trend === "down") {
    return (
      <span className={`${styles.trend} ${styles.trendDown}`}>
        <ArrowDownRight size={14} /> {pct > 0 ? `-${pct}%` : "Down"}
      </span>
    );
  }
  return (
    <span className={`${styles.trend} ${styles.trendFlat}`}>
      <Minus size={14} /> Flat
    </span>
  );
}

function PriceFlag({ flag }: { flag: "high" | "low" | "ok" }) {
  if (flag === "high") return <span className={`${styles.flag} ${styles.flagHigh}`}>Above market</span>;
  if (flag === "low") return <span className={`${styles.flag} ${styles.flagLow}`}>Below market</span>;
  return <span className={`${styles.flag} ${styles.flagOk}`}>Near average</span>;
}

function SeverityBadge({ severity }: { severity: "high" | "medium" | "low" }) {
  return (
    <span className={`${styles.severity} ${styles[`sev_${severity}`]}`}>
      {severity === "high" ? "Needs attention" : severity === "medium" ? "Watch" : "Mild"}
    </span>
  );
}

/* ─── Main page ─────────────────────────────────────────────────────────── */

export default function VendorSalesMonitorPage() {
  const [preset, setPreset] = useState<DatePreset>("all");
  const [customStart, setCustomStart] = useState("");
  const [customEnd, setCustomEnd] = useState("");
  const [tab, setTab] = useState<ActiveTab>("income");
  const [search, setSearch] = useState("");
  const [selectedVendorId, setSelectedVendorId] = useState<string | null>(null);

  // Market price form
  const [mpName, setMpName] = useState("");
  const [mpPrice, setMpPrice] = useState("");
  const [mpUnit, setMpUnit] = useState("kg");
  const [mpBusy, setMpBusy] = useState(false);
  const [mpMessage, setMpMessage] = useState("");
  const [actionBusy, setActionBusy] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState("");
  const [enforceNote, setEnforceNote] = useState("");
  const [replyDraft, setReplyDraft] = useState<Record<string, string>>({});
  const [messagesCaseId, setMessagesCaseId] = useState<string | null>(null);
  const [openFolders, setOpenFolders] = useState<Record<string, boolean>>({
    market: true,
    board: true,
    queue: true,
    messages: false,
  });
  const toggleFolder = (key: string) =>
    setOpenFolders((prev) => ({ ...prev, [key]: !prev[key] }));

  const vendorsQuery = useRealtimeCollection<Vendor>("vendors", "createdAt");
  const ordersQuery = useRealtimeCollection<Order>("orders", "createdAt");
  const productsQuery = useRealtimeCollection<Product>("products", "createdAt");
  // Secondary data — never block the whole page
  const marketPricesQuery = useRealtimeCollection<MarketPrice>("market_prices", null);
  const complianceQuery = useRealtimeCollection<PriceComplianceCase>(
    "price_compliance",
    null,
    { enabled: tab === "compliance" || tab === "prices" },
  );
  const complianceMessagesQuery = useRealtimeCollection<ComplianceMessage>(
    "price_compliance_messages",
    null,
    { enabled: tab === "compliance" },
  );

  // Only core sales data gates the main content (much faster)
  const coreLoading =
    vendorsQuery.loading || ordersQuery.loading || productsQuery.loading;
  const secondaryLoading =
    marketPricesQuery.loading ||
    complianceQuery.loading ||
    complianceMessagesQuery.loading;

  const range = useMemo(
    () => resolveRange(preset, customStart, customEnd),
    [preset, customStart, customEnd],
  );
  const prevRange = useMemo(() => previousRange(range), [range]);

  const vendors = vendorsQuery.data;
  const orders = ordersQuery.data;
  const products = productsQuery.data;
  const marketPrices = marketPricesQuery.data;
  const complianceCases = complianceQuery.data;
  const complianceMessages = complianceMessagesQuery.data;

  const report = useMemo(() => {
    const approvedVendors = vendors.filter(isApprovedVendor);

    const periodOrders = orders.filter((o) => isTimeWithinRange(orderTime(o), range));
    const completedOrders = periodOrders.filter(isSuccessfulOrder);
    const cancelledOrders = periodOrders.filter(isCancelledOrder);

    const prevOrders = orders.filter((o) => isTimeWithinRange(orderTime(o), prevRange));
    const prevCompleted = prevOrders.filter(isSuccessfulOrder);

    const vendorSalesMap = new Map<string, number>();
    const vendorPrevSalesMap = new Map<string, number>();
    const vendorOrderCounts = new Map<string, number>();
    const vendorCancelledCounts = new Map<string, number>();
    const vendorProductCounts = new Map<string, number>();

    completedOrders.forEach((order) => {
      const vid = order.vendorId?.trim();
      if (!vid) return;
      vendorSalesMap.set(vid, (vendorSalesMap.get(vid) || 0) + orderAmount(order));
      vendorOrderCounts.set(vid, (vendorOrderCounts.get(vid) || 0) + 1);
    });

    prevCompleted.forEach((order) => {
      const vid = order.vendorId?.trim();
      if (!vid) return;
      vendorPrevSalesMap.set(vid, (vendorPrevSalesMap.get(vid) || 0) + orderAmount(order));
    });

    cancelledOrders.forEach((order) => {
      const vid = order.vendorId?.trim();
      if (vid) vendorCancelledCounts.set(vid, (vendorCancelledCounts.get(vid) || 0) + 1);
    });

    const activeProducts = products.filter((p) => {
      const st = normalizeStatus(p.status || p.availability || "active");
      return !["inactive", "rejected", "disabled", "out of stock"].includes(st);
    });

    activeProducts.forEach((p) => {
      const vid = p.vendorId?.trim();
      if (vid) vendorProductCounts.set(vid, (vendorProductCounts.get(vid) || 0) + 1);
    });

    const totalIncome = completedOrders.reduce((s, o) => s + orderAmount(o), 0);

    // Income rows — show EVERY approved vendor (not only those with activity)
    const incomeRows: VendorIncomeRow[] = approvedVendors
      .map((vendor) => {
        const id = primaryVendorId(vendor);
        const sales = mapGetForVendor(vendorSalesMap, vendor);
        const prevSales = mapGetForVendor(vendorPrevSalesMap, vendor);
        const ordersCount = mapGetForVendor(vendorOrderCounts, vendor);
        const cancelled = mapGetForVendor(vendorCancelledCounts, vendor);
        const listings = mapGetForVendor(vendorProductCounts, vendor);
        let trend: "up" | "down" | "flat" = "flat";
        let trendPct = 0;
        if (prevSales > 0) {
          const change = ((sales - prevSales) / prevSales) * 100;
          trendPct = Math.round(Math.abs(change));
          if (change > 5) trend = "up";
          else if (change < -5) trend = "down";
        } else if (sales > 0) {
          trend = "up";
          trendPct = 100;
        }
        return {
          id,
          name: getVendorDisplayName(vendor),
          barangay: getVendorBarangay(vendor),
          sales,
          prevSales,
          orders: ordersCount,
          cancelled,
          listings,
          avgOrder: ordersCount > 0 ? sales / ordersCount : 0,
          trend,
          trendPct,
        };
      })
      .sort(
        (a, b) =>
          b.sales - a.sales ||
          b.orders - a.orders ||
          b.listings - a.listings ||
          a.name.localeCompare(b.name),
      );

    const vendorsWithSalesCount = incomeRows.filter((r) => r.sales > 0).length;

    // Market average by product name (normalized)
    const priceByName = new Map<string, number[]>();
    activeProducts.forEach((p) => {
      const name = getProductDisplayName(p).toLowerCase();
      const price = toNumber(p.price, 0);
      if (price <= 0) return;
      const list = priceByName.get(name) || [];
      list.push(price);
      priceByName.set(name, list);
    });
    const marketAvgMap = new Map<string, number>();
    priceByName.forEach((prices, name) => {
      const avg = prices.reduce((a, b) => a + b, 0) / prices.length;
      marketAvgMap.set(name, avg);
    });

    const pendingByProduct = new Map<string, string>();
    complianceCases.forEach((c) => {
      if (c.status === "pending" && c.productId) {
        pendingByProduct.set(c.productId, c.id);
      }
    });

    const priceRows: PriceRow[] = activeProducts
      .map((p) => {
        const name = getProductDisplayName(p);
        const key = name.toLowerCase();
        const price = toNumber(p.price, 0);
        const liveAvg = marketAvgMap.get(key) || price;
        const ref = findMarketPrice(marketPrices, name);
        const referencePrice = ref ? toNumber(ref.price, liveAvg) : liveAvg;
        const hasReference = Boolean(ref);
        const diffPct =
          referencePrice > 0
            ? Math.round(((price - referencePrice) / referencePrice) * 100)
            : 0;
        let flag: "high" | "low" | "ok" = "ok";
        if (hasReference) {
          if (price > referencePrice) flag = "high";
          else if (diffPct <= -15) flag = "low";
        } else {
          if (diffPct >= 15) flag = "high";
          else if (diffPct <= -15) flag = "low";
        }
        const vid = p.vendorId?.trim() || "";
        const vendor = vendors.find((v) => (v.uid || v.id) === vid || v.id === vid);
        return {
          id: p.id,
          name,
          category: safeName(p.category, "Seafood"),
          vendorId: vid,
          vendorName: vendor ? getVendorDisplayName(vendor) : safeName(p.vendorName, "Unknown"),
          price,
          marketAvg: liveAvg,
          referencePrice,
          hasReference,
          diffPct,
          stock: toNumber(p.stock, 0),
          unit: safeName(ref?.unit || p.unit, "kg"),
          image: productImage(p),
          flag,
          overMarket: hasReference && isOverMarket(price, referencePrice),
          pendingCaseId: pendingByProduct.get(p.id),
        };
      })
      .filter((r) => r.price > 0)
      .sort((a, b) => Number(b.overMarket) - Number(a.overMarket) || b.price - a.price);

    // Help / assistance rows
    const helpRows: HelpRow[] = approvedVendors
      .map((vendor) => {
        const id = primaryVendorId(vendor);
        const sales = mapGetForVendor(vendorSalesMap, vendor);
        const ordersCount = mapGetForVendor(vendorOrderCounts, vendor);
        const cancelled = mapGetForVendor(vendorCancelledCounts, vendor);
        const listings = mapGetForVendor(vendorProductCounts, vendor);
        const prevSales = mapGetForVendor(vendorPrevSalesMap, vendor);
        const vendorKeySet = new Set(vendorIdentityKeys(vendor));
        const reasons: string[] = [];
        const tips: string[] = [];

        if (listings === 0) {
          reasons.push("No active listings");
          tips.push("Encourage the vendor to post available catch with clear photos and prices.");
        }
        if (ordersCount === 0 && listings > 0) {
          reasons.push("Listings but zero completed orders this period");
          tips.push("Check if prices are competitive and if the store profile is complete.");
        }
        if (prevSales > 0 && sales < prevSales * 0.6) {
          reasons.push(
            `Sales dropped ${Math.round(((prevSales - sales) / prevSales) * 100)}% vs previous period`,
          );
          tips.push("Review recent cancellations and suggest restocking popular items.");
        }
        if (cancelled >= 2 && ordersCount > 0 && cancelled / (ordersCount + cancelled) >= 0.3) {
          reasons.push("High cancellation rate");
          tips.push("Coach on accepting only orders they can fulfill and updating stock promptly.");
        }
        const vendorListings = priceRows.filter((r) => vendorKeySet.has(r.vendorId));
        const overpriced = vendorListings.filter((r) => r.flag === "high");
        if (overpriced.length >= 2) {
          reasons.push(`${overpriced.length} listings priced well above market average`);
          tips.push("Suggest adjusting prices closer to market average for faster sales.");
        }
        const lowStock = vendorListings.filter((r) => r.stock > 0 && r.stock <= 5).length;
        if (lowStock > 0 && ordersCount > 0) {
          reasons.push(`${lowStock} low-stock listing(s)`);
          tips.push("Remind vendor to restock popular fish before peak demand days.");
        }
        if (sales > 0 && sales < 500 && ordersCount <= 2 && listings > 0) {
          reasons.push("Very low income this period");
          tips.push("Help with product photos, clearer descriptions, and barangay promotion.");
        }

        let severity: "high" | "medium" | "low" = "low";
        if (reasons.length >= 3 || reasons.some((r) => r.includes("dropped") || r.includes("zero"))) {
          severity = "high";
        } else if (reasons.length >= 2) {
          severity = "medium";
        }

        return {
          id,
          name: getVendorDisplayName(vendor),
          barangay: getVendorBarangay(vendor),
          sales,
          orders: ordersCount,
          listings,
          cancelled,
          reasons,
          tips: [...new Set(tips)],
          severity,
        };
      })
      .filter((r) => r.reasons.length > 0)
      .sort((a, b) => {
        const rank = { high: 3, medium: 2, low: 1 };
        return rank[b.severity] - rank[a.severity] || b.reasons.length - a.reasons.length;
      });

    const avgIncome =
      vendorsWithSalesCount > 0 ? totalIncome / vendorsWithSalesCount : 0;

    return {
      totalIncome,
      completedCount: completedOrders.length,
      cancelledCount: cancelledOrders.length,
      vendorsWithSales: vendorsWithSalesCount,
      approvedCount: approvedVendors.length,
      avgIncome,
      incomeRows,
      priceRows,
      helpRows,
      helpHigh: helpRows.filter((r) => r.severity === "high").length,
    };
  }, [vendors, orders, products, range, prevRange, marketPrices, complianceCases]);

  const q = search.trim().toLowerCase();

  const filteredIncome = useMemo(() => {
    if (!q) return report.incomeRows;
    return report.incomeRows.filter(
      (r) =>
        r.name.toLowerCase().includes(q) ||
        r.barangay.toLowerCase().includes(q) ||
        r.id.toLowerCase().includes(q),
    );
  }, [report.incomeRows, q]);

  const filteredPrices = useMemo(() => {
    if (!q) return report.priceRows;
    return report.priceRows.filter(
      (r) =>
        r.name.toLowerCase().includes(q) ||
        r.vendorName.toLowerCase().includes(q) ||
        r.category.toLowerCase().includes(q),
    );
  }, [report.priceRows, q]);

  const filteredHelp = useMemo(() => {
    if (!q) return report.helpRows;
    return report.helpRows.filter(
      (r) =>
        r.name.toLowerCase().includes(q) ||
        r.barangay.toLowerCase().includes(q),
    );
  }, [report.helpRows, q]);

  const selectedVendor = useMemo(() => {
    if (!selectedVendorId) return null;
    const fromIncome = report.incomeRows.find((r) => r.id === selectedVendorId);
    if (fromIncome) return fromIncome;
    const fromHelp = report.helpRows.find((r) => r.id === selectedVendorId);
    if (fromHelp) return fromHelp;
    // Fallback when selected from price board only (listings, no sales yet)
    const vendor = vendors.find(
      (v) => (v.uid || v.id).trim() === selectedVendorId || v.id === selectedVendorId,
    );
    if (!vendor) return null;
    return {
      id: selectedVendorId,
      name: getVendorDisplayName(vendor),
      barangay: getVendorBarangay(vendor),
      sales: 0,
      orders: 0,
      listings: report.priceRows.filter((r) => r.vendorId === selectedVendorId).length,
      cancelled: 0,
      prevSales: 0,
      avgOrder: 0,
      trend: "flat" as const,
      trendPct: 0,
    };
  }, [selectedVendorId, report.incomeRows, report.helpRows, report.priceRows, vendors]);

  const selectedVendorPrices = useMemo(() => {
    if (!selectedVendorId) return [];
    return report.priceRows.filter((r) => r.vendorId === selectedVendorId);
  }, [selectedVendorId, report.priceRows]);

  const selectedHelp = useMemo(() => {
    if (!selectedVendorId) return null;
    return report.helpRows.find((r) => r.id === selectedVendorId) || null;
  }, [selectedVendorId, report.helpRows]);

  // Auto-enforce expired 24h notices when this page loads / data updates
  useEffect(() => {
    if (coreLoading) return;
    let cancelled = false;
    (async () => {
      try {
        const result = await enforceExpiredComplianceCases(marketPrices);
        if (cancelled) return;
        if (result.disabled > 0 || result.complied > 0) {
          setEnforceNote(
            `Enforced: ${result.disabled} listing(s) disabled, ${result.complied} marked complied.`,
          );
        }
      } catch {
        // non-fatal
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [coreLoading, marketPrices, complianceCases.length]);

  const complianceSorted = useMemo(() => {
    return [...complianceCases].sort((a, b) => {
      const rank: Record<string, number> = {
        pending: 0,
        expired: 1,
        complied: 2,
        reenabled: 3,
      };
      return (rank[a.status] ?? 9) - (rank[b.status] ?? 9) || (b.createdAt || 0) - (a.createdAt || 0);
    });
  }, [complianceCases]);

  async function handleSaveMarketPrice() {
    setMpBusy(true);
    setMpMessage("");
    try {
      await saveMarketPrice({
        name: mpName,
        price: Number(mpPrice),
        unit: mpUnit,
      });
      setMpName("");
      setMpPrice("");
      setMpMessage("Market price saved.");
    } catch (e) {
      setMpMessage(e instanceof Error ? e.message : "Failed to save market price.");
    } finally {
      setMpBusy(false);
    }
  }

  async function handleDeleteMarketPrice(id: string) {
    setMpBusy(true);
    setMpMessage("");
    try {
      await deleteMarketPrice(id);
      setMpMessage("Market price removed.");
    } catch (e) {
      setMpMessage(e instanceof Error ? e.message : "Failed to delete.");
    } finally {
      setMpBusy(false);
    }
  }

  async function handleIssueNotice(row: PriceRow) {
    setActionBusy(row.id);
    setActionMessage("");
    try {
      await issuePriceNotice({
        productId: row.id,
        productName: row.name,
        vendorId: row.vendorId,
        vendorName: row.vendorName,
        vendorPrice: row.price,
        marketPrice: row.referencePrice,
        unit: row.unit,
      });
      setActionMessage(`1-day notice sent to ${row.vendorName} for ${row.name}.`);
      setTab("compliance");
    } catch (e) {
      setActionMessage(e instanceof Error ? e.message : "Failed to issue notice.");
    } finally {
      setActionBusy(null);
    }
  }

  async function handleReenable(c: PriceComplianceCase) {
    setActionBusy(c.id);
    setActionMessage("");
    try {
      const market =
        findMarketPrice(marketPrices, c.productName)?.price ?? c.marketPrice;
      await reenableProduct({
        caseId: c.id,
        productId: c.productId,
        vendorId: c.vendorId,
        vendorName: c.vendorName,
        productName: c.productName,
        requireCompliantPrice: true,
        marketPrice: market,
      });
      setActionMessage(`Re-enabled ${c.productName}.`);
    } catch (e) {
      setActionMessage(e instanceof Error ? e.message : "Failed to re-enable.");
    } finally {
      setActionBusy(null);
    }
  }

  async function handleReenableOverride(c: PriceComplianceCase) {
    setActionBusy(c.id);
    setActionMessage("");
    try {
      await reenableProduct({
        caseId: c.id,
        productId: c.productId,
        vendorId: c.vendorId,
        vendorName: c.vendorName,
        productName: c.productName,
        requireCompliantPrice: false,
      });
      setActionMessage(`Re-enabled ${c.productName} (admin override).`);
    } catch (e) {
      setActionMessage(e instanceof Error ? e.message : "Failed to re-enable.");
    } finally {
      setActionBusy(null);
    }
  }


  async function handleReplyVendor(c: PriceComplianceCase) {
    const body = (replyDraft[c.id] || "").trim();
    if (!body) {
      setActionMessage("Enter a reply message first.");
      return;
    }
    setActionBusy(`reply-${c.id}`);
    setActionMessage("");
    try {
      await replyToVendorAboutPrice({
        caseId: c.id,
        vendorId: c.vendorId,
        vendorName: c.vendorName,
        productName: c.productName,
        productId: c.productId,
        message: body,
      });
      setReplyDraft((prev) => ({ ...prev, [c.id]: "" }));
      setActionMessage(`Reply sent to ${c.vendorName}.`);
    } catch (e) {
      setActionMessage(e instanceof Error ? e.message : "Failed to send reply.");
    } finally {
      setActionBusy(null);
    }
  }


  return (
    <DashboardShell
      title="Vendor Sales Monitor"
      description="Live view of vendor income, fish prices, and livelihood support tips — separate from the Whole-System Report."
    >
      <div className={styles.page}>
        {/* Controls */}
        <div className={styles.controls}>
          <div className={styles.controlIntro}>
            <div className={styles.controlIcon}>
              <Wallet size={22} />
            </div>
            <div>
              <h2>Monitor vendor sales &amp; prices</h2>
              <p>
                Track income per vendor, compare fish prices to market average, and see who may need
                help. This is an operational tool — use Whole-System Report for formal printouts.
              </p>
            </div>
          </div>

          <div className={styles.filters}>
            <label>
              <span>Period</span>
              <select
                value={preset}
                onChange={(e) => setPreset(e.target.value as DatePreset)}
              >
                {PRESETS.map((p) => (
                  <option key={p.key} value={p.key}>
                    {p.label}
                  </option>
                ))}
              </select>
            </label>
            {preset === "custom" && (
              <>
                <label>
                  <span>From</span>
                  <input
                    type="date"
                    value={customStart}
                    onChange={(e) => setCustomStart(e.target.value)}
                  />
                </label>
                <label>
                  <span>To</span>
                  <input
                    type="date"
                    value={customEnd}
                    onChange={(e) => setCustomEnd(e.target.value)}
                  />
                </label>
              </>
            )}
            <label className={styles.searchLabel}>
              <span>Search</span>
              <div className={styles.searchBox}>
                <Search size={16} />
                <input
                  type="search"
                  placeholder="Vendor, barangay, fish…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
            </label>
          </div>
        </div>

        {/* Metrics */}
        {coreLoading ? (
          <div className={styles.loading}>
            <span className={styles.spinner} />
            Loading sales data…
          </div>
        ) : (
          <>
            <div className={styles.metricGrid}>
              <Metric
                label="Total vendor income"
                value={formatMoney(report.totalIncome, {
                  minimumFractionDigits: 0,
                  maximumFractionDigits: 0,
                })}
                note={`${formatNumber(report.completedCount)} completed orders`}
                icon={Wallet}
                tone="good"
              />
              <Metric
                label="Vendors with sales"
                value={formatNumber(report.vendorsWithSales)}
                note={`of ${formatNumber(report.approvedCount)} approved vendors`}
                icon={Store}
              />
              <Metric
                label="Avg income / vendor"
                value={formatMoney(report.avgIncome, {
                  minimumFractionDigits: 0,
                  maximumFractionDigits: 0,
                })}
                note="Among vendors with at least one sale"
                icon={TrendingUp}
              />
              <Metric
                label="Need attention"
                value={formatNumber(report.helpHigh)}
                note={`${formatNumber(report.helpRows.length)} total with indicators`}
                icon={HandHelping}
                tone={report.helpHigh > 0 ? "warn" : "default"}
              />
            </div>

            {/* Tabs */}
            {(actionMessage || enforceNote) && (
              <div className={styles.actionBanner}>
                {actionMessage || enforceNote}
              </div>
            )}

            <div className={styles.tabs}>
              <button
                type="button"
                className={tab === "income" ? styles.tabActive : styles.tab}
                onClick={() => setTab("income")}
              >
                <Wallet size={16} /> Vendor income
              </button>
              <button
                type="button"
                className={tab === "prices" ? styles.tabActive : styles.tab}
                onClick={() => setTab("prices")}
              >
                <Fish size={16} /> Fish prices
              </button>
              <button
                type="button"
                className={tab === "compliance" ? styles.tabActive : styles.tab}
                onClick={() => setTab("compliance")}
              >
                <Bell size={16} /> Price compliance
                {complianceSorted.filter((c) => c.status === "pending" || c.status === "expired").length > 0 && (
                  <span className={styles.tabCount}>
                    {complianceSorted.filter((c) => c.status === "pending" || c.status === "expired").length}
                  </span>
                )}
              </button>
              <button
                type="button"
                className={tab === "help" ? styles.tabActive : styles.tab}
                onClick={() => setTab("help")}
              >
                <HandHelping size={16} /> How to help them
              </button>
            </div>

            <div className={styles.mainGrid}>
              <div className={styles.mainCol}>
                {/* ── Income tab ── */}
                {tab === "income" && (
                  <section className={styles.panel}>
                    <header className={styles.panelHead}>
                      <div>
                        <h3>Vendor income ranking</h3>
                        <p>
                          All approved vendors for the selected period. Income is from completed
                          orders only. Trend compares to the previous equal-length period. Click a
                          row for detail.
                        </p>
                      </div>
                      <span className={styles.countBadge}>
                        {formatNumber(filteredIncome.length)} of{" "}
                        {formatNumber(report.approvedCount)} vendors
                      </span>
                    </header>
                    <div className={styles.tableWrap}>
                      <table className={styles.table}>
                        <thead>
                          <tr>
                            <th className={styles.colRank}>#</th>
                            <th>Vendor</th>
                            <th>Location</th>
                            <th className={styles.colNum}>Orders</th>
                            <th className={styles.colNum}>Income</th>
                            <th className={styles.colNum}>Avg order</th>
                            <th>Trend</th>
                            <th className={styles.colNum}>Listings</th>
                            <th>Status</th>
                          </tr>
                        </thead>
                        <tbody>
                          {filteredIncome.length === 0 ? (
                            <tr>
                              <td colSpan={9} className={styles.emptyCell}>
                                No approved vendors found.
                              </td>
                            </tr>
                          ) : (
                            filteredIncome.map((row, index) => (
                              <tr
                                key={row.id}
                                className={
                                  selectedVendorId === row.id ? styles.rowSelected : undefined
                                }
                                onClick={() =>
                                  setSelectedVendorId(
                                    selectedVendorId === row.id ? null : row.id,
                                  )
                                }
                              >
                                <td className={styles.colRank}>
                                  <span className={styles.rank}>{index + 1}</span>
                                </td>
                                <td>
                                  <strong className={styles.vendorName}>{row.name}</strong>
                                </td>
                                <td className={styles.mutedCell}>{row.barangay}</td>
                                <td className={styles.colNum}>{formatNumber(row.orders)}</td>
                                <td className={styles.colNum}>
                                  <span
                                    className={
                                      row.sales > 0 ? styles.incomePositive : styles.incomeZero
                                    }
                                  >
                                    {formatMoney(row.sales, {
                                      minimumFractionDigits: 0,
                                      maximumFractionDigits: 0,
                                    })}
                                  </span>
                                </td>
                                <td className={styles.colNum}>
                                  {formatMoney(row.avgOrder, {
                                    minimumFractionDigits: 0,
                                    maximumFractionDigits: 0,
                                  })}
                                </td>
                                <td>
                                  <TrendBadge trend={row.trend} pct={row.trendPct} />
                                </td>
                                <td className={styles.colNum}>{formatNumber(row.listings)}</td>
                                <td>
                                  {row.sales > 0 ? (
                                    <span className={`${styles.statusChip} ${styles.statusActive}`}>
                                      Has sales
                                    </span>
                                  ) : row.listings > 0 ? (
                                    <span className={`${styles.statusChip} ${styles.statusIdle}`}>
                                      Listed, no sales
                                    </span>
                                  ) : (
                                    <span className={`${styles.statusChip} ${styles.statusEmpty}`}>
                                      No activity
                                    </span>
                                  )}
                                </td>
                              </tr>
                            ))
                          )}
                        </tbody>
                      </table>
                    </div>
                  </section>
                )}

                {/* ── Prices tab ── */}
                {tab === "prices" && (
                  <>
                  <section className={styles.folder}>
                    <button
                      type="button"
                      className={styles.folderHead}
                      onClick={() => toggleFolder("market")}
                      aria-expanded={openFolders.market}
                    >
                      <span className={styles.folderIcon}>{openFolders.market ? "📂" : "📁"}</span>
                      <div className={styles.folderTitle}>
                        <strong>1. Market prices (DTI reference)</strong>
                        <small>Set official fish prices — {formatNumber(marketPrices.length)} saved</small>
                      </div>
                      <span className={styles.folderChevron}>{openFolders.market ? "▾" : "▸"}</span>
                    </button>
                    {openFolders.market && (
                    <div className={styles.folderBody}>
                    <div className={styles.marketForm}>
                      <label>
                        <span>Fish name</span>
                        <input
                          type="text"
                          value={mpName}
                          onChange={(e) => setMpName(e.target.value)}
                          placeholder="e.g. Palad/Sole Fish"
                        />
                      </label>
                      <label>
                        <span>Market price (₱)</span>
                        <input
                          type="number"
                          min="0"
                          step="1"
                          value={mpPrice}
                          onChange={(e) => setMpPrice(e.target.value)}
                          placeholder="400"
                        />
                      </label>
                      <label>
                        <span>Unit</span>
                        <input
                          type="text"
                          value={mpUnit}
                          onChange={(e) => setMpUnit(e.target.value)}
                          placeholder="kg"
                        />
                      </label>
                      <button
                        type="button"
                        className={styles.primaryBtn}
                        disabled={mpBusy}
                        onClick={() => void handleSaveMarketPrice()}
                      >
                        <Plus size={14} /> Save market price
                      </button>
                    </div>
                    {mpMessage && <p className={styles.formMsg}>{mpMessage}</p>}
                    <div className={styles.tableWrap}>
                      <table className={styles.table}>
                        <thead>
                          <tr>
                            <th>Fish name</th>
                            <th className={styles.colNum}>Market price</th>
                            <th>Unit</th>
                            <th>Updated</th>
                            <th></th>
                          </tr>
                        </thead>
                        <tbody>
                          {marketPrices.length === 0 ? (
                            <tr>
                              <td colSpan={5} className={styles.emptyCell}>
                                No reference prices yet. Add fish market prices above.
                              </td>
                            </tr>
                          ) : (
                            [...marketPrices]
                              .sort((a, b) => a.name.localeCompare(b.name))
                              .map((m) => (
                                <tr key={m.id}>
                                  <td><strong>{m.name}</strong></td>
                                  <td className={styles.colNum}>
                                    {formatMoney(m.price, { minimumFractionDigits: 0, maximumFractionDigits: 2 })}
                                  </td>
                                  <td>{m.unit || "kg"}</td>
                                  <td className={styles.mutedCell}>
                                    {m.updatedAt ? formatDateTime(m.updatedAt) : "—"}
                                  </td>
                                  <td>
                                    <button
                                      type="button"
                                      className={styles.linkBtn}
                                      disabled={mpBusy}
                                      onClick={() => void handleDeleteMarketPrice(m.id)}
                                    >
                                      Remove
                                    </button>
                                  </td>
                                </tr>
                              ))
                          )}
                        </tbody>
                      </table>
                    </div>
                    </div>
                    )}
                  </section>

                  <section className={styles.folder}>
                    <button
                      type="button"
                      className={styles.folderHead}
                      onClick={() => toggleFolder("board")}
                      aria-expanded={openFolders.board}
                    >
                      <span className={styles.folderIcon}>{openFolders.board ? "📂" : "📁"}</span>
                      <div className={styles.folderTitle}>
                        <strong>2. Live fish listings</strong>
                        <small>
                          Compare vendor price vs market · {formatNumber(filteredPrices.length)} listings
                          {secondaryLoading ? " · updating…" : ""}
                        </small>
                      </div>
                      <span className={styles.folderChevron}>{openFolders.board ? "▾" : "▸"}</span>
                    </button>
                    {openFolders.board && (
                    <div className={styles.folderBody}>
                    <div className={styles.tableWrap}>
                      <table className={styles.table}>
                        <thead>
                          <tr>
                            <th>Product</th>
                            <th>Vendor</th>
                            <th className={styles.colNum}>Price</th>
                            <th className={styles.colNum}>Market ref</th>
                            <th className={styles.colNum}>Diff</th>
                            <th className={styles.colNum}>Stock</th>
                            <th>Flag</th>
                            <th>Action</th>
                          </tr>
                        </thead>
                        <tbody>
                          {filteredPrices.length === 0 ? (
                            <tr>
                              <td colSpan={8} className={styles.emptyCell}>
                                No active fish listings found.
                              </td>
                            </tr>
                          ) : (
                            filteredPrices.map((row) => (
                              <tr key={row.id}>
                                <td>
                                  <div className={styles.productCell}>
                                    {row.image ? (
                                      // eslint-disable-next-line @next/next/no-img-element
                                      <img src={row.image} alt="" className={styles.thumb} />
                                    ) : (
                                      <div className={styles.thumbPlaceholder}>
                                        <Fish size={16} />
                                      </div>
                                    )}
                                    <div>
                                      <strong>{row.name}</strong>
                                      <small>{row.category}</small>
                                    </div>
                                  </div>
                                </td>
                                <td>{row.vendorName}</td>
                                <td className={styles.colNum}>
                                  {formatMoney(row.price, {
                                    minimumFractionDigits: 0,
                                    maximumFractionDigits: 2,
                                  })}
                                  <small> / {row.unit}</small>
                                </td>
                                <td className={styles.colNum}>
                                  {row.hasReference ? (
                                    formatMoney(row.referencePrice, {
                                      minimumFractionDigits: 0,
                                      maximumFractionDigits: 2,
                                    })
                                  ) : (
                                    <span className={styles.mutedCell}>Not set</span>
                                  )}
                                </td>
                                <td className={styles.colNum}>
                                  {row.hasReference ? (
                                    <>
                                      {row.diffPct > 0 ? "+" : ""}
                                      {row.diffPct}%
                                    </>
                                  ) : (
                                    "—"
                                  )}
                                </td>
                                <td className={styles.colNum}>{formatNumber(row.stock)}</td>
                                <td>
                                  {row.overMarket ? (
                                    <span className={`${styles.flag} ${styles.flagHigh}`}>
                                      Over market
                                    </span>
                                  ) : row.hasReference ? (
                                    <span className={`${styles.flag} ${styles.flagOk}`}>
                                      Within market
                                    </span>
                                  ) : (
                                    <PriceFlag flag={row.flag} />
                                  )}
                                </td>
                                <td>
                                  {row.overMarket ? (
                                    row.pendingCaseId ? (
                                      <span className={styles.statusChip + " " + styles.statusIdle}>
                                        Notice pending
                                      </span>
                                    ) : (
                                      <button
                                        type="button"
                                        className={styles.primaryBtn}
                                        disabled={actionBusy === row.id}
                                        onClick={() => void handleIssueNotice(row)}
                                      >
                                        <Bell size={14} /> 1-day notice
                                      </button>
                                    )
                                  ) : (
                                    <span className={styles.mutedCell}>—</span>
                                  )}
                                </td>
                              </tr>
                            ))
                          )}
                        </tbody>
                      </table>
                    </div>
                    </div>
                    )}
                  </section>
                  </>
                )}

                {/* ── Compliance tab ── */}
                {tab === "compliance" && (
                  <>
                  <section className={styles.folder}>
                    <button
                      type="button"
                      className={styles.folderHead}
                      onClick={() => toggleFolder("queue")}
                      aria-expanded={openFolders.queue}
                    >
                      <span className={styles.folderIcon}>{openFolders.queue ? "📂" : "📁"}</span>
                      <div className={styles.folderTitle}>
                        <strong>1. Compliance cases</strong>
                        <small>
                          {COMPLIANCE_HOURS}h notice · auto-disable if not fixed ·{" "}
                          {formatNumber(complianceSorted.length)} cases
                        </small>
                      </div>
                      <span className={styles.folderChevron}>{openFolders.queue ? "▾" : "▸"}</span>
                    </button>
                    {openFolders.queue && (
                    <div className={styles.folderBody}>
                    <div className={styles.tableWrap}>
                      <table className={styles.table}>
                        <thead>
                          <tr>
                            <th>Product</th>
                            <th>Vendor</th>
                            <th className={styles.colNum}>Was</th>
                            <th className={styles.colNum}>Market</th>
                            <th>Deadline</th>
                            <th>Status</th>
                            <th>Action</th>
                          </tr>
                        </thead>
                        <tbody>
                          {complianceSorted.length === 0 ? (
                            <tr>
                              <td colSpan={7} className={styles.emptyCell}>
                                No compliance cases yet. Issue a 1-day notice from Fish prices.
                              </td>
                            </tr>
                          ) : (
                            complianceSorted.map((c) => {
                              const hoursLeft = Math.max(
                                0,
                                Math.ceil((c.deadlineAt - Date.now()) / (60 * 60 * 1000)),
                              );
                              return (
                                <tr key={c.id}>
                                  <td><strong>{c.productName}</strong></td>
                                  <td>{c.vendorName}</td>
                                  <td className={styles.colNum}>
                                    {formatMoney(c.vendorPriceAtNotice, {
                                      minimumFractionDigits: 0,
                                      maximumFractionDigits: 0,
                                    })}
                                  </td>
                                  <td className={styles.colNum}>
                                    {formatMoney(c.marketPrice, {
                                      minimumFractionDigits: 0,
                                      maximumFractionDigits: 0,
                                    })}
                                  </td>
                                  <td className={styles.mutedCell}>
                                    {formatDateTime(c.deadlineAt)}
                                    {c.status === "pending" && (
                                      <div>
                                        <small>
                                          {hoursLeft > 0
                                            ? `${hoursLeft}h left`
                                            : "Deadline passed"}
                                        </small>
                                      </div>
                                    )}
                                  </td>
                                  <td>
                                    {c.status === "pending" && (
                                      <span className={`${styles.statusChip} ${styles.statusIdle}`}>
                                        Pending
                                      </span>
                                    )}
                                    {c.status === "complied" && (
                                      <span className={`${styles.statusChip} ${styles.statusActive}`}>
                                        Complied
                                      </span>
                                    )}
                                    {c.status === "expired" && (
                                      <span className={`${styles.severity} ${styles.sev_high}`}>
                                        Disabled
                                      </span>
                                    )}
                                    {c.status === "reenabled" && (
                                      <span className={`${styles.statusChip} ${styles.statusActive}`}>
                                        Re-enabled
                                      </span>
                                    )}
                                  </td>
                                  <td>
                                    {c.status === "expired" && (
                                      <div className={styles.actionStack}>
                                        <button
                                          type="button"
                                          className={styles.primaryBtn}
                                          disabled={actionBusy === c.id}
                                          onClick={() => void handleReenable(c)}
                                        >
                                          <CheckCircle2 size={14} /> Re-enable
                                        </button>
                                        <button
                                          type="button"
                                          className={styles.linkBtn}
                                          disabled={actionBusy === c.id}
                                          onClick={() => void handleReenableOverride(c)}
                                        >
                                          <RotateCcw size={14} /> Override
                                        </button>
                                      </div>
                                    )}
                                    {c.status === "pending" && (
                                      <span className={styles.mutedCell}>Waiting on vendor</span>
                                    )}
                                    {(c.status === "complied" || c.status === "reenabled") && (
                                      <span className={styles.mutedCell}>—</span>
                                    )}
                                  </td>
                                </tr>
                              );
                            })
                          )}
                        </tbody>
                      </table>
                    </div>
                    </div>
                    )}
                  </section>

                  <section className={styles.folder}>
                    <button
                      type="button"
                      className={styles.folderHead}
                      onClick={() => toggleFolder("messages")}
                      aria-expanded={openFolders.messages}
                    >
                      <span className={styles.folderIcon}>{openFolders.messages ? "📂" : "📁"}</span>
                      <div className={styles.folderTitle}>
                        <strong>2. Vendor ↔ admin messages</strong>
                        <small>{formatNumber(complianceMessages.length)} messages</small>
                      </div>
                      <span className={styles.folderChevron}>{openFolders.messages ? "▾" : "▸"}</span>
                    </button>
                    {openFolders.messages && (
                    <div className={styles.folderBody}>
                      <p className={styles.folderHint}>
                        Vendor messages now live in the sidebar. Open Messages to chat with vendors
                        like Messenger and reply to price notices.
                      </p>
                      <p className={styles.folderHint}>
                        <Link href="/messages" className={styles.primaryBtn}>
                          Open Messages
                        </Link>
                      </p>

                      <div className={styles.disclaimer}>
                        <AlertTriangle size={16} />
                        <p>
                          Expired cases disable the listing only (not delete). Re-enable when price is
                          at or below market, or use Override.
                        </p>
                      </div>
                    </div>
                    )}
                  </section>
                  </>
                )}

                {/* ── Help tab ── */}
                {tab === "help" && (
                  <section className={styles.panel}>
                    <header className={styles.panelHead}>
                      <div>
                        <h3>Vendors who may need help</h3>
                        <p>
                          Coaching signals only — not sanctions. Use these to guide outreach and
                          livelihood support.
                        </p>
                      </div>
                      <span className={styles.countBadge}>
                        {formatNumber(filteredHelp.length)} flagged
                      </span>
                    </header>
                    <div className={styles.tableWrap}>
                      <table className={styles.table}>
                        <thead>
                          <tr>
                            <th>Vendor</th>
                            <th>Location</th>
                            <th>Income</th>
                            <th>Orders</th>
                            <th>Severity</th>
                            <th>Indicators</th>
                            <th>Recommended actions</th>
                          </tr>
                        </thead>
                        <tbody>
                          {filteredHelp.length === 0 ? (
                            <tr>
                              <td colSpan={7} className={styles.emptyCell}>
                                No assistance indicators for this period. Vendors look healthy.
                              </td>
                            </tr>
                          ) : (
                            filteredHelp.map((row) => (
                              <tr
                                key={row.id}
                                className={
                                  selectedVendorId === row.id ? styles.rowSelected : undefined
                                }
                                onClick={() =>
                                  setSelectedVendorId(
                                    selectedVendorId === row.id ? null : row.id,
                                  )
                                }
                              >
                                <td>
                                  <strong>{row.name}</strong>
                                </td>
                                <td>{row.barangay}</td>
                                <td>
                                  {formatMoney(row.sales, {
                                    minimumFractionDigits: 0,
                                    maximumFractionDigits: 0,
                                  })}
                                </td>
                                <td>{formatNumber(row.orders)}</td>
                                <td>
                                  <SeverityBadge severity={row.severity} />
                                </td>
                                <td>
                                  <ul className={styles.tipList}>
                                    {row.reasons.map((r) => (
                                      <li key={r}>{r}</li>
                                    ))}
                                  </ul>
                                </td>
                                <td>
                                  <ul className={styles.tipList}>
                                    {row.tips.map((t) => (
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
                    <div className={styles.disclaimer}>
                      <AlertTriangle size={16} />
                      <p>
                        These tips are operational coaching signals for livelihood support. Always
                        verify against primary records before any formal action.
                      </p>
                    </div>
                  </section>
                )}
              </div>

              {/* Detail side panel */}
              {selectedVendor && (
                <aside className={styles.detail}>
                  <header className={styles.detailHead}>
                    <div>
                      <h3>{selectedVendor.name}</h3>
                      <p>
                        {"barangay" in selectedVendor
                          ? selectedVendor.barangay
                          : "Vendor detail"}
                      </p>
                    </div>
                    <button
                      type="button"
                      className={styles.closeBtn}
                      onClick={() => setSelectedVendorId(null)}
                    >
                      Close
                    </button>
                  </header>

                  {"sales" in selectedVendor && (
                    <div className={styles.detailStats}>
                      <div>
                        <span>Income (period)</span>
                        <strong>
                          {formatMoney(selectedVendor.sales, {
                            minimumFractionDigits: 0,
                            maximumFractionDigits: 0,
                          })}
                        </strong>
                      </div>
                      <div>
                        <span>Orders</span>
                        <strong>{formatNumber(selectedVendor.orders)}</strong>
                      </div>
                      {"listings" in selectedVendor && (
                        <div>
                          <span>Listings</span>
                          <strong>{formatNumber(selectedVendor.listings)}</strong>
                        </div>
                      )}
                      {"trend" in selectedVendor && (
                        <div>
                          <span>Trend</span>
                          <TrendBadge
                            trend={selectedVendor.trend}
                            pct={selectedVendor.trendPct}
                          />
                        </div>
                      )}
                    </div>
                  )}

                  {selectedVendorPrices.length > 0 && (
                    <div className={styles.detailBlock}>
                      <h4>
                        <Package size={16} /> Current listings
                      </h4>
                      <ul className={styles.listingList}>
                        {selectedVendorPrices.map((p) => (
                          <li key={p.id}>
                            <span>{p.name}</span>
                            <span>
                              {formatMoney(p.price, {
                                minimumFractionDigits: 0,
                                maximumFractionDigits: 2,
                              })}
                              <PriceFlag flag={p.flag} />
                            </span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {selectedHelp && selectedHelp.tips.length > 0 && (
                    <div className={styles.detailBlock}>
                      <h4>
                        <HandHelping size={16} /> How to help
                      </h4>
                      <ul className={styles.tipList}>
                        {selectedHelp.reasons.map((r) => (
                          <li key={r}>
                            <strong>Indicator:</strong> {r}
                          </li>
                        ))}
                        {selectedHelp.tips.map((t) => (
                          <li key={t}>{t}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </aside>
              )}
            </div>
          </>
        )}
      </div>
    </DashboardShell>
  );
}
