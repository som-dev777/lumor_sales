"use client";

import { useSyncExternalStore } from "react";

const subscribe = () => () => {};

/**
 * A moment in the viewer's own time zone (the browser's), with IST shown first on the server
 * so the page never flashes empty.
 */
export function LocalTime({ iso, ist }: { iso: string; ist: string }) {
  const local = useSyncExternalStore(
    subscribe,
    () =>
      new Intl.DateTimeFormat("en-GB", {
        weekday: "long",
        day: "numeric",
        month: "long",
        year: "numeric",
        hour: "numeric",
        minute: "2-digit",
        hour12: true,
        timeZoneName: "short",
      }).format(new Date(iso)),
    () => ist,
  );
  return <>{local}</>;
}
