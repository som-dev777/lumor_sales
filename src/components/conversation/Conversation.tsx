"use client";

import { ClipboardPaste } from "lucide-react";
import { useState, useTransition } from "react";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { SelectField } from "@/components/ui/SelectField";
import { TextArea } from "@/components/ui/TextArea";
import { TextField } from "@/components/ui/TextField";
import { useToast } from "@/components/ui/Toast";
import { REPLY_TYPES, THREAD_CHANNELS } from "@/lib/db/enums";
import { addThreadEntry } from "@/server/actions/conversation";
import { PasteConversation } from "./PasteConversation";
import styles from "./conversation.module.scss";

export type ThreadView = {
  id: string;
  side: "me" | "them" | "note" | "event";
  when: string;
  who: string;
  type: string;
  channel: string;
  content: string | null;
  replyType: string | null;
  step: number | null;
};

/** The plan step a "From me" entry could stand for (F17's "Is this step N of their plan?"). */
export type CurrentStep = { order: number; action: "requestSent" | "messageSent" | "callLogged" };

type Props = {
  personId: string;
  firstName: string;
  items: ThreadView[];
  /** Owner or Admin: may add messages from either side. Anyone may add a note. */
  canLog: boolean;
  /** "YYYY-MM-DDTHH:mm" in IST: the default and the latest allowed time. */
  now: string;
  currentStep: CurrentStep | null;
  defaultChannel: string;
};

type From = "me" | "them" | "note";
type Warning = { rule: number; message: string };

const channelOptions = THREAD_CHANNELS.map((c) => ({ value: c, label: c }));

/** The chat-style conversation on a person page (F18): who, where and when for every message. */
export function Conversation({
  personId,
  firstName,
  items,
  canLog,
  now,
  currentStep,
  defaultChannel,
}: Props) {
  const [showEvents, setShowEvents] = useState(false);
  const events = items.filter((i) => i.side === "event").length;
  const shown = showEvents ? items : items.filter((i) => i.side !== "event");
  return (
    <section className={styles.panel} aria-label="Conversation">
      <div className={styles.head}>
        <h2 className={styles.title}>Conversation</h2>
        {events > 0 && (
          <label className={styles.check}>
            <input
              type="checkbox"
              checked={showEvents}
              onChange={(e) => setShowEvents(e.target.checked)}
            />
            Show plan and stage events ({events})
          </label>
        )}
      </div>
      {shown.length === 0 ? (
        <p className={styles.muted}>Nothing in the conversation yet.</p>
      ) : (
        <ol className={styles.thread}>
          {shown.map((i) => (
            <li key={i.id} className={`${styles.item} ${styles[i.side]}`}>
              <div className={styles.bubble}>
                <p className={styles.meta}>
                  {i.side === "event" ? i.type : i.who} · {i.channel} · {i.when}
                  {i.replyType ? ` · ${i.replyType}` : ""}
                  {i.step ? ` · plan step ${i.step}` : ""}
                </p>
                {i.content && <p className={styles.text}>{i.content}</p>}
                {i.side === "event" && !i.content && <p className={styles.text}>{i.type}</p>}
              </div>
            </li>
          ))}
        </ol>
      )}
      <Composer
        personId={personId}
        firstName={firstName}
        canLog={canLog}
        now={now}
        currentStep={currentStep}
        defaultChannel={defaultChannel}
      />
    </section>
  );
}

function Composer({
  personId,
  firstName,
  canLog,
  now,
  currentStep,
  defaultChannel,
}: Omit<Props, "items">) {
  const notify = useToast();
  const [from, setFrom] = useState<From>(canLog ? "me" : "note");
  const [channel, setChannel] = useState(defaultChannel);
  const [at, setAt] = useState(now);
  const [text, setText] = useState("");
  const [replyType, setReplyType] = useState("");
  const [replyBy, setReplyBy] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [askStep, setAskStep] = useState(false);
  const [warnings, setWarnings] = useState<{ list: Warning[]; asStep: boolean } | null>(null);
  const [busy, start] = useTransition();

  const input = () => ({
    from,
    channel,
    at,
    text,
    replyType: from === "them" ? replyType : null,
    replyBy: from === "me" ? replyBy : null,
  });

  const send = (opts: { asStep?: boolean; override?: boolean } = {}) =>
    start(async () => {
      const r = await addThreadEntry(personId, input(), opts);
      setAskStep(false);
      if (r.ok) {
        notify("success", r.message ?? "Added.");
        setText("");
        setReplyType("");
        setReplyBy("");
        setError(null);
        setWarnings(null);
      } else if (r.warnings?.length) {
        setWarnings({ list: r.warnings, asStep: Boolean(opts.asStep) });
      } else {
        setError(r.error);
      }
    });

  const matchesStep =
    from === "me" &&
    currentStep !== null &&
    ((currentStep.action === "callLogged" && channel === "Call") ||
      (currentStep.action === "messageSent" &&
        ["LinkedIn", "InMail", "Email", "WhatsApp"].includes(channel)));

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (matchesStep) setAskStep(true);
    else send();
  };

  const noteOnly = !canLog;
  return (
    <form className={styles.composer} onSubmit={submit}>
      {!noteOnly && (
        <div className={styles.toggle} role="radiogroup" aria-label="Who is it from">
          {(
            [
              ["me", "From me"],
              ["them", `From ${firstName}`],
              ["note", "Note"],
            ] as const
          ).map(([value, label]) => (
            <label key={value} className={styles.check}>
              <input
                type="radio"
                name="from"
                checked={from === value}
                onChange={() => {
                  setFrom(value);
                  setAskStep(false);
                  setWarnings(null);
                }}
              />
              {label}
            </label>
          ))}
        </div>
      )}
      <div className={styles.fields}>
        <SelectField
          label={from === "note" ? "About (channel)" : "Channel"}
          value={channel}
          onChange={(e) => setChannel(e.target.value)}
          options={channelOptions}
        />
        <TextField
          label="When"
          type="datetime-local"
          value={at}
          max={now}
          onChange={(e) => setAt(e.target.value)}
        />
        {from === "them" && (
          <SelectField
            label="Reply type (optional)"
            value={replyType}
            onChange={(e) => setReplyType(e.target.value)}
            options={[
              { value: "", label: "Not set" },
              ...REPLY_TYPES.map((r) => ({ value: r, label: r })),
            ]}
          />
        )}
        {from === "me" && (
          <TextField
            label="Expect a reply by (optional)"
            type="date"
            value={replyBy}
            onChange={(e) => setReplyBy(e.target.value)}
          />
        )}
      </div>
      <TextArea
        label={
          from === "note"
            ? "Add a note"
            : from === "me"
              ? "What you sent or said"
              : `What ${firstName} sent or said`
        }
        rows={3}
        value={text}
        maxLength={5000}
        onChange={(e) => setText(e.target.value)}
      />
      {error && <Alert tone="error">{error}</Alert>}
      {askStep && currentStep && (
        <div className={styles.question}>
          <p>Is this step {currentStep.order} of their plan?</p>
          <div className={styles.actions}>
            <Button onClick={() => send({ asStep: true })} loading={busy}>
              Yes, step {currentStep.order}
            </Button>
            <Button variant="secondary" onClick={() => send()} disabled={busy}>
              No, an extra message
            </Button>
          </div>
        </div>
      )}
      {warnings && (
        <div className={styles.question}>
          <Alert tone="warning">
            <ul className={styles.list}>
              {warnings.list.map((w) => (
                <li key={w.rule}>{w.message}</li>
              ))}
            </ul>
          </Alert>
          <div className={styles.actions}>
            <Button
              onClick={() => send({ asStep: warnings.asStep, override: true })}
              loading={busy}
            >
              Log anyway
            </Button>
            <Button variant="secondary" onClick={() => setWarnings(null)} disabled={busy}>
              Cancel
            </Button>
          </div>
        </div>
      )}
      {!askStep && !warnings && (
        <div className={styles.actions}>
          <Button type="submit" loading={busy} disabled={!text.trim()}>
            {from === "note" ? "Add note" : "Add to conversation"}
          </Button>
          {canLog && (
            <PasteConversation
              personId={personId}
              firstName={firstName}
              defaultChannel={defaultChannel}
              now={now}
              trigger={
                <>
                  <ClipboardPaste size={16} aria-hidden /> Paste a whole conversation
                </>
              }
            />
          )}
        </div>
      )}
    </form>
  );
}
