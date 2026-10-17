"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu, X } from "lucide-react";
import { useState, type ReactNode } from "react";
import type { Role } from "@/lib/db/enums";
import { Brand } from "./Brand";
import { isActive, NAV_ITEMS } from "./nav";
import styles from "./Sidebar.module.scss";

type Props = {
  /** The signed-in user's role. null while unknown: Admin-only items stay hidden. */
  role: Role | null;
  /** Shown at the bottom of the sidebar (the signed-in user and Log out, from R1 Step 7). */
  footer?: ReactNode;
  /** Small numbers next to menu items, by link, e.g. { "/approvals": 2 } waiting proposals. */
  counts?: Record<string, number>;
};

/** The sidebar, highlighting the page you're on. */
export function Sidebar(props: Props) {
  const pathname = usePathname();
  return <SidebarView {...props} pathname={pathname} />;
}

/**
 * The same sidebar without reading the address: used as the loading placeholder, because
 * pages with an id in the address (e.g. /companies/[id]) can't know it while pre-building.
 */
export function SidebarPlaceholder() {
  return <SidebarView role={null} pathname={null} />;
}

function SidebarView({ role, footer, counts = {}, pathname }: Props & { pathname: string | null }) {
  const [open, setOpen] = useState(false);
  const items = NAV_ITEMS.filter((item) => !item.adminOnly || role === "Admin");

  return (
    <>
      {/* Mobile only: top bar with the menu button */}
      <header className={styles.topbar}>
        <button
          type="button"
          className={styles.menuButton}
          aria-label="Open menu"
          aria-expanded={open}
          aria-controls="app-sidebar"
          onClick={() => setOpen(true)}
        >
          <Menu size={20} aria-hidden />
        </button>
        <Link href="/" className={styles.logo} aria-label="Lumor Sales Hub, go to Today">
          <Brand />
        </Link>
      </header>

      {open && (
        <button
          type="button"
          className={styles.backdrop}
          aria-label="Close menu"
          onClick={() => setOpen(false)}
        />
      )}

      <aside id="app-sidebar" className={`${styles.sidebar} ${open ? styles.open : ""}`}>
        <div className={styles.header}>
          <Link
            href="/"
            className={styles.logo}
            aria-label="Lumor Sales Hub, go to Today"
            onClick={() => setOpen(false)}
          >
            <Brand />
          </Link>
          <button
            type="button"
            className={styles.closeButton}
            aria-label="Close menu"
            onClick={() => setOpen(false)}
          >
            <X size={20} aria-hidden />
          </button>
        </div>

        <nav aria-label="Main" className={styles.nav}>
          <ul>
            {items.map((item) => {
              const active = pathname !== null && isActive(item, pathname);
              const Icon = item.icon;
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    className={`${styles.link} ${active ? styles.active : ""}`}
                    aria-current={active ? "page" : undefined}
                    onClick={() => setOpen(false)}
                  >
                    <Icon size={18} aria-hidden />
                    <span>{item.label}</span>
                    {(counts[item.href] ?? 0) > 0 && (
                      <span className={styles.count} aria-label={`${counts[item.href]} waiting`}>
                        {counts[item.href]}
                      </span>
                    )}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>

        {footer && <div className={styles.footer}>{footer}</div>}
      </aside>
    </>
  );
}
