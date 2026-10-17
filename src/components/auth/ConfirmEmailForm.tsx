"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useState, useTransition } from "react";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { confirmMyEmail } from "@/server/actions/auth";
import styles from "./AuthForm.module.scss";

/** The page behind the emailed sign-up link (D-023). A button, so link previews can't confirm. */
export function ConfirmEmailForm() {
  const token = useSearchParams().get("token") ?? "";
  const [error, setError] = useState<string | null>(null);
  const [busy, startTransition] = useTransition();

  return (
    <>
      <h1 className={styles.title}>Confirm your email</h1>
      <div className={styles.stack}>
        {!token ? (
          <Alert tone="error">This link is missing its code. Log in to get a new one.</Alert>
        ) : (
          <>
            {error && <Alert tone="error">{error}</Alert>}
            <Button
              fullWidth
              loading={busy}
              onClick={() =>
                startTransition(async () => {
                  const result = await confirmMyEmail(token);
                  if (!result.ok) setError(result.error);
                })
              }
            >
              Confirm my email
            </Button>
          </>
        )}
        <Link href="/login">Back to log in</Link>
      </div>
    </>
  );
}
