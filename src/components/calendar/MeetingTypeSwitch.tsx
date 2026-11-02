"use client";

import { useTransition } from "react";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";
import { switchMeetingType } from "@/server/actions/calendar";

/** Turns a meeting type's booking page on or off; the link stays the same (F22). */
export function MeetingTypeSwitch({
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
  return (
    <Button
      variant="secondary"
      loading={busy}
      aria-label={`${active ? "Switch off" : "Switch on"} ${name}`}
      onClick={() =>
        start(async () => {
          const r = await switchMeetingType(id, !active);
          notify(r.ok ? "success" : "error", r.ok ? (r.message ?? "Saved.") : r.error);
        })
      }
    >
      {active ? "Switch off" : "Switch on"}
    </Button>
  );
}
