import type { ReactNode } from "react";
import { Bell, CalendarClock, Users } from "lucide-react";

import StatusBadge from "./StatusBadge";

type NotificationCardProps = {
  title: string;
  message: string;
  target?: string;
  date?: string;
  status?: string;
  type?: string;
  actions?: ReactNode;
  className?: string;
};

export default function NotificationCard({
  title,
  message,
  target = "All users",
  date = "-",
  status = "unread",
  type = "system",
  actions,
  className = "",
}: NotificationCardProps) {
  const cardClassName = ["notification-card", className]
    .filter(Boolean)
    .join(" ");

  return (
    <article className={cardClassName}>
      <div className="notification-header">
        <div className="notification-title-wrap">
          <div className="notification-icon" aria-hidden="true">
            <Bell size={20} strokeWidth={2.4} />
          </div>

          <div>
            <strong>{title}</strong>
            <small>{type}</small>
          </div>
        </div>

        <StatusBadge status={status} />
      </div>

      <p>{message}</p>

      <div className="notification-footer">
        <small>
          <Users size={14} strokeWidth={2.4} />
          Target: {target}
        </small>

        <small>
          <CalendarClock size={14} strokeWidth={2.4} />
          {date}
        </small>
      </div>

      {actions && <div className="toolbar notification-actions">{actions}</div>}
    </article>
  );
}