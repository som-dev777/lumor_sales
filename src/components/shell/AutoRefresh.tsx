"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useTransition } from "react";

/**
 * Keeps a page current (D-054, D-055):
 * - when you come back to it in the app. Next.js keeps pages you leave alive and shows them again
 *   as they were; this effect runs again at that moment, so the page is fetched afresh and work
 *   you logged elsewhere (say, on a person's page) shows at once;
 * - as soon as you come back to the browser tab;
 * - every `everyMs` while the tab is open (0 = never), so meetings booked meanwhile show up.
 * A refresh still loading is never restarted by the next one (D-062), so a slow page finishes.
 */
export function AutoRefresh({ everyMs = 60_000 }: { everyMs?: number }) {
  const router = useRouter();
  const shownBefore = useRef(false);
  const [loading, start] = useTransition();
  const busy = useRef(false);
  useEffect(() => {
    busy.current = loading;
  }, [loading]);
  useEffect(() => {
    const load = () => {
      if (busy.current) return;
      busy.current = true;
      start(() => router.refresh());
    };
    if (shownBefore.current) load();
    shownBefore.current = true;
    const refresh = () => {
      if (document.visibilityState === "visible") load();
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
