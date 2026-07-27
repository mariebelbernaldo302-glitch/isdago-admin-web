import type { ReactNode } from "react";

type StatTone = "blue" | "green" | "yellow" | "red" | "purple";

type StatCardProps = {
  title: string;
  value: string | number;
  icon: ReactNode;
  tone?: StatTone;
  description?: string;
  className?: string;
};

const toneClassMap: Record<StatTone, string> = {
  blue: "stat-tone-blue",
  green: "stat-tone-green",
  yellow: "stat-tone-yellow",
  red: "stat-tone-red",
  purple: "stat-tone-purple",
};

export default function StatCard({
  title,
  value,
  icon,
  tone = "blue",
  description,
  className = "",
}: StatCardProps) {
  const cardClassName = ["card", "stat-card", className]
    .filter(Boolean)
    .join(" ");

  const iconClassName = ["stat-icon", toneClassMap[tone]]
    .filter(Boolean)
    .join(" ");

  return (
    <article className={cardClassName}>
      <div className={iconClassName} aria-hidden="true">
        {icon}
      </div>

      <div className="stat-content">
        <p>{title}</p>
        <strong>{value}</strong>

        {description && <small>{description}</small>}
      </div>
    </article>
  );
}