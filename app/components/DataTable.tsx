import type { ReactNode } from "react";

type DataTableProps = {
  headers: ReactNode[];
  children: ReactNode;
  caption?: string;
  className?: string;
  tableClassName?: string;
};

export default function DataTable({
  headers,
  children,
  caption,
  className = "",
  tableClassName = "",
}: DataTableProps) {
  const wrapperClassName = ["table-container", "table-wrap", className]
    .filter(Boolean)
    .join(" ");

  const resolvedTableClassName = ["data-table", tableClassName]
    .filter(Boolean)
    .join(" ");

  return (
    <div className={wrapperClassName}>
      <table className={resolvedTableClassName}>
        {caption && <caption>{caption}</caption>}

        <thead>
          <tr>
            {headers.map((header, index) => (
              <th key={`${String(header)}-${index}`} scope="col">
                {header}
              </th>
            ))}
          </tr>
        </thead>

        <tbody>{children}</tbody>
      </table>
    </div>
  );
}