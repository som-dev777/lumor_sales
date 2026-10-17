"use client";

import { useState, useTransition } from "react";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";
import { SelectField } from "@/components/ui/SelectField";
import { TextArea } from "@/components/ui/TextArea";
import { TextField } from "@/components/ui/TextField";
import { useToast } from "@/components/ui/Toast";
import { CALL_OUTCOMES, LOST_REASONS, REPLY_TYPES } from "@/lib/db/enums";
import { logActivity } from "@/server/actions/leads";
import type { Choice } from "@/server/leads/options";
import styles from "./leads.module.scss";

type Action =
  | "requestSent"
  | "accepted"
  | "messageSent"
  | "callLogged"
  | "gotReply"
  | "meetingBooked"
  | "meetingHeld"
  | "proposalSent"
  | "markConverted"
  | "markLost";

/** Actions that ask one more thing first (and take an optional note). */
const NEEDS_DETAIL: Partial<Record<Action, string>> = {
  requestSent: "Connection request sent",
  messageSent: "Message sent",
  callLogged: "Call",
  gotReply: "Got a reply",
  meetingBooked: "Meeting booked",
  markLost: "Mark lost",
};

/** The plan step a quick-log could stand for (F17: "Is this step N of their plan?"). */
export type CurrentStep = { order: number; action: "requestSent" | "messageSent" | "callLogged" };

type Props = {
  personId: string;
  templates: Choice[];
  today: string;
  /** Set when the person is on an active plan whose current step matches a quick-log. */
  currentStep?: CurrentStep | null;
};

type Warning = { rule: number; message: string };

/** "Log what happened": one click logs the activity and moves the lead along (F15, v2). */
export function QuickLogBar({ personId, templates, today, currentStep = null }: Props) {
  const notify = useToast();
  const [busy, startTransition] = useTransition();
  const [running, setRunning] = useState<Action | null>(null);
  const [detail, setDetail] = useState<Action | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [withNote, setWithNote] = useState(false);
  const [channel, setChannel] = useState("LinkedIn");
  const [templateId, setTemplateId] = useState("");
  const [outcome, setOutcome] = useState("");
  const [replyType, setReplyType] = useState("");
  const [meetingDate, setMeetingDate] = useState(today);
  const [lostReason, setLostReason] = useState("");
  // Two questions the server may need answered before logging (F17).
  const [askStep, setAskStep] = useState<{ input: Record<string, unknown>; note?: string } | null>(
    null,
  );
  const [warnings, setWarnings] = useState<{
    list: Warning[];
    input: Record<string, unknown>;
    note?: string;
    asStep?: boolean;
  } | null>(null);

  const reset = () => {
    setDetail(null);
    setNote("");
    setError(null);
    setAskStep(null);
    setWarnings(null);
  };

  const send = (
    input: Record<string, unknown>,
    withText?: string,
    opts: { asStep?: boolean; override?: boolean } = {},
  ) => {
    setRunning(input.action as Action);
    startTransition(async () => {
      const result = await logActivity(personId, input, withText, opts);
      setRunning(null);
      if (result.ok) {
        notify("success", result.message ?? "Logged.");
        reset();
      } else if (result.warnings?.length) {
        setAskStep(null);
        setWarnings({ list: result.warnings, input, note: withText, asStep: opts.asStep });
      } else if (detail) {
        setError(result.error);
      } else {
        notify("error", result.error);
      }
    });
  };

  /** Before logging an outreach touch, ask if it's the plan's current step. */
  const submit = (input: Record<string, unknown>, withText?: string) => {
    if (currentStep && currentStep.action === input.action) {
      setAskStep({ input, note: withText });
      return;
    }
    send(input, withText);
  };

  const open = (action: Action) => {
    setError(null);
    setNote("");
    setDetail(action);
  };

  const click = (action: Action) => (NEEDS_DETAIL[action] ? open(action) : submit({ action }));

  const submitDetail = (e: React.FormEvent) => {
    e.preventDefault();
    if (!detail) return;
    const input: Record<string, unknown> = { action: detail };
    if (detail === "requestSent") input.withNote = withNote;
    if (detail === "messageSent") Object.assign(input, { channel, templateId: templateId || null });
    if (detail === "callLogged") input.outcome = outcome;
    if (detail === "gotReply") input.replyType = replyType;
    if (detail === "meetingBooked") input.meetingDate = meetingDate;
    if (detail === "markLost") input.lostReason = lostReason;
    submit(input, note);
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
        {button("messageSent", "Message sent")}
        {button("callLogged", "Call")}
        {button("gotReply", "Got a reply")}
        {button("meetingBooked", "Meeting booked")}
        {button("meetingHeld", "Meeting held")}
        {button("proposalSent", "Proposal sent")}
        {button("markConverted", "Mark converted")}
        {button("markLost", "Mark lost", "danger")}
      </div>

      <Dialog
        open={detail !== null && !askStep && !warnings}
        onOpenChange={(o) => !o && reset()}
        title={detail ? (NEEDS_DETAIL[detail] ?? "") : ""}
      >
        <form className={styles.form} onSubmit={submitDetail} noValidate>
          {error && <Alert tone="error">{error}</Alert>}
          {detail === "requestSent" && (
            <label className={styles.checkRow}>
              <input
                type="checkbox"
                checked={withNote}
                onChange={(e) => setWithNote(e.target.checked)}
              />
              Sent with a note (a note counts as a touch)
            </label>
          )}
          {detail === "messageSent" && (
            <>
              <SelectField
                label="Channel"
                value={channel}
                onChange={(e) => setChannel(e.target.value)}
                options={["LinkedIn", "InMail", "Email", "WhatsApp"].map((c) => ({
                  value: c,
                  label: c === "LinkedIn" ? "LinkedIn message" : c,
                }))}
              />
              <SelectField
                label="Template used (optional)"
                value={templateId}
                onChange={(e) => setTemplateId(e.target.value)}
                options={[
                  { value: "", label: "None" },
                  ...templates.map((t) => ({ value: t.id, label: t.label })),
                ]}
              />
            </>
          )}
          {detail === "callLogged" && (
            <SelectField
              label="Call outcome"
              value={outcome}
              onChange={(e) => setOutcome(e.target.value)}
              options={[
                { value: "", label: "Choose…" },
                ...CALL_OUTCOMES.map((r) => ({ value: r, label: r })),
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
          {detail === "meetingBooked" && (
            <TextField
              label="Meeting date"
              type="date"
              value={meetingDate}
              onChange={(e) => setMeetingDate(e.target.value)}
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
            <Button variant="secondary" onClick={reset} disabled={busy}>
              Cancel
            </Button>
            <Button type="submit" loading={busy}>
              Log it
            </Button>
          </div>
        </form>
      </Dialog>

      <Dialog
        open={askStep !== null}
        onOpenChange={(o) => !o && reset()}
        title={`Is this step ${currentStep?.order ?? ""} of their plan?`}
      >
        <div className={styles.form}>
          <p>
            Yes moves their plan on to the next step. No logs it as an extra touch, checked against
            the cadence guardrails.
          </p>
          <div className={styles.formActions}>
            <Button
              variant="secondary"
              disabled={busy}
              onClick={() => askStep && send(askStep.input, askStep.note)}
            >
              No, an extra touch
            </Button>
            <Button
              loading={busy}
              onClick={() => askStep && send(askStep.input, askStep.note, { asStep: true })}
            >
              Yes, step {currentStep?.order}
            </Button>
          </div>
        </div>
      </Dialog>

      <Dialog
        open={warnings !== null}
        onOpenChange={(o) => !o && reset()}
        title="This breaks a cadence guardrail"
      >
        <div className={styles.form}>
          <Alert tone="warning">
            <ul className={styles.plainList}>
              {warnings?.list.map((w) => (
                <li key={w.rule}>{w.message}</li>
              ))}
            </ul>
          </Alert>
          <p>Logging anyway is recorded in the audit log.</p>
          <div className={styles.formActions}>
            <Button variant="secondary" onClick={reset} disabled={busy}>
              Cancel
            </Button>
            <Button
              loading={busy}
              onClick={() =>
                warnings &&
                send(warnings.input, warnings.note, { asStep: warnings.asStep, override: true })
              }
            >
              Log anyway
            </Button>
          </div>
        </div>
      </Dialog>
    </section>
  );
}
