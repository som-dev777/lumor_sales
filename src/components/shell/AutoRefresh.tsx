"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef } from "react";

/**
 * Keeps a page current (D-054, D-055):
 * - when you come back to it in the app. Next.js keeps pages you leave alive and shows them again
 *   as they were; this effect runs again at that moment, so the page is fetched afresh and work
 *   you logged elsewhere (say, on a person's page) shows at once;
 * - as soon as you come back to the browser tab;
 * - every `everyMs` while the tab is open (0 = never), so meetings booked meanwhile show up.
 */
export function AutoRefresh({ everyMs = 60_000 }: { everyMs?: number }) {
  const router = useRouter();
  const shownBefore = useRef(false);
  useEffect(() => {
    if (shownBefore.current) router.refresh();
    shownBefore.current = true;
    const refresh = () => {
      if (document.visibilityState === "visible") router.refresh();
    };
    const timer = everyMs > 0 ? setInterval(refresh, everyMs) : null;
    document.addEventListener("visibilitychange", refresh);
    return () => {
      if (timer) clearInterval(timer);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [router, everyMs]);
  return null;
}
