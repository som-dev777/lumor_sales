"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/Button";
import { TextField } from "@/components/ui/TextField";
import { useToast } from "@/components/ui/Toast";
import { saveCalendar } from "@/server/actions/ai-resources";
import styles from "./ai-resources.module.scss";

/** Admin only: the demo booking link the AI offers (F20). The server checks the role again. */
export function CalendarLinkForm({ current }: { current: string | null }) {
  const notify = useToast();
  const [value, setValue] = useState(current ?? "");
  const [error, setError] = useState<string | null>(null);
  const [busy, start] = useTransition();
  return (
    <form
      className={styles.inlineForm}
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          const r = await saveCalendar({ calendarLink: value });
          setError(r.ok ? null : (r.fieldErrors?.calendarLink ?? r.error));
          notify(r.ok ? "success" : "error", r.ok ? (r.message ?? "Saved.") : r.error);
        });
      }}
    >
      <TextField
        label="Calendar link for demos"
        type="url"
        placeholder="https://"
        value={value}
        error={error ?? undefined}
        onChange={(e) => setValue(e.target.value)}
      />
      <Button type="submit" variant="secondary" loading={busy}>
        Save link
      </Button>
    </form>
  );
}
