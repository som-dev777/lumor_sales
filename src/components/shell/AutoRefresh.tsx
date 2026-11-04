"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

/**
 * Keeps a page current (D-054): fetches it again every minute while the tab is open, and as soon
 * as you come back to the tab, so meetings booked or cancelled meanwhile show up.
 */
export function AutoRefresh({ everyMs = 60_000 }: { everyMs?: number }) {
  const router = useRouter();
  useEffect(() => {
    const refresh = () => {
      if (document.visibilityState === "visible") router.refresh();
    };
    const timer = setInterval(refresh, everyMs);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [router, everyMs]);
  return null;
}
