"use client";

import { Video } from "lucide-react";
import { useState, useTransition } from "react";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { checkGoogleMeet } from "@/server/actions/calendar";
import styles from "./calendar.module.scss";

/**
 * Check Google Meet (D-053): makes a test meeting in Google, opens it to anyone, checks it and
 * deletes it, then opens the rep's upcoming meetings. Shows success or exactly what to fix.
 */
export function CheckMeetButton() {
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, start] = useTransition();
  return (
    <div className={styles.stack}>
      <div>
        <Button
          variant="secondary"
          loading={busy}
          onClick={() =>
            start(async () => {
              const r = await checkGoogleMeet();
              setResult(
                r.ok ? { ok: true, text: r.message ?? "Done." } : { ok: false, text: r.error },
              );
            })
          }
        >
          <Video size={16} aria-hidden /> Check Google Meet
        </Button>
      </div>
      {result && <Alert tone={result.ok ? "success" : "error"}>{result.text}</Alert>}
    </div>
  );
}
