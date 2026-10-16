import {
  BookOpenText,
  Building2,
  ChartColumn,
  CircleCheckBig,
  Filter,
  History,
  Info,
  LayoutList,
  Settings,
  UserRound,
  Users,
  type LucideIcon,
} from "lucide-react";

export type NavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
  /** Shown only to Admins. The page itself also checks on the server. */
  adminOnly?: boolean;
};

// The 11 sidebar items from the PRD (Screens and functional requirements), in order.
export const NAV_ITEMS: NavItem[] = [
  { href: "/", label: "Today", icon: LayoutList },
  { href: "/people", label: "People", icon: Users },
  { href: "/companies", label: "Companies", icon: Building2 },
  { href: "/personas", label: "Personas", icon: UserRound },
  { href: "/account-filters", label: "Account Filters", icon: Filter },
  { href: "/templates", label: "Templates", icon: BookOpenText },
  { href: "/dashboard", label: "Dashboard", icon: ChartColumn },
  { href: "/approvals", label: "Approvals", icon: CircleCheckBig, adminOnly: true },
  { href: "/audit-log", label: "Audit Log", icon: History, adminOnly: true },
  { href: "/settings", label: "Settings", icon: Settings },
  { href: "/about", label: "About", icon: Info },
];

/** True when `pathname` is this item's page or one of its sub-pages. */
export function isActive(item: NavItem, pathname: string): boolean {
  if (item.href === "/") return pathname === "/";
  return pathname === item.href || pathname.startsWith(`${item.href}/`);
}
