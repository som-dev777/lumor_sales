"use client";

import * as Tabs from "@radix-ui/react-tabs";
import { Sparkles } from "lucide-react";
import Link from "next/link";
import { useState, useTransition } from "react";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { SelectField } from "@/components/ui/SelectField";
import { TextField } from "@/components/ui/TextField";
import { useToast } from "@/components/ui/Toast";
import { REPLY_TYPES } from "@/lib/db/enums";
import {
  changeReplyType,
  confirmNextStep,
  draftMessage,
  suggestNextMessage,
  summarise,
} from "@/server/actions/ai";
import { addPersonNote } from "@/server/actions/leads";
import type { Choice } from "@/server/leads/options";
import { SuggestionCard, type SituationKind, type Suggestion } from "./SuggestionCard";
import styles from "./ai.module.scss";

export type AiStatus = "ready" | "off" | "no-knowledge";

type Step = { stage: string; nextAction: string; nextActionDate: string };

const THINKING = "Thinking… (up to 30 seconds)";

/** The AI tools on a person page (F18, F10). Only shown to the lead's owner or an Admin. */
export function AiPanel({
  personId,
  status,
  templates,
  situation,
}: {
  personId: string;
  status: AiStatus;
  templates: Choice[];
  /** Where the conversation stands, in one sentence (F18). */
  situation: string;
}) {
  return (
    <section className={styles.panel} aria-label="AI assistant">
      <h2 className={styles.title}>
        <Sparkles size={18} aria-hidden /> AI assistant
      </h2>
      {status === "off" && (
        <Alert tone="info">
          AI isn&rsquo;t set up yet. An Admin needs to add OPENAI_API_KEY (see docs/deploy.md).
          Everything else works without it.
        </Alert>
      )}
      {status === "no-knowledge" && (
        <Alert tone="warning">
          The AI needs its knowledge files first, so it only says true things about Lumor.{" "}
          <Link href="/ai-resources">Open AI Resources</Link>
        </Alert>
      )}
      {status === "ready" && (
        <Tabs.Root defaultValue="next">
          <Tabs.List className={styles.tabs} aria-label="AI tools">
            <Tabs.Trigger value="next" className={styles.tab}>
              Suggest next message
            </Tabs.Trigger>
            <Tabs.Trigger value="summary" className={styles.tab}>
              Summarise conversation
            </Tabs.Trigger>
            <Tabs.Trigger value="draft" className={styles.tab}>
              Draft message
            </Tabs.Trigger>
          </Tabs.List>
          <Tabs.Content value="next" className={styles.content}>
            <NextTool personId={personId} situation={situation} />
          </Tabs.Content>
          <Tabs.Content value="summary" className={styles.content}>
            <SummaryTool personId={personId} />
          </Tabs.Content>
          <Tabs.Content value="draft" className={styles.content}>
            <DraftTool personId={personId} templates={templates} />
          </Tabs.Content>
        </Tabs.Root>
      )}
    </section>
  );
}

// --- Suggest next message (F18, replaces the Reply Assistant) ---------------------------------

type NextResult = {
  situation: SituationKind;
  status: string;
  advice: string;
  channel: string;
  replyId: string | null;
  replyType: string | null;
  suggestions: Suggestion[];
  replyBy: { date: string; reason: string } | null;
  nextStep: Step;
  flags: string[];
};

function NextTool({ personId, situation }: { personId: string; situation: string }) {
  const [busy, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<(NextResult & { key: number }) | null>(null);

  const ask = () =>
    start(async () => {
      setError(null);
      const r = await suggestNextMessage(personId);
      if (r.ok) setResult({ ...r.data, key: Date.now() });
      else setError(r.error);
    });

  return (
    <div className={styles.stack}>
      <p>{situation}</p>
      <p className={styles.muted}>
        The AI reads the whole conversation below. If they replied, add their message to the
        conversation first, then ask.
      </p>
      <div className={styles.row}>
        <Button onClick={ask} loading={busy}>
          <Sparkles size={16} aria-hidden /> Suggest next message
        </Button>
        {busy && <span className={styles.muted}>{THINKING}</span>}
      </div>
      {error && (
        <div className={styles.errorRow}>
          <Alert tone="error">{error}</Alert>
          <Button variant="secondary" onClick={ask} loading={busy}>
            Try again
          </Button>
        </div>
      )}
      {result && (
        <>
          <Alert tone="info">{result.advice}</Alert>
          {result.replyId && result.replyType && (
            <ReplyTypePicker
              key={result.key}
              activityId={result.replyId}
              initial={result.replyType}
            />
          )}
          {result.flags.length > 0 && (
            <Alert tone="warning">
              <strong>Check before sending:</strong>
              <ul className={styles.list}>
                {result.flags.map((f) => (
                  <li key={f}>{f}</li>
                ))}
              </ul>
            </Alert>
          )}
          {result.suggestions.length > 0 && <h3 className={styles.subTitle}>Suggested messages</h3>}
          {result.suggestions.map((s, i) => (
            <SuggestionCard
              key={`${result.key}-${i}`}
              personId={personId}
              suggestion={s}
              channel={result.channel}
              situation={result.situation}
              replyBy={result.replyBy}
            />
          ))}
          <NextStep key={`step-${result.key}`} personId={personId} step={result.nextStep} />
        </>
      )}
    </div>
  );
}

function ReplyTypePicker({ activityId, initial }: { activityId: string; initial: string }) {
  const notify = useToast();
  const [value, setValue] = useState(initial);
  const [busy, start] = useTransition();
  return (
    <div className={styles.inline}>
      <SelectField
        label="Reply type"
        value={value}
        disabled={busy}
        options={REPLY_TYPES.map((r) => ({ value: r, label: r }))}
        onChange={(e) => {
          const next = e.target.value;
          setValue(next);
          start(async () => {
            const r = await changeReplyType(activityId, next);
            notify(r.ok ? "success" : "error", r.ok ? "Reply type saved." : r.error);
          });
        }}
      />
    </div>
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

// --- Draft message (F10) ---------------------------------------------------------------------

function DraftTool({ personId, templates }: { personId: string; templates: Choice[] }) {
  const [templateId, setTemplateId] = useState("");
  const [busy, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState<{ message: string; notes: string[]; key: number } | null>(
    null,
  );

  const run = () =>
    start(async () => {
      setError(null);
      const r = await draftMessage(personId, templateId);
      if (r.ok) setDraft({ ...r.data, key: Date.now() });
      else setError(r.error);
    });

  return (
    <div className={styles.stack}>
      <SelectField
        label="Template"
        value={templateId}
        onChange={(e) => setTemplateId(e.target.value)}
        options={[
          { value: "", label: "Choose a template…" },
          ...templates.map((t) => ({ value: t.id, label: t.label })),
        ]}
      />
      <div className={styles.row}>
        <Button onClick={run} loading={busy} disabled={!templateId}>
          <Sparkles size={16} aria-hidden /> Draft
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
      {draft && (
        <>
          {draft.notes.length > 0 && (
            <Alert tone="warning">
              <ul className={styles.list}>
                {draft.notes.map((n) => (
                  <li key={n}>{n}</li>
                ))}
              </ul>
            </Alert>
          )}
          <SuggestionCard
            key={draft.key}
            personId={personId}
            suggestion={{ approach: "", text: draft.message }}
            templateId={templateId}
          />
          <p className={styles.muted}>
            For Message 1 or a follow-up, also click the matching quick-log button so the follow-up
            dates move on.
          </p>
        </>
      )}
    </div>
  );
}
