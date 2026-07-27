import type { ReactNode } from "react";

type ModuleHeroProps = {
  eyebrow: string;
  title: string;
  description: string;
  total?: number | string;
  totalLabel?: string;
  icon?: ReactNode;
  actions?: ReactNode;
  className?: string;
};

export default function ModuleHero({
  eyebrow,
  title,
  description,
  total,
  totalLabel = "Live Records",
  icon,
  actions,
  className = "",
}: ModuleHeroProps) {
  const heroClassName = ["module-hero", className].filter(Boolean).join(" ");

  return (
    <section className={heroClassName}>
      <div>
        <span>{eyebrow}</span>

        <h1>{title}</h1>

        <p>{description}</p>

        {actions && <div className="toolbar hero-actions">{actions}</div>}
      </div>

      {(total !== undefined || icon) && (
        <div className="hero-counter">
          {icon && (
            <div className="hero-icon" aria-hidden="true">
              {icon}
            </div>
          )}

          <small>{totalLabel}</small>

          {total !== undefined && <strong>{total}</strong>}
        </div>
      )}
    </section>
  );
}