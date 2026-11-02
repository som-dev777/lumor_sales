"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { TextArea } from "@/components/ui/TextArea";
import { cancelMyBooking, rescheduleMyBooking } from "@/server/actions/calendar";
import { SlotPicker, useTimeZone } from "./SlotPicker";
import styles from "./calendar.module.scss";

/** Reschedule or cancel from the visitor's private link (F22). */
export function ManageBooking({ code, slots }: { code: string; slots: string[] }) {
  const router = useRouter();
  const tz = useTimeZone();
  const [mode, setMode] = useState<"none" | "reschedule" | "cancel">("none");
  const [slot, setSlot] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, start] = useTransition();

  return (
    <div className={styles.stack}>
      {error && <Alert tone="error">{error}</Alert>}
      {mode === "none" && (
        <div className={styles.row}>
          <Button variant="secondary" onClick={() => setMode("reschedule")}>
            Reschedule
          </Button>
          <Button variant="ghost" onClick={() => setMode("cancel")}>
            Cancel booking
          </Button>
        </div>
      )}
      {mode === "reschedule" && (
        <>
          <SlotPicker slots={slots} value={slot} onChange={setSlot} tz={tz} />
          <div className={styles.row}>
            <Button
              disabled={!slot}
              loading={busy}
              onClick={() =>
                start(async () => {
                  setError(null);
                  const r = await rescheduleMyBooking(code, slot!);
                  if (r.ok) router.push(`/booking/${r.token}?moved=1`);
                  else setError(r.error);
                })
              }
            >
              Move to this time
            </Button>
            <Button variant="ghost" onClick={() => setMode("none")} disabled={busy}>
              Keep the current time
            </Button>
          </div>
        </>
      )}
      {mode === "cancel" && (
        <>
          <TextArea
            label="Reason (optional)"
            rows={2}
            value={reason}
            maxLength={500}
            onChange={(e) => setReason(e.target.value)}
          />
          <div className={styles.row}>
            <Button
              variant="danger"
              loading={busy}
              onClick={() =>
                start(async () => {
                  setError(null);
                  const r = await cancelMyBooking(code, reason);
                  if (r.ok) router.refresh();
                  else setError(r.error);
                })
              }
            >
              Yes, cancel it
            </Button>
            <Button variant="ghost" onClick={() => setMode("none")} disabled={busy}>
              Keep it
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
