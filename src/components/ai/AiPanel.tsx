"use client";

import { Sparkles } from "lucide-react";
import Link from "next/link";
import { useState, useTransition } from "react";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { TextField } from "@/components/ui/TextField";
import { useToast } from "@/components/ui/Toast";
import { confirmNextStep, summarise } from "@/server/actions/ai";
import { addPersonNote } from "@/server/actions/leads";
import type { DeskItem } from "@/server/ai/desk-thread";
import { OutreachDesk } from "./desk/OutreachDesk";
import styles from "./ai.module.scss";

export type AiStatus = "ready" | "off" | "no-knowledge";

type Step = { stage: string; nextAction: string; nextActionDate: string };

const THINKING = "Thinking… (up to 30 seconds)";

/**
 * The AI assistant panel on a person page: the Outreach Desk (D-056) and Summarise conversation
 * (F10). Only shown to the lead's owner or an Admin.
 */
export function AiPanel({
  personId,
  status,
  firstName,
  items,
  brief,
  askTitle,
  today,
  situation,
}: {
  personId: string;
  status: AiStatus;
  firstName: string;
  /** The Desk thread, oldest first (old activities mapped for display). */
  items: DeskItem[];
  brief: string | null;
  askTitle: boolean;
  today: string;
  /** Where the conversation stands, in one sentence (F18). */
  situation: string;
}) {
  const [summaryOpen, setSummaryOpen] = useState(false);
  return (
    <section className={styles.panel} aria-label="AI assistant">
      <h2 className={styles.title}>
        <Sparkles size={18} aria-hidden /> AI assistant
      </h2>
      {status === "off" && (
        <Alert tone="info">
          AI isn&rsquo;t set up yet. An Admin needs to add OPENAI_API_KEY (see docs/deploy.md).
          Replies and notes still save; drafting needs the AI.
        </Alert>
      )}
      {status === "no-knowledge" && (
        <Alert tone="warning">
          The AI needs its knowledge files first, so it only says true things about Lumor.{" "}
          <Link href="/ai-resources">Open AI Resources</Link>
        </Alert>
      )}
      <p className={styles.muted}>{situation}</p>
      <OutreachDesk
        personId={personId}
        firstName={firstName}
        items={items}
        brief={brief}
        askTitle={askTitle}
        today={today}
      />
      <div className={styles.summaryBar}>
        <Button
          variant="secondary"
          aria-expanded={summaryOpen}
          onClick={() => setSummaryOpen((o) => !o)}
        >
          <Sparkles size={16} aria-hidden /> Summarise conversation
        </Button>
      </div>
      {summaryOpen && status === "ready" && <SummaryTool personId={personId} />}
    </section>
  );
}

function NextStep({ personId, step }: { personId: string; step: Step }) {
  const notify = useToast();
  const [date, setDate] = useState(step.nextActionDate);
  const [action, setAction] = useState(step.nextAction);
  const [done, setDone] = useState(false);
  const [busy, start] = useTransition();
  return (
    <div className={styles.card}>
      <h3 className={styles.subTitle}>Suggested next step</h3>
      <p>
        Stage: <strong>{step.stage}</strong>
      </p>
      <div className={styles.grid2}>
        <TextField label="Next action" value={action} onChange={(e) => setAction(e.target.value)} />
        <TextField
          label="Date"
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
        />
      </div>
      <div className={styles.row}>
        <Button
          loading={busy}
          disabled={done}
          onClick={() =>
            start(async () => {
              const r = await confirmNextStep(personId, {
                stage: step.stage,
                nextAction: action,
                nextActionDate: date,
              });
              if (r.ok) setDone(true);
              notify(r.ok ? "success" : "error", r.ok ? "Next step saved." : r.error);
            })
          }
        >
          {done ? "Saved" : "Confirm"}
        </Button>
      </div>
    </div>
  );
}

// --- Summarise (F10) -------------------------------------------------------------------------

function SummaryTool({ personId }: { personId: string }) {
  const notify = useToast();
  const [busy, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{
    summary: string;
    needs: string[];
    objections: string[];
    nextStep: Step;
  } | null>(null);
  const [saved, setSaved] = useState(false);

  const run = () =>
    start(async () => {
      setError(null);
      const r = await summarise(personId);
      if (r.ok) {
        setResult(r.data);
        setSaved(false);
      } else setError(r.error);
    });

  const asNote = (r: NonNullable<typeof result>) =>
    [
      `Summary: ${r.summary}`,
      r.needs.length ? `Needs: ${r.needs.join("; ")}` : "",
      r.objections.length ? `Objections: ${r.objections.join("; ")}` : "",
    ]
      .filter(Boolean)
      .join("\n");

  return (
    <div className={styles.stack}>
      <p className={styles.muted}>
        Summarises the whole conversation below. Nothing is saved unless you click Save as note or
        Confirm.
      </p>
      <div className={styles.row}>
        <Button onClick={run} loading={busy}>
          <Sparkles size={16} aria-hidden /> Summarise
        </Button>
        {busy && <span className={styles.muted}>{THINKING}</span>}
      </div>
      {error && (
        <div className={styles.errorRow}>
          <Alert tone="error">{error}</Alert>
          <Button variant="secondary" onClick={run} loading={busy}>
            Try again
          </Button>
        </div>
      )}
      {result && (
        <>
          <div className={styles.card}>
            <h3 className={styles.subTitle}>Summary</h3>
            <p>{result.summary}</p>
            {result.needs.length > 0 && (
              <>
                <h4 className={styles.label}>Needs</h4>
                <ul className={styles.list}>
                  {result.needs.map((x) => (
                    <li key={x}>{x}</li>
                  ))}
                </ul>
              </>
            )}
            {result.objections.length > 0 && (
              <>
                <h4 className={styles.label}>Objections</h4>
                <ul className={styles.list}>
                  {result.objections.map((x) => (
                    <li key={x}>{x}</li>
                  ))}
                </ul>
              </>
            )}
            <div className={styles.row}>
              <Button
                variant="secondary"
                disabled={saved}
                onClick={() =>
                  start(async () => {
                    const r = await addPersonNote(personId, asNote(result));
                    if (r.ok) setSaved(true);
                    notify(r.ok ? "success" : "error", r.ok ? "Saved as a note." : r.error);
                  })
                }
              >
                {saved ? "Saved" : "Save as note"}
              </Button>
            </div>
          </div>
          <NextStep personId={personId} step={result.nextStep} />
        </>
      )}
    </div>
  );
}
