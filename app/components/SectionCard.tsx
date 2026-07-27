import type { ReactNode } from "react";

type SectionCardProps = {
  title: string;
  children: ReactNode;
  description?: string;
  actions?: ReactNode;
  className?: string;
  bodyClassName?: string;
};

export default function SectionCard({
  title,
  description,
  actions,
  children,
  className = "",
  bodyClassName = "",
}: SectionCardProps) {
  const sectionClassName = ["card", "section-card", className]
    .filter(Boolean)
    .join(" ");

  const contentClassName = ["section-body", bodyClassName]
    .filter(Boolean)
    .join(" ");

  return (
    <section className={sectionClassName}>
      <div className="section-top">
        <div>
          <h2 className="section-title">{title}</h2>

          {description && (
            <p className="section-description">{description}</p>
          )}
        </div>

        {actions && <div className="toolbar">{actions}</div>}
      </div>

      <div className={contentClassName}>{children}</div>
    </section>
  );
}