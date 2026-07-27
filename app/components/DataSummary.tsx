import type { ReactNode } from "react";

type DataSummaryTone = "default" | "blue" | "green" | "yellow" | "red" | "purple";

type DataSummaryProps = {
  label: string;
  value: string | number;
  icon?: ReactNode;
  helperText?: string;
  tone?: DataSummaryTone;
  className?: string;
};

const toneClassMap: Record<DataSummaryTone, string> = {
  default: "",
  blue: "data-summary-blue",
  green: "data-summary-green",
  yellow: "data-summary-yellow",
  red: "data-summary-red",
  purple: "data-summary-purple",
};

export default function DataSummary({
  label,
  value,
  icon,
  helperText,
  tone = "default",
  className = "",
}: DataSummaryProps) {
  const summaryClassName = [
    "data-summary",
    toneClassMap[tone],
    className,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div className={summaryClassName}>
      <div>
        <span>
          {icon && <span className="data-summary-icon">{icon}</span>}
          {label}
        </span>

        {helperText && <small>{helperText}</small>}
      </div>

      <strong>{value}</strong>
    </div>
  );
}