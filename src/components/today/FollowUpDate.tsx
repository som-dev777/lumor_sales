"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";
import { setFollowUpTask } from "@/server/actions/ai";
import styles from "./today.module.scss";

const plusDays = (date: string, n: number) => {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
};

/**
 * A person's follow-up date next to what was logged (D-059): shown when set and ready to change;
 * when there's none, Set follow-up offers tomorrow. Saves like Set next follow-up.
 */
export function FollowUpDate({
  personId,
  name,
  nextAction,
  date,
  today,
  canEdit,
}: {
  personId: string;
  name: string;
  nextAction: string | null;
  date: string | null;
  today: string;
  canEdit: boolean;
}) {
  const notify = useToast();
  const [value, setValue] = useState(date ?? plusDays(today, 1));
  const [adding, setAdding] = useState(false);
  const [busy, start] = useTransition();
  const label = date ? `Follow-up${nextAction ? `: ${nextAction}` : ""}` : "No follow-up";

  if (!canEdit) {
    return <span className={styles.followUpText}>{date ? `${label} · ${date}` : label}</span>;
  }
  if (!date && !adding) {
    return (
      <span className={styles.followUp}>
        <span className={styles.followUpText}>{label}</span>
        <Button
          variant="ghost"
          onClick={() => setAdding(true)}
          aria-label={`Set a follow-up for ${name}`}
        >
          Set follow-up
        </Button>
      </span>
    );
  }
  const changed = value !== date;
  return (
    <span className={styles.followUp}>
      <label className={styles.followUpText}>
        {date ? label : "Follow-up"}
        <input
          type="date"
          className={styles.followUpInput}
          min={today}
          value={value}
          aria-label={`Follow-up date for ${name}`}
          onChange={(e) => setValue(e.target.value)}
        />
      </label>
      {changed && value && (
        <Button
          variant="secondary"
          loading={busy}
          onClick={() =>
            start(async () => {
              const r = await setFollowUpTask(personId, nextAction ?? "", value);
              notify(r.ok ? "success" : "error", r.ok ? `Follow-up saved for ${name}.` : r.error);
              if (r.ok) setAdding(false);
            })
          }
        >
          Save
        </Button>
      )}
    </span>
  );
}
