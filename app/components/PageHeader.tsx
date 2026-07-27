import type { ReactNode } from "react";

type PageHeaderProps = {
  title: string;
  description?: string;
  eyebrow?: string;
  actions?: ReactNode;
  className?: string;
};

export default function PageHeader({
  title,
  description,
  eyebrow,
  actions,
  className = "",
}: PageHeaderProps) {
  const headerClassName = ["module-header", className]
    .filter(Boolean)
    .join(" ");

  return (
    <section className={headerClassName}>
      <div>
        {eyebrow && <span className="page-eyebrow">{eyebrow}</span>}

        <h1>{title}</h1>

        {description && <p>{description}</p>}
      </div>

      {actions && <div className="toolbar">{actions}</div>}
    </section>
  );
}