"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/Button";
import { TextField } from "@/components/ui/TextField";
import { useToast } from "@/components/ui/Toast";
import { setTestDate } from "@/server/actions/clock";
import styles from "./TestDateSwitch.module.scss";

/** Local testing only (D-033 F10): pretend today is another date for plans and Today. */
export function TestDateSwitch({ current }: { current: string | null }) {
  const notify = useToast();
  const [date, setDate] = useState(current ?? "");
  const [busy, start] = useTransition();
  const run = (value: string | null) =>
    start(async () => {
      const r = await setTestDate(value);
      notify(r.ok ? "success" : "error", r.ok ? (r.message ?? "Done.") : r.error);
    });
  return (
    <section className={styles.box} aria-label="Test date">
      <h2 className={styles.title}>Test date (local testing only)</h2>
      <p className={styles.muted}>
        {current ? `Plans and Today think it's ${current}.` : "Using the real date."} This switch
        only exists on a local test database; it never works online.
      </p>
      <div className={styles.row}>
        <TextField
          label="Pretend today is"
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
        />
        <Button disabled={!date || busy} onClick={() => run(date)}>
          Use this date
        </Button>
        {current && (
          <Button variant="secondary" disabled={busy} onClick={() => run(null)}>
            Back to today
          </Button>
        )}
      </div>
    </section>
  );
}
