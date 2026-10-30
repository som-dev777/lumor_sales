"use client";

import { useTransition } from "react";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";
import { removeSchedule, runNow, switchSchedule } from "@/server/actions/reports";

/** Run now, switch on or off, and delete (only when it hasn't made reports yet). */
export function ScheduleActions({
  id,
  name,
  active,
}: {
  id: string;
  name: string;
  active: boolean;
}) {
  const notify = useToast();
  const [busy, start] = useTransition();
  const act = (fn: () => ReturnType<typeof runNow>) =>
    start(async () => {
      const r = await fn();
      notify(r.ok ? "success" : "error", r.ok ? (r.message ?? "Done.") : r.error);
    });
  return (
    <>
      <Button
        variant="secondary"
        disabled={busy}
        onClick={() => act(() => runNow(id))}
        aria-label={`Run ${name} now`}
      >
        Run now
      </Button>
      <Button
        variant="secondary"
        disabled={busy}
        onClick={() => act(() => switchSchedule(id, !active))}
        aria-label={`Switch ${name} ${active ? "off" : "on"}`}
      >
        {active ? "Switch off" : "Switch on"}
      </Button>
      <Button
        variant="ghost"
        disabled={busy}
        onClick={() => act(() => removeSchedule(id))}
        aria-label={`Delete ${name}`}
      >
        Delete
      </Button>
    </>
  );
}
