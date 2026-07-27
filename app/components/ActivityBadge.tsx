import {
  Bell,
  ClipboardList,
  Fish,
  Settings,
  ShieldCheck,
  ShoppingCart,
  Store,
  UserRound,
  type LucideIcon,
} from "lucide-react";

import { formatStatusLabel, normalizeStatus } from "../lib/format";

type ActivityBadgeProps = {
  type?: string | null;
  className?: string;
};

type ActivityTone = "blue" | "green" | "yellow" | "red" | "purple" | "gray";

const ACTIVITY_CONFIG: Record<
  string,
  {
    tone: ActivityTone;
    icon: LucideIcon;
  }
> = {
  vendor: {
    tone: "purple",
    icon: Store,
  },
  "vendor approval": {
    tone: "green",
    icon: ShieldCheck,
  },
  product: {
    tone: "blue",
    icon: Fish,
  },
  order: {
    tone: "yellow",
    icon: ShoppingCart,
  },
  notification: {
    tone: "purple",
    icon: Bell,
  },
  settings: {
    tone: "gray",
    icon: Settings,
  },
  admin: {
    tone: "green",
    icon: UserRound,
  },
  system: {
    tone: "blue",
    icon: ClipboardList,
  },
};

function getActivityConfig(type: string) {
  const normalizedType = normalizeStatus(type);

  const matchedKey = Object.keys(ACTIVITY_CONFIG).find((key) =>
    normalizedType.includes(key)
  );

  return matchedKey
    ? ACTIVITY_CONFIG[matchedKey]
    : {
        tone: "gray" as ActivityTone,
        icon: ClipboardList,
      };
}

export default function ActivityBadge({
  type = "system",
  className = "",
}: ActivityBadgeProps) {
  const normalizedType = normalizeStatus(type);
  const config = getActivityConfig(normalizedType);
  const Icon = config.icon;

  const badgeClassName = [
    "activity-badge",
    `status-${config.tone}`,
    className,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <span className={badgeClassName} title={formatStatusLabel(normalizedType)}>
      <Icon size={14} strokeWidth={2.5} />
      {formatStatusLabel(normalizedType)}
    </span>
  );
}