import Link from "next/link";
import styles from "./calendar.module.scss";

const TABS = [
  { href: "/calendar", label: "Bookings" },
  { href: "/calendar/meeting-types", label: "Meeting types" },
  { href: "/calendar/availability", label: "Availability" },
] as const;

/** The three Calendar pages (F22). */
export function CalendarTabs({ current }: { current: (typeof TABS)[number]["href"] }) {
  return (
    <nav className={styles.tabs} aria-label="Calendar">
      {TABS.map((t) => (
        <Link
          key={t.href}
          href={t.href}
          className={`${styles.tab} ${t.href === current ? styles.tabOn : ""}`}
          aria-current={t.href === current ? "page" : undefined}
        >
          {t.label}
        </Link>
      ))}
    </nav>
  );
}
