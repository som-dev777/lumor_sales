"use client";

import { CalendarPlus, Pencil } from "lucide-react";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";
import { TextField } from "@/components/ui/TextField";
import { useToast } from "@/components/ui/Toast";
import { setFollowUpTask } from "@/server/actions/ai";
import styles from "./leads.module.scss";

const plusDays = (date: string, n: number) => {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
};

/**
 * Add follow-up / Edit on the People list (D-057): what to do next and when. Saves like Set next
 * follow-up on Today, so Today shows it on that day.
 */
export function FollowUpButton({
  personId,
  name,
  nextAction,
  nextActionDate,
  today,
}: {
  personId: string;
  name: string;
  nextAction: string | null;
  /** The current follow-up date (IST), or null when there's none. */
  nextActionDate: string | null;
  /** Today in IST (the app's clock). */
  today: string;
}) {
  const notify = useToast();
  const [open, setOpen] = useState(false);
  const [what, setWhat] = useState(nextAction ?? "");
  const [date, setDate] = useState(
    nextActionDate && nextActionDate >= today ? nextActionDate : plusDays(today, 1),
  );
  const [busy, start] = useTransition();
  const has = Boolean(nextActionDate);
  return (
    <>
      <Button
        variant="ghost"
        className={styles.followUpButton}
        onClick={() => setOpen(true)}
        aria-label={has ? `Edit the follow-up for ${name}` : `Add a follow-up for ${name}`}
      >
        {has ? <Pencil size={14} aria-hidden /> : <CalendarPlus size={14} aria-hidden />}
        {has ? "Edit" : "Add follow-up"}
      </Button>
      <Dialog
        open={open}
        onOpenChange={setOpen}
        title={has ? `Follow-up with ${name}` : `Add a follow-up for ${name}`}
        description="It shows on Today on that day."
      >
        <form
          className={styles.form}
          onSubmit={(e) => {
            e.preventDefault();
            start(async () => {
              const r = await setFollowUpTask(personId, what, date);
              notify(r.ok ? "success" : "error", r.ok ? `Follow-up saved for ${name}.` : r.error);
              if (r.ok) setOpen(false);
            });
          }}
        >
          <TextField
            label="Next action"
            placeholder="e.g. Call to fix a demo slot"
            maxLength={200}
            value={what}
            onChange={(e) => setWhat(e.target.value)}
          />
          <div className={styles.quickDates} role="group" aria-label="Quick dates">
            {[
              { label: "Tomorrow", d: plusDays(today, 1) },
              { label: "In 3 days", d: plusDays(today, 3) },
              { label: "In a week", d: plusDays(today, 7) },
            ].map((c) => (
              <Button
                key={c.label}
                variant={date === c.d ? "primary" : "secondary"}
                onClick={() => setDate(c.d)}
              >
                {c.label}
              </Button>
            ))}
          </div>
          <TextField
            label="Follow-up date"
            type="date"
            min={today}
            required
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
          <div className={styles.formActions}>
            <Button variant="secondary" onClick={() => setOpen(false)} disabled={busy}>
              Cancel
            </Button>
            <Button type="submit" loading={busy} disabled={!date}>
              Save follow-up
            </Button>
          </div>
        </form>
      </Dialog>
    </>
  );
}
