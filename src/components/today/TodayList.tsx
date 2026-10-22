"use client";

import { Check, Clock, Mail, Sparkles } from "lucide-react";
import Link from "next/link";
import { useState, useTransition } from "react";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";
import { TextArea } from "@/components/ui/TextArea";
import { useToast } from "@/components/ui/Toast";
import { SECTIONS } from "@/lib/today-sections";
import { SuggestionCard } from "@/components/ai/SuggestionCard";
import { doneTask, rankMyDay, snoozeTask, suggestNextMessage } from "@/server/actions/ai";
import { doStep, planCommand, type StepResult } from "@/server/actions/plans";
import type { Task, TodayPlan } from "@/server/today";
import styles from "./today.module.scss";

type Props = { tasks: Task[]; outreach: TodayPlan["outreach"]; aiReady: boolean };

/** Today's list (F08): grouped by section, or in the AI's order after Rank with AI. */
export function TodayList({ tasks, outreach, aiReady }: Props) {
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
            {outreach.sent} of {outreach.target} requests sent
          </span>
        </div>
        <progress
          className={styles.bar}
          aria-label="Connection requests sent today"
          value={Math.min(outreach.sent, outreach.target)}
          max={Math.max(outreach.target, 1)}
        />
        <p className={styles.muted}>
          {outreach.left > 0
            ? `${outreach.left} left to send today.`
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
            : `${tasks.length} ${tasks.length === 1 ? "task" : "tasks"} for today.`}
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
            <TaskRow key={t.id} task={t} aiReady={aiReady} showSection />
          ))}
        </ol>
      ) : (
        SECTIONS.map((s) => {
          const items = tasks.filter((t) => t.section === s.key);
          if (items.length === 0) return null;
          return (
            <section key={s.key} className={styles.section} aria-label={s.label}>
              <h2 className={styles.sectionTitle}>
                {s.label} <span className={styles.badge}>{items.length}</span>
              </h2>
              <ul className={styles.list}>
                {items.map((t) => (
                  <TaskRow key={t.id} task={t} aiReady={aiReady} />
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
  showSection = false,
}: {
  task: Task;
  aiReady: boolean;
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
  const snooze = () =>
    task.kind === "step"
      ? act(() => planCommand(task.personId, "snooze"), `${task.name} snoozed to tomorrow.`)
      : act(() => snoozeTask(task.personId), `${task.name} snoozed to tomorrow.`);
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
        {(task.kind === "open" || task.kind === "nudge") && (
          <Link href={`/people/${task.personId}`} className={styles.linkButton}>
            Open
          </Link>
        )}
        {task.kind !== "finished" && (
          <Button
            variant="ghost"
            disabled={busy}
            onClick={snooze}
            aria-label={`Snooze ${task.name} to tomorrow`}
          >
            <Clock size={16} aria-hidden /> Snooze
          </Button>
        )}
      </div>
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
