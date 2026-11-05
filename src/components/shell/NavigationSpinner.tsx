"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { Spinner } from "@/components/ui/Spinner";
import styles from "./AppShell.module.scss";

/** Past this, the spinner goes away even if the page never answered. */
const GIVE_UP_MS = 20_000;

/**
 * A spinning circle at the top of the screen while the app moves to another page or applies
 * filters (D-059), so a slow load never looks like nothing happened. It starts on a click on a
 * link to another page in the app (or a filter form being sent) and stops when the address
 * changes.
 */
export function NavigationSpinner() {
  const pathname = usePathname();
  const search = useSearchParams();
  const here = `${pathname}?${search.toString()}`;
  const [pending, setPending] = useState(false);
  const [seen, setSeen] = useState(here);
  if (seen !== here) {
    setSeen(here);
    setPending(false);
  }

  useEffect(() => {
    const internal = (href: string) => {
      const url = new URL(href, window.location.href);
      if (url.origin !== window.location.origin) return false;
      if (/\/(pdf|csv)$/.test(url.pathname) || url.pathname.startsWith("/api/")) return false;
      // Only a different page or a different filter, not the same address or an anchor.
      return url.pathname + url.search !== window.location.pathname + window.location.search;
    };
    // Capture: runs before Next.js handles the click or the submit.
    const onClick = (e: MouseEvent) => {
      if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = (e.target as Element | null)?.closest?.("a");
      if (!a || a.target === "_blank" || a.hasAttribute("download")) return;
      const href = a.getAttribute("href");
      if (href && internal(href)) setPending(true);
    };
    const onSubmit = (e: SubmitEvent) => {
      const form = e.target as HTMLFormElement;
      const action = form.getAttribute("action");
      const method = (form.getAttribute("method") ?? "get").toLowerCase();
      if (method === "get" && action?.startsWith("/")) setPending(true);
    };
    document.addEventListener("click", onClick, true);
    document.addEventListener("submit", onSubmit, true);
    return () => {
      document.removeEventListener("click", onClick, true);
      document.removeEventListener("submit", onSubmit, true);
    };
  }, []);

  useEffect(() => {
    if (!pending) return;
    const t = setTimeout(() => setPending(false), GIVE_UP_MS);
    return () => clearTimeout(t);
  }, [pending]);

  if (!pending) return null;
  return (
    <div className={styles.navSpinner} role="status" aria-live="polite">
      <Spinner size="sm" /> Loading…
    </div>
  );
}
