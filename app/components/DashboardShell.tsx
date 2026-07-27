"use client";

import Link from "next/link";
import {
  Fragment,
  FormEvent,
  ReactNode,
  useMemo,
  useState,
} from "react";

import {
  usePathname,
  useRouter,
} from "next/navigation";

import {
  signOut,
} from "firebase/auth";

import type {
  LucideIcon,
} from "lucide-react";

import {
  ClipboardList,
  LayoutDashboard,
  LogOut,
  Search,
  Settings,
  ShieldAlert,
  ShieldCheck,
  Store,
  Users,
} from "lucide-react";

import AdminGuard from "./AdminGuard";
import IsdaGoLogo from "./IsdaGoLogo";

import {
  auth,
} from "../lib/firebase";

import {
  useAuth,
} from "../providers/AuthProvider";

type NavigationItem = {
  href: string;
  label: string;
  icon: LucideIcon;
  keywords: string[];
  group: "Overview" | "Account Monitoring" | "Trust & Safety" | "Administration";
};

type DashboardShellProps = {
  children: ReactNode;
  title?: string;
  description?: string;
  actions?: ReactNode;
  hidePageHeader?: boolean;
};

const navigationItems: NavigationItem[] = [
  {
    href: "/dashboard",
    label: "Dashboard",
    icon: LayoutDashboard,
    group: "Overview",
    keywords: [
      "dashboard",
      "home",
      "overview",
      "summary",
    ],
  },
  {
    href: "/customers",
    label: "Customers",
    icon: Users,
    group: "Account Monitoring",
    keywords: [
      "customers",
      "buyers",
      "users",
      "clients",
    ],
  },
  {
    href: "/vendors",
    label: "Vendors",
    icon: Store,
    group: "Account Monitoring",
    keywords: [
      "vendors",
      "sellers",
      "stores",
      "merchant",
    ],
  },
  {
    href: "/vendor-approvals",
    label: "Vendor Approvals",
    icon: ShieldCheck,
    group: "Account Monitoring",
    keywords: [
      "vendor approvals",
      "approval",
      "applications",
      "pending vendors",
    ],
  },
  {
    href: "/reports",
    label: "Reports & Cases",
    icon: ShieldAlert,
    group: "Trust & Safety",
    keywords: [
      "reports",
      "trust and safety",
      "customer reports",
      "vendor reports",
      "complaints",
      "cases",
    ],
  },
  {
    href: "/activity-logs",
    label: "Activity Logs",
    icon: ClipboardList,
    group: "Trust & Safety",
    keywords: [
      "activity logs",
      "logs",
      "history",
      "audit trail",
    ],
  },
  {
    href: "/settings",
    label: "Admin & Security",
    icon: Settings,
    group: "Administration",
    keywords: [
      "admin security",
      "permissions",
      "enforcement policy",
    ],
  },
];

function isActiveRoute(
  pathname: string,
  href: string
): boolean {
  if (href === "/dashboard") {
    return pathname === href;
  }

  return (
    pathname === href ||
    pathname.startsWith(`${href}/`)
  );
}

function getInitials(
  name?: string | null,
  email?: string | null
): string {
  const source =
    name ||
    email ||
    "Admin";

  const parts = source
    .replace(/@.*/, "")
    .split(/[.\s_-]/)
    .filter(Boolean);

  if (parts.length >= 2) {
    return `${parts[0][0]}${parts[1][0]}`
      .toUpperCase();
  }

  return source
    .slice(0, 2)
    .toUpperCase();
}

function getAdminName(
  name?: string | null,
  email?: string | null
): string {
  if (name?.trim()) {
    return name.trim();
  }

  if (email) {
    return email.split("@")[0];
  }

  return "Administrator";
}

export function DashboardShell({
  children,
  title,
  description,
  actions,
  hidePageHeader = false,
}: DashboardShellProps) {
  const pathname = usePathname();
  const router = useRouter();
  const { user } = useAuth();

  const [
    searchValue,
    setSearchValue,
  ] = useState("");

  const [
    isLoggingOut,
    setIsLoggingOut,
  ] = useState(false);

  const adminName = useMemo(
    () =>
      getAdminName(
        user?.displayName,
        user?.email
      ),
    [
      user?.displayName,
      user?.email,
    ]
  );

  const adminInitials = useMemo(
    () =>
      getInitials(
        user?.displayName,
        user?.email
      ),
    [
      user?.displayName,
      user?.email,
    ]
  );

  async function handleLogout() {
    if (isLoggingOut) {
      return;
    }

    try {
      setIsLoggingOut(true);

      await signOut(auth);

      router.replace("/login");
    } catch (error) {
      console.error(
        "Logout failed:",
        error
      );

      setIsLoggingOut(false);
    }
  }

  function handleSearch(
    event: FormEvent<HTMLFormElement>
  ) {
    event.preventDefault();

    const query = searchValue
      .trim()
      .toLowerCase();

    if (!query) {
      return;
    }

    const matchedItem =
      navigationItems.find(
        (item) => {
          const labelMatch =
            item.label
              .toLowerCase()
              .includes(query);

          const keywordMatch =
            item.keywords.some(
              (keyword) =>
                keyword
                  .toLowerCase()
                  .includes(query)
            );

          return (
            labelMatch ||
            keywordMatch
          );
        }
      );

    if (matchedItem) {
      router.push(
        matchedItem.href
      );

      setSearchValue("");
    }
  }

  return (
    <AdminGuard
      allowedRoles={["admin"]}
    >
      <div className="app-shell">
        <aside
          className="sidebar"
          aria-label="Admin sidebar"
        >
          <div className="brand">
            <IsdaGoLogo small />

            <div className="brand-name">
              <strong>
                IsdaGo
              </strong>

              <span>
                Admin Portal
              </span>
            </div>
          </div>

          <nav
            className="nav"
            aria-label="Admin navigation"
          >
            {navigationItems.map(
              (item, index) => {
                const Icon =
                  item.icon;

                const showGroup =
                  index === 0 ||
                  navigationItems[index - 1].group !== item.group;

                const active =
                  isActiveRoute(
                    pathname,
                    item.href
                  );

                return (
                  <Fragment key={item.href}>
                    {showGroup && (
                      <span className="nav-section-label">
                        {item.group}
                      </span>
                    )}

                    <Link
                      href={item.href}
                      className={
                        active
                          ? "nav-link active"
                          : "nav-link"
                      }
                      aria-current={
                        active
                          ? "page"
                          : undefined
                      }
                    >
                      <Icon
                        size={19}
                        strokeWidth={2.4}
                      />

                      <span>
                        {item.label}
                      </span>
                    </Link>
                  </Fragment>
                );
              }
            )}
          </nav>

          <button
            type="button"
            className="logout-button"
            onClick={handleLogout}
            disabled={isLoggingOut}
          >
            <LogOut
              size={18}
              strokeWidth={2.4}
            />

            <span>
              {isLoggingOut
                ? "Logging out..."
                : "Logout"}
            </span>
          </button>
        </aside>

        <main className="main-area">
          <header className="topbar">
            <form
              className="search-box"
              onSubmit={handleSearch}
            >
              <Search
                size={18}
                strokeWidth={2.4}
              />

              <input
                type="search"
                placeholder="Search monitoring modules..."
                value={searchValue}
                onChange={(event) =>
                  setSearchValue(
                    event.target.value
                  )
                }
                aria-label="Search admin modules"
              />
            </form>

            <div className="profile">
              <div className="admin-profile">
                <div
                  className="avatar"
                  aria-hidden="true"
                >
                  {adminInitials}
                </div>

                <div>
                  <strong>
                    {adminName}
                  </strong>

                  <small>
                    {user?.email ??
                      "Admin account"}
                  </small>
                </div>
              </div>
            </div>
          </header>

          <div className="page-container">
            {!hidePageHeader &&
              (
                title ||
                description ||
                actions
              ) && (
                <section className="page-header">
                  <div>
                    {title && (
                      <h1>
                        {title}
                      </h1>
                    )}

                    {description && (
                      <p>
                        {description}
                      </p>
                    )}
                  </div>

                  {actions && (
                    <div className="toolbar">
                      {actions}
                    </div>
                  )}
                </section>
              )}

            {children}
          </div>
        </main>
      </div>
    </AdminGuard>
  );
}

export default DashboardShell;
