import type { ReactNode } from "react";
import { Inbox } from "lucide-react";

type EmptyStateProps = {
  title: string;
  message?: string;
  icon?: ReactNode;
  actions?: ReactNode;
  className?: string;
};

export default function EmptyState({
  title,
  message = "No records found.",
  icon,
  actions,
  className = "",
}: EmptyStateProps) {
  const wrapperClassName = ["empty-state", className]
    .filter(Boolean)
    .join(" ");

  return (
    <div className={wrapperClassName} role="status" aria-live="polite">
      <div className="empty-state-content">
        <div className="empty-state-icon" aria-hidden="true">
          {icon ?? <Inbox size={34} strokeWidth={2.3} />}
        </div>

        <strong>{title}</strong>

        {message && <p>{message}</p>}

        {actions && <div className="empty-state-actions">{actions}</div>}
      </div>
    </div>
  );
}