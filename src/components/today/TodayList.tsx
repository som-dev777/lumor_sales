"use client";

import { Check, Clock, Sparkles } from "lucide-react";
import Link from "next/link";
import { useState, useTransition } from "react";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";
import { SECTIONS } from "@/lib/today-sections";
import { doneTask, rankMyDay, snoozeTask } from "@/server/actions/ai";
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
            <TaskRow key={t.id} task={t} showSection />
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
                  <TaskRow key={t.id} task={t} />
                ))}
              </ul>
            </section>
          );
        })
      )}
    </>
  );
}

function TaskRow({ task, showSection = false }: { task: Task; showSection?: boolean }) {
  const notify = useToast();
  const [busy, start] = useTransition();
  const act = (fn: () => Promise<{ ok: boolean; error?: string }>, ok: string) =>
    start(async () => {
      const r = await fn();
      notify(r.ok ? "success" : "error", r.ok ? ok : (r.error ?? "Something went wrong."));
    });
  return (
    <li className={styles.task}>
      <div className={styles.taskMain}>
        <Link href={`/people/${task.personId}`} className={styles.taskName}>
          {task.name}
        </Link>
        <span className={styles.muted}>
          {[task.title, task.company].filter(Boolean).join(" · ")}
          {task.tier ? ` · Tier ${task.tier}` : ""}
        </span>
        <span className={styles.detail}>
          {showSection && `${SECTIONS.find((s) => s.key === task.section)?.label}: `}
          {task.detail}
        </span>
        {task.reason && <span className={styles.reason}>{task.reason}</span>}
      </div>
      <div className={styles.taskActions}>
        {task.doneLabel && (
          <Button
            variant="secondary"
            disabled={busy}
            onClick={() => act(() => doneTask(task.id), `${task.name}: ${task.doneLabel}.`)}
            aria-label={`Done: ${task.doneLabel} for ${task.name}`}
          >
            <Check size={16} aria-hidden /> {task.doneLabel}
          </Button>
        )}
        <Button
          variant="ghost"
          disabled={busy}
          onClick={() => act(() => snoozeTask(task.personId), `${task.name} snoozed to tomorrow.`)}
          aria-label={`Snooze ${task.name} to tomorrow`}
        >
          <Clock size={16} aria-hidden /> Snooze
        </Button>
      </div>
    </li>
  );
}
