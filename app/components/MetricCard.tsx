import type { ReactNode } from "react";

type MetricTone = "blue" | "green" | "yellow" | "red" | "purple" | "gray";

type MetricCardProps = {
  title: string;
  value: string | number;
  description?: string;
  icon?: ReactNode;
  tone?: MetricTone;
  className?: string;
};

const toneClassMap: Record<MetricTone, string> = {
  blue: "metric-tone-blue",
  green: "metric-tone-green",
  yellow: "metric-tone-yellow",
  red: "metric-tone-red",
  purple: "metric-tone-purple",
  gray: "metric-tone-gray",
};

export default function MetricCard({
  title,
  value,
  description,
  icon,
  tone = "blue",
  className = "",
}: MetricCardProps) {
  const cardClassName = ["metric-card", className]
    .filter(Boolean)
    .join(" ");

  const iconClassName = ["metric-icon", toneClassMap[tone]]
    .filter(Boolean)
    .join(" ");

  return (
    <article className={cardClassName}>
      {icon && (
        <div className={iconClassName} aria-hidden="true">
          {icon}
        </div>
      )}

      <div>
        <strong>{value}</strong>
        <h3>{title}</h3>

        {description && <p>{description}</p>}
      </div>
    </article>
  );
}