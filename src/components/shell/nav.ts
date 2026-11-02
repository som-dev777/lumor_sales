import {
  BookMarked,
  BookOpenText,
  Building2,
  CalendarDays,
  ChartColumn,
  FileText,
  Filter,
  History,
  Info,
  LayoutList,
  Route,
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

// The sidebar items from the PRD (Screens; v2 adds Plans, AI Resources (F20), Reports (F19) and
// Calendar (F22)), in order.
export const NAV_ITEMS: NavItem[] = [
  { href: "/", label: "Today", icon: LayoutList },
  { href: "/calendar", label: "Calendar", icon: CalendarDays },
  { href: "/companies", label: "Companies", icon: Building2 },
  { href: "/people", label: "People", icon: Users },
  { href: "/personas", label: "Personas", icon: UserRound },
  { href: "/account-filters", label: "Account Filters", icon: Filter },
  { href: "/templates", label: "Templates", icon: BookOpenText },
  { href: "/plans", label: "Plans", icon: Route },
  { href: "/ai-resources", label: "AI Resources", icon: BookMarked },
  { href: "/dashboard", label: "Dashboard", icon: ChartColumn },
  { href: "/reports", label: "Reports", icon: FileText },
  { href: "/audit-log", label: "Audit Log", icon: History, adminOnly: true },
  { href: "/settings", label: "Settings", icon: Settings },
  { href: "/about", label: "About", icon: Info },
];

/** True when `pathname` is this item's page or one of its sub-pages. */
export function isActive(item: NavItem, pathname: string): boolean {
  if (item.href === "/") return pathname === "/";
  return pathname === item.href || pathname.startsWith(`${item.href}/`);
}
