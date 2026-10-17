"use client";

import { useState, useTransition } from "react";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";
import { SelectField } from "@/components/ui/SelectField";
import { TextArea } from "@/components/ui/TextArea";
import { TextField } from "@/components/ui/TextField";
import { useToast } from "@/components/ui/Toast";
import { LOST_REASONS, REPLY_TYPES } from "@/lib/db/enums";
import { logActivity } from "@/server/actions/leads";
import type { Choice } from "@/server/leads/options";
import styles from "./leads.module.scss";

type Action =
  | "requestSent"
  | "accepted"
  | "message1Sent"
  | "followUpSent"
  | "gotReply"
  | "demoBooked"
  | "demoHeld"
  | "markConverted"
  | "markLost";

/** Actions that ask one more thing first (and take an optional note). */
const NEEDS_DETAIL: Partial<Record<Action, string>> = {
  message1Sent: "Message 1 sent",
  gotReply: "Got a reply",
  demoBooked: "Demo booked",
  markLost: "Mark lost",
};

type Props = {
  personId: string;
  /** "Follow-up 1 sent" / "Follow-up 2 sent" / "Break-up sent", or null when none is due. */
  followUpLabel: string | null;
  templates: Choice[];
  defaultTemplateId: string | null;
  today: string;
};

/** "Log what happened": one click logs the activity and moves the lead along (F15). */
export function QuickLogBar({
  personId,
  followUpLabel,
  templates,
  defaultTemplateId,
  today,
}: Props) {
  const notify = useToast();
  const [busy, startTransition] = useTransition();
  const [running, setRunning] = useState<Action | null>(null);
  const [detail, setDetail] = useState<Action | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [templateId, setTemplateId] = useState(defaultTemplateId ?? "");
  const [replyType, setReplyType] = useState("");
  const [demoDate, setDemoDate] = useState(today);
  const [lostReason, setLostReason] = useState("");

  const send = (action: Action, extra: Record<string, unknown> = {}, withNote?: string) => {
    setRunning(action);
    startTransition(async () => {
      const result = await logActivity(personId, { action, ...extra }, withNote);
      setRunning(null);
      if (result.ok) {
        notify("success", result.message ?? "Logged.");
        setDetail(null);
        setNote("");
        setError(null);
      } else if (detail) {
        setError(result.error);
      } else {
        notify("error", result.error);
      }
    });
  };

  const open = (action: Action) => {
    setError(null);
    setNote("");
    setDetail(action);
  };

  const click = (action: Action) => (NEEDS_DETAIL[action] ? open(action) : send(action));

  const submitDetail = (e: React.FormEvent) => {
    e.preventDefault();
    if (!detail) return;
    const extra =
      detail === "message1Sent"
        ? { templateId: templateId || null }
        : detail === "gotReply"
          ? { replyType }
          : detail === "demoBooked"
            ? { demoDate }
            : { lostReason };
    send(detail, extra, note);
  };

  const button = (action: Action, label: string, variant: "secondary" | "danger" = "secondary") => (
    <Button
      variant={variant}
      onClick={() => click(action)}
      loading={running === action && !detail}
      disabled={busy}
    >
      {label}
    </Button>
  );

  return (
    <section className={`${styles.panel} ${styles.quickLogPanel}`} aria-label="Log what happened">
      <h2 className={styles.panelTitle}>Log what happened</h2>
      <div className={styles.quickLog}>
        {button("requestSent", "Request sent")}
        {button("accepted", "Accepted")}
        {button("message1Sent", "Message 1 sent")}
        {followUpLabel && button("followUpSent", followUpLabel)}
        {button("gotReply", "Got a reply")}
        {button("demoBooked", "Demo booked")}
        {button("demoHeld", "Demo held")}
        {button("markConverted", "Mark converted")}
        {button("markLost", "Mark lost", "danger")}
      </div>

      <Dialog
        open={detail !== null}
        onOpenChange={(o) => !o && setDetail(null)}
        title={detail ? (NEEDS_DETAIL[detail] ?? "") : ""}
      >
        <form className={styles.form} onSubmit={submitDetail} noValidate>
          {error && <Alert tone="error">{error}</Alert>}
          {detail === "message1Sent" && (
            <SelectField
              label="Template used (optional)"
              value={templateId}
              onChange={(e) => setTemplateId(e.target.value)}
              options={[
                { value: "", label: "None" },
                ...templates.map((t) => ({ value: t.id, label: t.label })),
              ]}
            />
          )}
          {detail === "gotReply" && (
            <SelectField
              label="Reply type"
              value={replyType}
              onChange={(e) => setReplyType(e.target.value)}
              options={[
                { value: "", label: "Choose…" },
                ...REPLY_TYPES.map((r) => ({ value: r, label: r })),
              ]}
            />
          )}
          {detail === "demoBooked" && (
            <TextField
              label="Demo date"
              type="date"
              value={demoDate}
              onChange={(e) => setDemoDate(e.target.value)}
            />
          )}
          {detail === "markLost" && (
            <SelectField
              label="Lost reason"
              value={lostReason}
              onChange={(e) => setLostReason(e.target.value)}
              options={[
                { value: "", label: "Choose…" },
                ...LOST_REASONS.map((r) => ({ value: r, label: r })),
              ]}
            />
          )}
          <TextArea
            label="Note (optional)"
            rows={3}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            maxLength={5000}
          />
          <div className={styles.formActions}>
            <Button variant="secondary" onClick={() => setDetail(null)} disabled={busy}>
              Cancel
            </Button>
            <Button type="submit" loading={busy}>
              Log it
            </Button>
          </div>
        </form>
      </Dialog>
    </section>
  );
}
