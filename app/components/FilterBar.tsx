"use client";

import type { ReactNode } from "react";
import { Search, X } from "lucide-react";

type FilterBarProps = {
  search: string;
  setSearch: (value: string) => void;
  placeholder?: string;
  children?: ReactNode;
  className?: string;
  inputId?: string;
};

export default function FilterBar({
  search,
  setSearch,
  placeholder = "Search...",
  children,
  className = "",
  inputId = "filter-search",
}: FilterBarProps) {
  const wrapperClassName = ["filter-bar", className]
    .filter(Boolean)
    .join(" ");

  return (
    <div className={wrapperClassName}>
      <label className="topbar-search" htmlFor={inputId}>
        <Search size={18} strokeWidth={2.4} />

        <input
          id={inputId}
          type="search"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder={placeholder}
          aria-label={placeholder}
        />

        {search && (
          <button
            type="button"
            className="filter-clear"
            onClick={() => setSearch("")}
            aria-label="Clear search"
          >
            <X size={16} strokeWidth={2.4} />
          </button>
        )}
      </label>

      {children && <div className="toolbar">{children}</div>}
    </div>
  );
}