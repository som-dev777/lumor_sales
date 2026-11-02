"use client";

import * as Menu from "@radix-ui/react-dropdown-menu";
import { Bell } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import {
  markNotificationsRead,
  myNotifications,
  myUnreadCount,
} from "@/server/actions/notifications";
import type { NotificationView } from "@/server/notifications";
import styles from "./NotificationBell.module.scss";

const ago = (d: Date) => {
  const mins = Math.round((Date.now() - new Date(d).getTime()) / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  const h = Math.round(mins / 60);
  if (h < 24) return `${h} h ago`;
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    timeZone: "Asia/Kolkata",
  }).format(new Date(d));
};

/** The bell with the unread count; opens the latest notifications (F25). */
export function NotificationBell({
  initialUnread,
  initialItems,
}: {
  initialUnread: number;
  /** The latest ones, sent with the page so the list opens at once. */
  initialItems: NotificationView[];
}) {
  const router = useRouter();
  const ref = useRef<HTMLButtonElement>(null);
  const [unread, setUnread] = useState(initialUnread);
  const [items, setItems] = useState<NotificationView[] | null>(initialItems);
  const [, start] = useTransition();

  // Checks for new ones every minute while this bell is on screen and the tab is open.
  useEffect(() => {
    const tick = async () => {
      if (document.hidden || !ref.current || ref.current.offsetParent === null) return;
      try {
        setUnread(await myUnreadCount());
      } catch {
        // Offline or signed out: try again next minute.
      }
    };
    const timer = window.setInterval(tick, 60_000);
    return () => window.clearInterval(timer);
  }, []);

  // Refreshes in the background; the list from the page shows meanwhile.
  const load = () => {
    myNotifications()
      .then((r) => {
        setItems(r.items);
        setUnread(r.unread);
      })
      .catch(() => {});
  };

  const markAll = () =>
    start(async () => {
      const r = await markNotificationsRead(null);
      if (r.ok) {
        setUnread(0);
        setItems((list) => list?.map((n) => ({ ...n, read: true })) ?? null);
        router.refresh();
      }
    });

  const openOne = (n: NotificationView) =>
    start(async () => {
      if (!n.read) {
        await markNotificationsRead([n.id]);
        setUnread((u) => Math.max(0, u - 1));
      }
      if (n.link) router.push(n.link);
      else router.refresh();
    });

  return (
    <Menu.Root onOpenChange={(open) => open && load()}>
      <Menu.Trigger asChild>
        <button
          ref={ref}
          type="button"
          className={styles.bell}
          aria-label={unread ? `Notifications, ${unread} new` : "Notifications"}
        >
          <Bell size={18} aria-hidden />
          {unread > 0 && (
            <span className={styles.badge} aria-hidden>
              {unread > 99 ? "99+" : unread}
            </span>
          )}
        </button>
      </Menu.Trigger>
      <Menu.Portal>
        <Menu.Content className={styles.panel} align="start" sideOffset={6}>
          <div className={styles.head}>
            <strong>Notifications</strong>
            {unread > 0 && (
              <button type="button" className={styles.markAll} onClick={markAll}>
                Mark all read
              </button>
            )}
          </div>
          {items === null ? (
            <p className={styles.empty}>Loading…</p>
          ) : items.length === 0 ? (
            <p className={styles.empty}>
              Nothing yet. New bookings, cancellations and meetings you&rsquo;re added to show here.
            </p>
          ) : (
            <div className={styles.list}>
              {items.map((n) => (
                <Menu.Item
                  key={n.id}
                  className={`${styles.item} ${n.read ? "" : styles.unread}`}
                  onSelect={() => openOne(n)}
                >
                  <span className={styles.title}>{n.title}</span>
                  <span className={styles.body}>{n.body}</span>
                  <span className={styles.time}>{ago(n.createdAt)}</span>
                </Menu.Item>
              ))}
            </div>
          )}
        </Menu.Content>
      </Menu.Portal>
    </Menu.Root>
  );
}
