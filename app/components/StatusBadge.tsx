import { normalizeStatus } from "../lib/format";

type StatusTone = "green" | "yellow" | "red" | "blue" | "purple" | "gray";

type StatusBadgeProps = {
  status?: string | null;
  className?: string;
};

const STATUS_TONE_MAP: Record<StatusTone, string[]> = {
  green: [
    "active",
    "verified",
    "approved",
    "completed",
    "delivered",
    "paid",
    "in stock",
    "available",
    "successful",
    "success",
  ],
  yellow: [
    "pending",
    "pending review",
    "processing",
    "low stock",
    "under review",
    "waiting",
    "unpaid",
  ],
  red: [
    "rejected",
    "disabled",
    "inactive",
    "cancelled",
    "canceled",
    "failed",
    "out of stock",
    "declined",
    "blocked",
    "suspended",
  ],
  blue: [
    "shipped",
    "accepted",
    "preparing",
    "ready",
    "confirmed",
    "for delivery",
    "on delivery",
  ],
  purple: [
    "new",
    "order update",
    "updated",
    "refunded",
    "return",
  ],
  gray: [
    "unknown",
    "not set",
    "none",
    "draft",
  ],
};

function getStatusTone(status: string): StatusTone {
  const matchedTone = Object.entries(STATUS_TONE_MAP).find(([, statuses]) =>
    statuses.includes(status)
  );

  return (matchedTone?.[0] as StatusTone) ?? "gray";
}

function formatStatusLabel(status: string) {
  return status
    .split(" ")
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

export default function StatusBadge({
  status,
  className = "",
}: StatusBadgeProps) {
  const normalizedStatus = normalizeStatus(status || "unknown");
  const tone = getStatusTone(normalizedStatus);

  const badgeClassName = [
    "status-badge",
    `status-${tone}`,
    className,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <span className={badgeClassName} title={formatStatusLabel(normalizedStatus)}>
      {formatStatusLabel(normalizedStatus)}
    </span>
  );
}
