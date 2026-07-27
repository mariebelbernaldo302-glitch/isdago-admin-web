import type { ReactNode } from "react";

type AnalyticsTone = "blue" | "green" | "yellow" | "red" | "purple" | "gray";

type AnalyticsCardProps = {
  title: string;
  value: string | number;
  description?: string;
  icon?: ReactNode;
  tone?: AnalyticsTone;
  color?: AnalyticsTone;
  className?: string;
};

const toneClassMap: Record<AnalyticsTone, string> = {
  blue: "analytics-tone-blue",
  green: "analytics-tone-green",
  yellow: "analytics-tone-yellow",
  red: "analytics-tone-red",
  purple: "analytics-tone-purple",
  gray: "analytics-tone-gray",
};

export default function AnalyticsCard({
  title,
  value,
  description,
  icon,
  tone,
  color = "blue",
  className = "",
}: AnalyticsCardProps) {
  const resolvedTone = tone || color;

  const cardClassName = ["analytics-card", className]
    .filter(Boolean)
    .join(" ");

  const iconClassName = [
    "analytics-icon",
    toneClassMap[resolvedTone],
  ]
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