"use client";

import * as Tabs from "@radix-ui/react-tabs";
import { Copy, Sparkles } from "lucide-react";
import Link from "next/link";
import { useState, useTransition } from "react";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { SelectField } from "@/components/ui/SelectField";
import { TextArea } from "@/components/ui/TextArea";
import { TextField } from "@/components/ui/TextField";
import { useToast } from "@/components/ui/Toast";
import { REPLY_TYPES } from "@/lib/db/enums";
import {
  assistReply,
  changeReplyType,
  confirmNextStep,
  draftMessage,
  retryReply,
  sendAiMessage,
  summarise,
} from "@/server/actions/ai";
import { addPersonNote } from "@/server/actions/leads";
import type { Choice } from "@/server/leads/options";
import styles from "./ai.module.scss";

export type AiStatus = "ready" | "off" | "no-facts";

type Step = { stage: string; nextAction: string; nextActionDate: string };
type Suggestion = { approach: string; text: string };

const THINKING = "Thinking… (up to 30 seconds)";

/** The AI tools on a person page (F09, F10). Only shown to the lead's owner or an Admin. */
export function AiPanel({
  personId,
  status,
  templates,
}: {
  personId: string;
  status: AiStatus;
  templates: Choice[];
}) {
  return (
    <section className={styles.panel} aria-label="AI assistant">
      <h2 className={styles.title}>
        <Sparkles size={18} aria-hidden /> AI assistant
      </h2>
      {status === "off" && (
        <Alert tone="info">
          AI isn&rsquo;t set up yet. An Admin needs to add ANTHROPIC_API_KEY (see docs/deploy.md).
          Everything else works without it.
        </Alert>
      )}
      {status === "no-facts" && (
        <Alert tone="warning">
          The AI needs Product Facts first, so it only says true things about Lumor.{" "}
          <Link href="/settings/product-facts">Open Product Facts</Link>
        </Alert>
      )}
      {status === "ready" && (
        <Tabs.Root defaultValue="reply">
          <Tabs.List className={styles.tabs} aria-label="AI tools">
            <Tabs.Trigger value="reply" className={styles.tab}>
              Reply Assistant
            </Tabs.Trigger>
            <Tabs.Trigger value="summary" className={styles.tab}>
              Summarise conversation
            </Tabs.Trigger>
            <Tabs.Trigger value="draft" className={styles.tab}>
              Draft message
            </Tabs.Trigger>
          </Tabs.List>
          <Tabs.Content value="reply" className={styles.content}>
            <ReplyTool personId={personId} />
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

// --- Reply Assistant (F09) -------------------------------------------------------------------

function ReplyTool({ personId }: { personId: string }) {
  const notify = useToast();
  const [text, setText] = useState("");
  const [busy, start] = useTransition();
  const [activityId, setActivityId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{
    replyType: string;
    suggestions: Suggestion[];
    nextStep: Step;
    flags: string[];
  } | null>(null);

  const ask = () =>
    start(async () => {
      setError(null);
      const r = await assistReply(personId, text);
      if (!r.ok) return setError(r.error);
      setActivityId(r.data.activityId);
      setText("");
      notify("success", "Reply saved to the timeline.");
      if (r.data.result) setResult(r.data.result);
      else setError(r.data.aiError);
    });

  const retry = () =>
    start(async () => {
      if (!activityId) return;
      setError(null);
      const r = await retryReply(activityId);
      if (r.ok) setResult(r.data);
      else setError(r.error);
    });

  return (
    <div className={styles.stack}>
      <TextArea
        label="Prospect's message"
        hint="Paste their reply. It's saved to the timeline as soon as you click Suggest replies."
        rows={4}
        value={text}
        maxLength={20000}
        onChange={(e) => setText(e.target.value)}
      />
      <div className={styles.row}>
        <Button onClick={ask} loading={busy && !activityId} disabled={!text.trim() || busy}>
          <Sparkles size={16} aria-hidden /> Suggest replies
        </Button>
        {busy && <span className={styles.muted}>{THINKING}</span>}
      </div>
      {error && (
        <div className={styles.errorRow}>
          <Alert tone="error">{error}</Alert>
          {activityId && (
            <Button variant="secondary" onClick={retry} loading={busy}>
              Try again
            </Button>
          )}
        </div>
      )}
      {result && activityId && (
        <>
          <ReplyTypePicker activityId={activityId} initial={result.replyType} />
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
          <h3 className={styles.subTitle}>Suggested replies</h3>
          {result.suggestions.map((s, i) => (
            <SuggestionCard key={i} personId={personId} suggestion={s} />
          ))}
          <NextStep personId={personId} step={result.nextStep} />
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

function SuggestionCard({
  personId,
  suggestion,
  templateId,
}: {
  personId: string;
  suggestion: Suggestion;
  templateId?: string;
}) {
  const notify = useToast();
  const [text, setText] = useState(suggestion.text);
  const [sent, setSent] = useState(false);
  const [busy, start] = useTransition();
  return (
    <div className={styles.card}>
      {suggestion.approach && <p className={styles.approach}>{suggestion.approach}</p>}
      <TextArea
        label={suggestion.approach ? `Reply: ${suggestion.approach}` : "Message"}
        rows={4}
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
        <Button
          loading={busy}
          disabled={sent || !text.trim()}
          onClick={() =>
            start(async () => {
              const r = await sendAiMessage(personId, {
                text,
                suggestion: suggestion.text,
                approach: suggestion.approach || null,
                templateId: templateId ?? null,
              });
              if (r.ok) setSent(true);
              notify(r.ok ? "success" : "error", r.ok ? "Logged as sent." : r.error);
            })
          }
        >
          {sent ? "Logged" : "Mark as sent"}
        </Button>
      </div>
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
  const [thread, setThread] = useState("");
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
      const r = await summarise(personId, thread);
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
      <TextArea
        label="LinkedIn conversation"
        hint="Paste the whole thread. Nothing is saved unless you click Save as note or Confirm."
        rows={6}
        value={thread}
        maxLength={20000}
        onChange={(e) => setThread(e.target.value)}
      />
      <div className={styles.row}>
        <Button onClick={run} loading={busy} disabled={!thread.trim()}>
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
