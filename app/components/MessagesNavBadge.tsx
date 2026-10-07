"use client";

import { useMemo } from "react";

import { isUnreadVendorMessage } from "../lib/vendorMessages";
import type { ComplianceMessage } from "../lib/priceCompliance";
import { useRealtimeCollection } from "../lib/useFirestoreCollection";

/** Red unread counter shown next to "Messages" in the sidebar. */
export default function MessagesNavBadge() {
  const { data } = useRealtimeCollection<ComplianceMessage>(
    "price_compliance_messages",
    "createdAt",
    { limit: 300 },
  );

  const unread = useMemo(
    () => data.filter(isUnreadVendorMessage).length,
    [data],
  );

  if (unread === 0) return null;

  return (
    <span
      aria-label={`${unread} unread vendor messages`}
      style={{
        marginLeft: "auto",
        minWidth: 20,
        height: 20,
        padding: "0 6px",
        borderRadius: 999,
        background: "#dc2626",
        color: "#fff",
        fontSize: 11,
        fontWeight: 700,
        lineHeight: "20px",
        textAlign: "center",
      }}
    >
      {unread > 99 ? "99+" : unread}
    </span>
  );
}
