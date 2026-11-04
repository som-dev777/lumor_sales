"use client";

import { Check, Clock, Mail, Sparkles, Trash2 } from "lucide-react";
import Link from "next/link";
import { useState, useTransition } from "react";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";
import { TextArea } from "@/components/ui/TextArea";
import { TextField } from "@/components/ui/TextField";
import { useToast } from "@/components/ui/Toast";
import { SECTIONS } from "@/lib/today-sections";
import { SuggestionCard } from "@/components/ai/SuggestionCard";
import {
  doneTask,
  rankMyDay,
  removeFollowUpTask,
  setFollowUpTask,
  snoozeTask,
  suggestNextMessage,
} from "@/server/actions/ai";
import { doStep, planCommand, type StepResult } from "@/server/actions/plans";
import type { Task, TodayPlan } from "@/server/today";
import styles from "./today.module.scss";

type Props = {
  tasks: Task[];
  outreach: TodayPlan["outreach"];
  aiReady: boolean;
  /** Today in IST, from the server (it follows the app's clock). */
  today: string;
};

/** Today's list (F08): grouped by section, or in the AI's order after Rank with AI. */
export function TodayList({ tasks, outreach, aiReady, today }: Props) {
  const [ranking, setRanking] = useState<{ order: Task[]; summary: string | null } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, start] = useTransition();

  const rank = () =>
    start(async () => {
      setError(null);
      const r = await rankMyDay();
      if (r.ok) setRanking({ order: r.data.tasks, summary: r.data.summary });
      else setError(r.error);
    });

  // Tasks done or snoozed since ranking drop out; new ones go at the end.
  const live = new Map(tasks.map((t) => [t.id, t]));
  const ranked = ranking
    ? [
        ...ranking.order.filter((t) => live.has(t.id)),
        ...tasks.filter((t) => !ranking.order.some((r) => r.id === t.id)),
      ]
    : null;

  return (
    <>
      <section className={styles.card} aria-label="Today's target">
        <div className={styles.targetHead}>
          <h2 className={styles.cardTitle}>New outreach</h2>
          <span className={styles.targetCount}>
            {outreach.sent} of {outreach.target} new people today
          </span>
        </div>
        <progress
          className={styles.bar}
          aria-label="New people reached today"
          value={Math.min(outreach.sent, outreach.target)}
          max={Math.max(outreach.target, 1)}
        />
        <p className={styles.muted}>
          {outreach.left > 0
            ? `${outreach.left} to go today. Adding a person or sending a connection request counts.`
            : "Target reached for today. Nice work."}
          {outreach.left > 0 && (outreach.persona || outreach.accountFilter) && (
            <>
              {" "}
              Suggested: {[outreach.persona, outreach.accountFilter].filter(Boolean).join(" in ")}.
            </>
          )}
        </p>
      </section>

      <div className={styles.toolbar}>
        <p className={styles.muted}>
          {tasks.length === 0
            ? "Nothing due. Time for new outreach."
            : `${tasks.length} ${tasks.length === 1 ? "task" : "tasks"} for today${
                tasks.some((t) => t.section === "backlog")
                  ? `, ${tasks.filter((t) => t.section === "backlog").length} of them from earlier days`
                  : ""
              }.`}
        </p>
        {tasks.length > 0 && (
          <Button variant="secondary" onClick={rank} loading={busy} disabled={!aiReady}>
            <Sparkles size={16} aria-hidden /> {ranking ? "Rank again" : "Rank with AI"}
          </Button>
        )}
      </div>
      {!aiReady && tasks.length > 0 && (
        <p className={styles.muted}>
          AI ranking isn&rsquo;t set up yet; the list below is in rule order.
        </p>
      )}
      {busy && <p className={styles.muted}>Thinking… (up to 30 seconds)</p>}
      {error && (
        <div className={styles.errorRow}>
          <Alert tone="error">{error} The list below is still in rule order.</Alert>
          <Button variant="secondary" onClick={rank} loading={busy}>
            Try again
          </Button>
        </div>
      )}
      {ranking?.summary && (
        <section className={styles.summary} aria-label="Your week">
          <Sparkles size={16} aria-hidden />
          <p>{ranking.summary}</p>
        </section>
      )}

      {ranked ? (
        <ol className={styles.list} aria-label="Ranked tasks">
          {ranked.map((t) => (
            <TaskRow key={t.id} task={t} aiReady={aiReady} today={today} showSection />
          ))}
        </ol>
      ) : (
        SECTIONS.map((s) => {
          const items = tasks.filter((t) => t.section === s.key);
          if (items.length === 0) return null;
          return (
            <section key={s.key} className={styles.section} aria-label={s.label}>
              <h2 className={styles.sectionTitle}>
                {s.label}{" "}
                <span className={s.key === "backlog" ? styles.badgeLate : styles.badge}>
                  {items.length}
                </span>
              </h2>
              {s.key === "backlog" && (
                <p className={styles.muted}>
                  Due on an earlier day and not done yet. Do it, or snooze it to a date.
                </p>
              )}
              <ul className={styles.list}>
                {items.map((t) => (
                  <TaskRow key={t.id} task={t} aiReady={aiReady} today={today} />
                ))}
              </ul>
            </section>
          );
        })
      )}
    </>
  );
}

const MESSAGE_CHANNELS = ["LinkedIn message", "InMail", "Email", "WhatsApp"];

type Reply = { ok: boolean; message?: string; error?: string };

type Draft = Extract<Awaited<ReturnType<typeof suggestNextMessage>>, { ok: true }>["data"];

function TaskRow({
  task,
  aiReady,
  today,
  showSection = false,
}: {
  task: Task;
  aiReady: boolean;
  today: string;
  showSection?: boolean;
}) {
  const notify = useToast();
  const [busy, start] = useTransition();
  const [draft, setDraft] = useState<Draft | null>(null);
  const draftNudge = () =>
    start(async () => {
      const r = await suggestNextMessage(task.personId);
      if (r.ok) setDraft(r.data);
      else notify("error", r.error);
    });
  const [text, setText] = useState(task.message ?? "");
  const [warnings, setWarnings] = useState<{
    input: Record<string, unknown>;
    list: string[];
  } | null>(null);
  const say = (r: Reply, ok?: string) =>
    notify(
      r.ok ? "success" : "error",
      r.ok ? (ok ?? r.message ?? "Done.") : (r.error ?? "Something went wrong."),
    );
  const act = (fn: () => Promise<Reply>, ok?: string) => start(async () => say(await fn(), ok));
  const step = (input: Record<string, unknown>) =>
    start(async () => {
      const r: StepResult = await doStep(task.personId, input);
      if (!r.ok && r.warnings?.length) {
        setWarnings({ input, list: r.warnings.map((w) => w.message) });
        return;
      }
      setWarnings(null);
      say(r);
    });
  const [snoozing, setSnoozing] = useState(false);
  const [removing, setRemoving] = useState(false);
  // Remove (D-054): follow-ups, backlogs, "no date", reply deadlines and "no activity".
  const removable =
    task.kind === "followup" ||
    task.kind === "setdate" ||
    task.kind === "open" ||
    task.kind === "nudge";
  const [following, setFollowing] = useState(false);
  const snooze = (until: string) =>
    start(async () => {
      const r =
        task.kind === "step"
          ? await planCommand(task.personId, "snooze", until)
          : await snoozeTask(task.personId, until);
      say(r, `${task.name} snoozed to ${niceDate(until)}.`);
      if (r.ok) setSnoozing(false);
    });
  const isMessage = task.kind === "step" && task.channel && MESSAGE_CHANNELS.includes(task.channel);

  return (
    <li className={styles.task} aria-label={task.name}>
      <div className={styles.taskMain}>
        <Link href={`/people/${task.personId}`} className={styles.taskName}>
          {task.name}
        </Link>
        <span className={styles.muted}>
          {[task.title, task.company].filter(Boolean).join(" · ")}
          {task.tier ? ` · Tier ${task.tier}` : ""}
          {task.planName ? ` · ${task.planName}` : ""}
        </span>
        <span className={styles.detail}>
          {showSection && `${SECTIONS.find((s) => s.key === task.section)?.label}: `}
          {task.detail}
        </span>
        {task.reason && <span className={styles.reason}>{task.reason}</span>}
        {isMessage && (
          <TextArea
            label={`Message to ${task.name}`}
            rows={3}
            value={text}
            maxLength={5000}
            onChange={(e) => setText(e.target.value)}
          />
        )}
        {task.kind === "step" && !isMessage && task.script && (
          <p className={styles.script}>{task.script}</p>
        )}
        {draft && (
          <div className={styles.drafts}>
            <span className={styles.reason}>{draft.advice}</span>
            {draft.suggestions.map((s, i) => (
              <SuggestionCard
                key={i}
                personId={task.personId}
                suggestion={s}
                channel={draft.channel}
                situation={draft.situation}
                replyBy={draft.replyBy}
              />
            ))}
          </div>
        )}
      </div>
      <div className={styles.taskActions}>
        {task.kind === "quick" && task.doneLabel && (
          <Button
            variant="secondary"
            disabled={busy}
            onClick={() => act(() => doneTask(task.id), `${task.name}: ${task.doneLabel}.`)}
            aria-label={`Done: ${task.doneLabel} for ${task.name}`}
          >
            <Check size={16} aria-hidden /> {task.doneLabel}
          </Button>
        )}
        {task.kind === "step" && task.channel === "Call" && (
          <div
            className={styles.outcomes}
            role="group"
            aria-label={`Call outcome for ${task.name}`}
          >
            {(["Connected", "No answer", "Not interested"] as const).map((o) => (
              <Button
                key={o}
                variant="secondary"
                disabled={busy}
                onClick={() => step({ outcome: o })}
              >
                {o}
              </Button>
            ))}
          </div>
        )}
        {task.kind === "step" && task.channel === "Email" && task.email && (
          <a
            className={styles.linkButton}
            href={`mailto:${task.email}?subject=${encodeURIComponent("Lumor")}&body=${encodeURIComponent(text)}`}
          >
            <Mail size={16} aria-hidden /> Open in mail app
          </a>
        )}
        {task.kind === "step" && task.channel !== "Call" && (
          <Button
            variant="secondary"
            disabled={busy || (Boolean(isMessage) && !text.trim())}
            onClick={() => step(isMessage ? { text } : {})}
            aria-label={`Done: step for ${task.name}`}
          >
            <Check size={16} aria-hidden /> Done
          </Button>
        )}
        {task.kind === "withdraw" && (
          <Button
            variant="secondary"
            disabled={busy}
            onClick={() => act(() => planCommand(task.personId, "withdraw"))}
            aria-label={`Withdraw the invite to ${task.name}`}
          >
            Withdraw
          </Button>
        )}
        {task.kind === "finished" && (
          <>
            <Button
              variant="secondary"
              disabled={busy}
              onClick={() => act(() => planCommand(task.personId, "nurture"))}
            >
              Nurture
            </Button>
            <Button
              variant="danger"
              disabled={busy}
              onClick={() => act(() => planCommand(task.personId, "lost"))}
            >
              Lost
            </Button>
          </>
        )}
        {task.kind === "nurture" && (
          <>
            <Link href={`/people/${task.personId}`} className={styles.linkButton}>
              Enrol again
            </Link>
            <Button
              variant="danger"
              disabled={busy}
              onClick={() => act(() => planCommand(task.personId, "nurtureLost"))}
            >
              Lost
            </Button>
          </>
        )}
        {task.kind === "nudge" && aiReady && !draft && (
          <Button
            variant="secondary"
            loading={busy}
            onClick={draftNudge}
            aria-label={`Draft a nudge for ${task.name}`}
          >
            <Sparkles size={16} aria-hidden /> Draft nudge
          </Button>
        )}
        {(task.kind === "followup" || task.kind === "setdate") && (
          <Button
            variant="secondary"
            disabled={busy}
            onClick={() => setFollowing(true)}
            aria-label={`Set next follow-up for ${task.name}`}
          >
            <Check size={16} aria-hidden />{" "}
            {task.kind === "followup" ? "Done · set next follow-up" : "Set follow-up date"}
          </Button>
        )}
        {(task.kind === "open" ||
          task.kind === "nudge" ||
          task.kind === "followup" ||
          task.kind === "setdate") && (
          <Link href={`/people/${task.personId}`} className={styles.linkButton}>
            Open
          </Link>
        )}
        {removable && (
          <Button
            variant="ghost"
            disabled={busy}
            onClick={() => setRemoving(true)}
            aria-label={`Remove the follow-up for ${task.name}`}
          >
            <Trash2 size={16} aria-hidden /> Remove
          </Button>
        )}
        {task.kind !== "finished" && (
          <Button
            variant="ghost"
            disabled={busy}
            onClick={() => setSnoozing(true)}
            aria-label={`Snooze ${task.name}`}
          >
            <Clock size={16} aria-hidden /> Snooze
          </Button>
        )}
      </div>
      {following && (
        <FollowUpDialog
          today={today}
          task={task}
          busy={busy}
          onClose={() => setFollowing(false)}
          onSave={(nextAction, date) =>
            start(async () => {
              const r = await setFollowUpTask(task.personId, nextAction, date);
              say(r, `${task.name}: next follow-up on ${niceDate(date)}.`);
              if (r.ok) setFollowing(false);
            })
          }
        />
      )}
      <Dialog
        open={removing}
        onOpenChange={setRemoving}
        title={`Remove the follow-up for ${task.name}?`}
        description="It leaves Today, with its next action and date. It comes back only if something new happens, like a reply, or when you set a new follow-up date on their page."
      >
        <div className={styles.dialogBody}>
          <div className={styles.dialogActions}>
            <Button variant="secondary" onClick={() => setRemoving(false)} disabled={busy}>
              Keep it
            </Button>
            <Button
              variant="danger"
              loading={busy}
              onClick={() =>
                start(async () => {
                  const r = await removeFollowUpTask(task.personId);
                  say(r, `Follow-up for ${task.name} removed.`);
                  if (r.ok) setRemoving(false);
                })
              }
            >
              Remove follow-up
            </Button>
          </div>
        </div>
      </Dialog>
      {snoozing && (
        <SnoozeDialog
          today={today}
          name={task.name}
          busy={busy}
          onClose={() => setSnoozing(false)}
          onSnooze={snooze}
        />
      )}
      <Dialog
        open={warnings !== null}
        onOpenChange={(o) => !o && setWarnings(null)}
        title="This breaks a cadence guardrail"
      >
        <div className={styles.dialogBody}>
          <Alert tone="warning">
            <ul className={styles.warnList}>
              {warnings?.list.map((w) => (
                <li key={w}>{w}</li>
              ))}
            </ul>
          </Alert>
          <p>Logging anyway is recorded in the audit log.</p>
          <div className={styles.taskActions}>
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
    </li>
  );
}

const plusDays = (date: string, n: number) => {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
};

/** "Tue 4 Nov". */
const niceDate = (date: string) =>
  new Intl.DateTimeFormat("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  }).format(new Date(`${date}T00:00:00Z`));

/** Snooze until a date (D-043): quick choices or any day in the next 60. */
function SnoozeDialog({
  today,
  name,
  busy,
  onClose,
  onSnooze,
}: {
  today: string;
  name: string;
  busy: boolean;
  onClose: () => void;
  onSnooze: (until: string) => void;
}) {
  const weekday = new Date(`${today}T00:00:00Z`).getUTCDay();
  const nextMonday = plusDays(today, (8 - weekday) % 7 || 7);
  const choices = [
    { label: "Tomorrow", date: plusDays(today, 1) },
    { label: "In 2 days", date: plusDays(today, 2) },
    { label: "Next Monday", date: nextMonday },
  ];
  const [date, setDate] = useState(plusDays(today, 1));
  return (
    <Dialog
      open
      onOpenChange={(o) => !o && onClose()}
      title={`Snooze ${name}`}
      description="It comes back on Today that day, as due that day."
    >
      <div className={styles.dialogBody}>
        <div className={styles.snoozeChoices} role="group" aria-label="Quick choices">
          {choices.map((c) => (
            <Button
              key={c.label}
              variant={date === c.date ? "primary" : "secondary"}
              onClick={() => setDate(c.date)}
            >
              {c.label} · {niceDate(c.date)}
            </Button>
          ))}
        </div>
        <TextField
          label="Or pick a date"
          type="date"
          min={plusDays(today, 1)}
          max={plusDays(today, 60)}
          value={date}
          onChange={(e) => setDate(e.target.value)}
        />
        <div className={styles.taskActions}>
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button loading={busy} disabled={!date} onClick={() => onSnooze(date)}>
            Snooze to {date ? niceDate(date) : "…"}
          </Button>
        </div>
      </div>
    </Dialog>
  );
}

/** Set next follow-up (D-044): what to do next, and when. */
function FollowUpDialog({
  today,
  task,
  busy,
  onClose,
  onSave,
}: {
  today: string;
  task: Task;
  busy: boolean;
  onClose: () => void;
  onSave: (nextAction: string, date: string) => void;
}) {
  const [what, setWhat] = useState(task.kind === "followup" ? "" : (task.nextAction ?? ""));
  const [date, setDate] = useState(plusDays(today, 3));
  return (
    <Dialog
      open
      onOpenChange={(o) => !o && onClose()}
      title={`Next follow-up with ${task.name}`}
      description={
        task.kind === "followup"
          ? `Was: ${task.nextAction ?? "Follow up"}. Log what you did on their page; here, set what comes next.`
          : "Everyone you're working with needs a next step and a date, so they show on Today."
      }
    >
      <div className={styles.dialogBody}>
        <TextField
          label="Next action"
          placeholder="e.g. Call to fix a demo slot"
          maxLength={200}
          value={what}
          onChange={(e) => setWhat(e.target.value)}
        />
        <div className={styles.snoozeChoices} role="group" aria-label="Quick dates">
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
              {c.label} · {niceDate(c.d)}
            </Button>
          ))}
        </div>
        <TextField
          label="Or pick a date"
          type="date"
          min={today}
          value={date}
          onChange={(e) => setDate(e.target.value)}
        />
        <div className={styles.taskActions}>
          <Link href={`/people/${task.personId}`} className={styles.linkButton}>
            Log on their page
          </Link>
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button loading={busy} disabled={!date} onClick={() => onSave(what, date)}>
            Save next follow-up
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
