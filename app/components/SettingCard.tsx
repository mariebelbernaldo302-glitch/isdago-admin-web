import type { ReactNode } from "react";
import { Settings } from "lucide-react";

type SettingCardProps = {
  title: string;
  description?: string;
  children: ReactNode;
  icon?: ReactNode;
  actions?: ReactNode;
  className?: string;
  bodyClassName?: string;
};

export default function SettingCard({
  title,
  description,
  children,
  icon,
  actions,
  className = "",
  bodyClassName = "",
}: SettingCardProps) {
  const cardClassName = ["setting-card", className]
    .filter(Boolean)
    .join(" ");

  const bodyClassNameResolved = ["setting-card-body", bodyClassName]
    .filter(Boolean)
    .join(" ");

  return (
    <section className={cardClassName}>
      <div className="setting-card-header">
        <div className="setting-title-wrap">
          <div className="setting-icon" aria-hidden="true">
            {icon ?? <Settings size={22} strokeWidth={2.4} />}
          </div>

          <div>
            <h2>{title}</h2>
            {description && <p>{description}</p>}
          </div>
        </div>

        {actions && <div className="toolbar">{actions}</div>}
      </div>

      <div className={bodyClassNameResolved}>{children}</div>
    </section>
  );
}