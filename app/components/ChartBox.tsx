import type { ReactNode } from "react";
import { BarChart3 } from "lucide-react";

type ChartBoxProps = {
  title: string;
  children: ReactNode;
  description?: string;
  actions?: ReactNode;
  icon?: ReactNode;
  className?: string;
  bodyClassName?: string;
};

export default function ChartBox({
  title,
  description,
  actions,
  icon,
  children,
  className = "",
  bodyClassName = "",
}: ChartBoxProps) {
  const wrapperClassName = ["chart-box", className]
    .filter(Boolean)
    .join(" ");

  const contentClassName = ["chart-body", bodyClassName]
    .filter(Boolean)
    .join(" ");

  return (
    <section className={wrapperClassName}>
      <div className="chart-header">
        <div className="chart-title-wrap">
          <div className="chart-icon" aria-hidden="true">
            {icon ?? <BarChart3 size={22} strokeWidth={2.4} />}
          </div>

          <div>
            <h2>{title}</h2>
            {description && <p>{description}</p>}
          </div>
        </div>

        {actions && <div className="toolbar">{actions}</div>}
      </div>

      <div className={contentClassName}>{children}</div>
    </section>
  );
}