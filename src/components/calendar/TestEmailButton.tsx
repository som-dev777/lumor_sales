"use client";

import { Mail } from "lucide-react";
import { useState, useTransition } from "react";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { sendTestEmail } from "@/server/actions/calendar";
import styles from "./calendar.module.scss";

/** Send me a test email (D-047): shows that emails arrive, or exactly why they don't. */
export function TestEmailButton({ setup }: { setup: string }) {
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, start] = useTransition();
  return (
    <div className={styles.stack}>
      <p className={styles.muted}>{setup}</p>
      <div>
        <Button
          variant="secondary"
          loading={busy}
          onClick={() =>
            start(async () => {
              const r = await sendTestEmail();
              setResult(
                r.ok ? { ok: true, text: r.message ?? "Sent." } : { ok: false, text: r.error },
              );
            })
          }
        >
          <Mail size={16} aria-hidden /> Send me a test email
        </Button>
      </div>
      {result && <Alert tone={result.ok ? "success" : "error"}>{result.text}</Alert>}
    </div>
  );
}
