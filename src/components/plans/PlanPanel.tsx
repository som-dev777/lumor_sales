"use client";

import { Copy, Mail } from "lucide-react";
import { useState, useTransition } from "react";
import { Alert } from "@/components/ui/Alert";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";
import { SelectField } from "@/components/ui/SelectField";
import { TextArea } from "@/components/ui/TextArea";
import { TextField } from "@/components/ui/TextField";
import { useToast } from "@/components/ui/Toast";
import { CALL_OUTCOMES, type CallOutcome } from "@/lib/db/enums";
import { doStep, enrol, planCommand, switchTo, type StepResult } from "@/server/actions/plans";
import styles from "./plans.module.scss";

export type PanelPlan = {
  planName: string;
  planType: string;
  version: number;
  status: "Active" | "Paused";
  stepOrder: number;
  stepCount: number;
  channel: string | null;
  message: string | null;
  script: string | null;
  nextDueDate: string | null;
  nextDueLabel: string | null;
  overdue: boolean;
  dueToday: boolean;
  waiting: boolean;
  withdrawDue: boolean;
  finished: boolean;
  timeUp: boolean;
};

type Props = {
  personId: string;
  personName: string;
  email: string | null;
  plan: PanelPlan | null;
  usablePlans: { id: string; label: string; planType: string }[];
  /** A plan type the stage suggests (Meeting done → Meeting follow-up…). */
  suggestedType: string | null;
  nurtureUntil: string | null;
  nurtureEnded: boolean;
  today: string;
};

const MESSAGE_CHANNELS = ["LinkedIn message", "InMail", "Email", "WhatsApp"];

/** The person's plan (F17): the current step with its message or script, and the controls. */
export function PlanPanel(props: Props) {
  const { personId, plan, usablePlans } = props;
  const notify = useToast();
  const [busy, start] = useTransition();
  const [choice, setChoice] = useState("");
  const [text, setText] = useState(plan?.message ?? "");
  const [note, setNote] = useState("");
  const [callBack, setCallBack] = useState(props.today);
  const [warnings, setWarnings] = useState<{
    input: Record<string, unknown>;
    list: string[];
  } | null>(null);

  const say = (r: { ok: boolean; message?: string; error?: string }) =>
    notify(
      r.ok ? "success" : "error",
      r.ok ? (r.message ?? "Done.") : (r.error ?? "Something went wrong."),
    );

  const step = (input: Record<string, unknown>) =>
    start(async () => {
      const r: StepResult = await doStep(personId, input);
      if (!r.ok && r.warnings?.length) {
        setWarnings({ input, list: r.warnings.map((w) => w.message) });
        return;
      }
      setWarnings(null);
      say(r);
      if (r.ok) setNote("");
    });
  const command = (c: Parameters<typeof planCommand>[1]) =>
    start(async () => say(await planCommand(personId, c)));
  const offered = props.suggestedType
    ? usablePlans.filter((p) => p.planType === props.suggestedType)
    : [];

  const picker = (label: string, onPick: (id: string) => void, list = usablePlans) => (
    <div className={styles.row}>
      <SelectField
        label={label}
        value={choice}
        onChange={(e) => setChoice(e.target.value)}
        options={[
          { value: "", label: "Choose a plan…" },
          ...list.map((p) => ({ value: p.id, label: p.label })),
        ]}
      />
      <Button disabled={!choice || busy} onClick={() => onPick(choice)}>
        {plan ? "Switch" : "Enrol"}
      </Button>
    </div>
  );

  return (
    <section className={styles.card} aria-label="Plan">
      <h2 className={styles.stepTitle}>Plan</h2>

      {props.suggestedType && offered.length > 0 && plan?.planType !== props.suggestedType && (
        <Alert tone="info">
          This stage suggests a {props.suggestedType} plan.{" "}
          {plan ? "Switch below when you're ready." : "Choose one below."}
        </Alert>
      )}

      {!plan && (
        <>
          {props.nurtureUntil && !props.nurtureEnded ? (
            <p className={styles.muted}>
              In Nurture until {props.nurtureUntil}: no touches until then.
            </p>
          ) : props.nurtureEnded ? (
            <>
              <p>Nurture has ended. Enrol {props.personName} in a plan again, or mark them Lost.</p>
              <Button variant="danger" disabled={busy} onClick={() => command("nurtureLost")}>
                Mark Lost
              </Button>
            </>
          ) : (
            <p className={styles.muted}>Not on a plan.</p>
          )}
          {(!props.nurtureUntil || props.nurtureEnded) &&
            picker(
              "Enrol in a plan",
              (id) => start(async () => say(await enrol([personId], id))),
              offered.length
                ? [...offered, ...usablePlans.filter((p) => !offered.includes(p))]
                : usablePlans,
            )}
        </>
      )}

      {plan && (
        <>
          <div className={styles.badges}>
            <Badge tone="primary">{plan.planName}</Badge>
            <Badge tone="neutral">version {plan.version}</Badge>
            {plan.status === "Paused" && <Badge tone="warning">Paused</Badge>}
            {plan.waiting && <Badge tone="neutral">Waiting for acceptance</Badge>}
            {plan.overdue && <Badge tone="danger">Overdue</Badge>}
            {plan.dueToday && <Badge tone="success">Due today</Badge>}
            {plan.finished && <Badge tone="warning">Finished</Badge>}
          </div>

          {plan.finished ? (
            <div className={styles.form}>
              <p>
                {plan.timeUp ? "The plan's time limit has passed" : "All steps are done"} with no
                reply. Choose what happens next:
              </p>
              <div className={styles.row}>
                <Button disabled={busy} onClick={() => command("nurture")}>
                  Nurture (60 days)
                </Button>
                <Button variant="danger" disabled={busy} onClick={() => command("lost")}>
                  Lost (No response)
                </Button>
              </div>
            </div>
          ) : plan.status === "Paused" ? (
            <div className={styles.form}>
              <p>
                Paused at step {plan.stepOrder} of {plan.stepCount}. Resume when the conversation
                goes quiet.
              </p>
              <div className={styles.row}>
                <Button disabled={busy} onClick={() => command("resume")}>
                  Resume
                </Button>
              </div>
            </div>
          ) : plan.waiting ? (
            <div className={styles.form}>
              <p>
                Waiting for {props.personName} to accept the connection request. Log{" "}
                <strong>Accepted</strong> below when they do
                {plan.nextDueLabel ? `; withdraw on ${plan.nextDueLabel} if they haven't` : ""}.
              </p>
              {plan.withdrawDue && (
                <div className={styles.row}>
                  <Button variant="secondary" disabled={busy} onClick={() => command("withdraw")}>
                    Withdraw invite
                  </Button>
                </div>
              )}
            </div>
          ) : (
            <div className={styles.form}>
              <p>
                <strong>
                  Step {plan.stepOrder} of {plan.stepCount}: {plan.channel}
                </strong>
                {plan.nextDueLabel && (
                  <span className={styles.muted}> · due {plan.nextDueLabel}</span>
                )}
              </p>
              {plan.channel === "LinkedIn connection request" && (
                <>
                  <p className={styles.muted}>
                    Send the connection request on LinkedIn
                    {plan.script ? " with this note:" : " (no note)"}.
                  </p>
                  {plan.script && <p className={styles.script}>{plan.script}</p>}
                  <div className={styles.row}>
                    <Button disabled={busy} onClick={() => step({})}>
                      Done: request sent
                    </Button>
                  </div>
                </>
              )}
              {plan.channel && MESSAGE_CHANNELS.includes(plan.channel) && (
                <>
                  <TextArea
                    label="Message"
                    rows={5}
                    value={text}
                    maxLength={5000}
                    onChange={(e) => setText(e.target.value)}
                  />
                  <div className={styles.row}>
                    <Button
                      variant="secondary"
                      onClick={async () => {
                        try {
                          await navigator.clipboard.writeText(text);
                          notify("success", "Copied.");
                        } catch {
                          notify("error", "Couldn't copy. Select the text and copy it instead.");
                        }
                      }}
                    >
                      <Copy size={16} aria-hidden /> Copy
                    </Button>
                    {plan.channel === "Email" && props.email && (
                      <a
                        className={styles.linkButton}
                        href={`mailto:${props.email}?subject=${encodeURIComponent("Lumor")}&body=${encodeURIComponent(text)}`}
                      >
                        <Mail size={16} aria-hidden /> Open in mail app
                      </a>
                    )}
                    <Button disabled={busy || !text.trim()} onClick={() => step({ text })}>
                      Done: sent
                    </Button>
                  </div>
                </>
              )}
              {plan.channel === "Call" && (
                <>
                  {plan.script && <p className={styles.script}>{plan.script}</p>}
                  <TextArea
                    label="Call notes (optional)"
                    rows={2}
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                  />
                  <TextField
                    label="Call back on"
                    type="date"
                    value={callBack}
                    onChange={(e) => setCallBack(e.target.value)}
                  />
                  <div className={styles.row} role="group" aria-label="Call outcome">
                    {CALL_OUTCOMES.map((o) => (
                      <Button
                        key={o}
                        variant={o === "Not interested" ? "danger" : "secondary"}
                        disabled={busy}
                        onClick={() =>
                          step({
                            outcome: o as CallOutcome,
                            text: note || null,
                            ...(o === "Call back later" ? { callBackDate: callBack } : {}),
                          })
                        }
                      >
                        {o}
                      </Button>
                    ))}
                  </div>
                </>
              )}
              {(plan.channel === "Manual task" || plan.channel === null) && (
                <>
                  {plan.script && <p className={styles.script}>{plan.script}</p>}
                  <div className={styles.row}>
                    <Button disabled={busy} onClick={() => step({ text: note || null })}>
                      Done
                    </Button>
                  </div>
                </>
              )}
              <div className={styles.row}>
                <Button variant="ghost" disabled={busy} onClick={() => command("snooze")}>
                  Snooze to tomorrow
                </Button>
                <Button variant="ghost" disabled={busy} onClick={() => command("pause")}>
                  Pause
                </Button>
              </div>
            </div>
          )}

          <details className={styles.more}>
            <summary>Switch or stop this plan</summary>
            {picker(
              "Switch to",
              (id) => start(async () => say(await switchTo(personId, id))),
              offered.length
                ? [...offered, ...usablePlans.filter((p) => !offered.includes(p))]
                : usablePlans,
            )}
            <Button variant="danger" disabled={busy} onClick={() => command("stop")}>
              Stop the plan
            </Button>
          </details>
        </>
      )}

      <Dialog
        open={warnings !== null}
        onOpenChange={(o) => !o && setWarnings(null)}
        title="This breaks a cadence guardrail"
      >
        <div className={styles.form}>
          <Alert tone="warning">
            <ul className={styles.findings}>
              {warnings?.list.map((w) => (
                <li key={w}>{w}</li>
              ))}
            </ul>
          </Alert>
          <p>Logging anyway is recorded in the audit log.</p>
          <div className={styles.row}>
            <Button variant="secondary" onClick={() => setWarnings(null)}>
              Cancel
            </Button>
            <Button
              loading={busy}
              onClick={() => warnings && step({ ...warnings.input, override: true })}
            >
              Log anyway
            </Button>
          </div>
        </div>
      </Dialog>
    </section>
  );
}
