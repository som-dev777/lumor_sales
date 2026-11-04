"use client";

import { Check, Copy, Pencil, Phone, Send, Sparkles } from "lucide-react";
import { useEffect, useRef, useState, useTransition } from "react";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { SelectField } from "@/components/ui/SelectField";
import { TextArea } from "@/components/ui/TextArea";
import { TextField } from "@/components/ui/TextField";
import { useToast } from "@/components/ui/Toast";
import { DESK_CHANNELS, REPLY_TYPES, type DeskChannel } from "@/lib/db/enums";
import { formatIst } from "@/lib/time";
import { placeholdersIn } from "@/lib/validation/library";
import { changeReplyType } from "@/server/actions/ai";
import {
  deskBrief,
  deskDraft,
  deskInfo,
  deskMark,
  deskReply,
  deskTitle,
  type DeskResult,
} from "@/server/actions/desk";
import type { DeskItem } from "@/server/ai/desk-thread";
import { DictateButton } from "../DictateButton";
import styles from "./desk.module.scss";

type Mode = "reply" | "info" | "ask";

const MODES: {
  value: Mode;
  label: string;
  /** The text box's own label (the mode buttons use `label`). */
  field: string;
  placeholder: string;
  button: string;
}[] = [
  {
    value: "reply",
    label: "Their reply",
    field: "What they replied",
    placeholder: "Paste what they replied…",
    button: "Add reply & draft",
  },
  {
    value: "info",
    label: "Info about them",
    field: "What you learned about them",
    placeholder: "Add context: their posts, company news, what came up on a call…",
    button: "Add info",
  },
  {
    value: "ask",
    label: "Ask AI",
    field: "Instruction for the AI (optional)",
    placeholder:
      "Optional: 'make it shorter', 'mention Intercepts', 'send the follow-up on email'…",
    button: "Draft",
  },
];

const CHANNEL_KEY = "lumor.desk.channel";
const UNAVAILABLE =
  "Voice input isn't available here. Press the Globe (fn) key twice on a Mac, or Windows + H, to dictate.";
const SAVE_FAILED = "Couldn't save. Check your connection and try again.";

/**
 * The Outreach Desk (D-056; docs/specs/outreach-desk.md sections 4–9), inside the AI assistant
 * panel: the thread, Initiate, the composer and the draft cards.
 */
export function OutreachDesk({
  personId,
  firstName,
  items,
  brief,
  askTitle,
  today,
}: {
  personId: string;
  firstName: string;
  items: DeskItem[];
  brief: string | null;
  /** The rep has no title yet: ask once, for sign-offs. */
  askTitle: boolean;
  /** Today in IST (the app's clock), for the reply-by date. */
  today: string;
}) {
  const [mode, setMode] = useState<Mode>("reply");
  const [channel, setChannel] = useState<DeskChannel>("LinkedIn message");
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [drafting, setDrafting] = useState(false);
  const [busy, start] = useTransition();
  const end = useRef<HTMLDivElement>(null);

  // The channel choice follows the rep from person to person (spec section 4).
  useEffect(() => {
    try {
      const saved = localStorage.getItem(CHANNEL_KEY);
      if (saved && (DESK_CHANNELS as readonly string[]).includes(saved)) {
        // eslint-disable-next-line react-hooks/set-state-in-effect -- read once from the browser
        setChannel(saved as DeskChannel);
      }
    } catch {
      /* storage blocked: keep the default */
    }
  }, []);
  const pickChannel = (c: DeskChannel) => {
    setChannel(c);
    try {
      localStorage.setItem(CHANNEL_KEY, c);
    } catch {
      /* storage blocked */
    }
  };

  useEffect(() => {
    end.current?.scrollIntoView?.({ block: "nearest" });
  }, [items.length, drafting]);

  const nothingSent = !items.some((i) => i.kind === "sent");
  const current = MODES.find((m) => m.value === mode)!;

  const run = (work: () => Promise<DeskResult>, opts: { draft: boolean; clear?: boolean }) =>
    start(async () => {
      setError(null);
      setDrafting(opts.draft);
      try {
        const r = await work();
        if (r.ok) {
          if (opts.clear) setText("");
          if (r.draftError) setError(r.draftError);
        } else setError(r.error);
      } catch {
        setError(SAVE_FAILED);
      } finally {
        setDrafting(false);
      }
    });

  const submit = () => {
    if (busy) return;
    const t = text.trim();
    if (mode === "reply") {
      if (!t) return setError("Paste their reply first.");
      run(() => deskReply(personId, { channel, text: t }), { draft: true, clear: true });
    } else if (mode === "info") {
      if (!t) return setError("Add the info first.");
      run(() => deskInfo(personId, { channel, text: t }), { draft: false, clear: true });
    } else {
      run(
        () =>
          deskDraft(personId, {
            task: t ? "ask" : nothingSent ? "first" : "next",
            channel,
            instruction: t || null,
          }),
        { draft: true, clear: true },
      );
    }
  };

  return (
    <div className={styles.desk}>
      {askTitle && <TitlePrompt />}
      <div className={styles.thread} role="log" aria-label="Outreach thread" aria-live="polite">
        <BriefNote personId={personId} brief={brief} />
        {items.map((i) => (
          <Entry
            key={`${i.kind}-${i.id}`}
            item={i}
            firstName={firstName}
            personId={personId}
            channel={channel}
            today={today}
          />
        ))}
        {nothingSent && !drafting && (
          <div className={styles.start} aria-label="Start the conversation">
            <p className={styles.startTitle}>Start the conversation</p>
            <p className={styles.muted}>
              Add who they are above, pick a channel below, then Initiate for first messages.
            </p>
            <Button
              loading={busy}
              onClick={() =>
                run(() => deskDraft(personId, { task: "first", channel }), { draft: true })
              }
            >
              <Sparkles size={16} aria-hidden /> Initiate
            </Button>
          </div>
        )}
        {drafting && (
          <p className={styles.drafting}>
            <span className={styles.pulse} aria-hidden /> Drafting…
          </p>
        )}
        <div ref={end} />
      </div>

      <form
        className={styles.composer}
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <div className={styles.composerTop}>
          <div className={styles.modes} role="radiogroup" aria-label="What are you adding">
            {MODES.map((m) => (
              <label key={m.value} className={mode === m.value ? styles.modeOn : styles.mode}>
                <input
                  type="radio"
                  name="desk-mode"
                  className={styles.srOnly}
                  checked={mode === m.value}
                  onChange={() => setMode(m.value)}
                />
                {m.label}
              </label>
            ))}
          </div>
          <div className={styles.channel}>
            <SelectField
              label="Channel"
              value={channel}
              onChange={(e) => pickChannel(e.target.value as DeskChannel)}
              options={DESK_CHANNELS.map((c) => ({ value: c, label: c }))}
            />
          </div>
        </div>
        <TextArea
          label={current.field}
          rows={3}
          value={text}
          maxLength={5000}
          placeholder={current.placeholder}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
              e.preventDefault();
              submit();
            }
          }}
        />
        <div className={styles.composerActions}>
          <DictateButton
            disabled={busy}
            label="Dictate"
            unavailable={UNAVAILABLE}
            onText={(t) => setText((v) => (v.trim() ? `${v.trimEnd()} ${t}` : t))}
          >
            Dictate
          </DictateButton>
          <Button type="submit" loading={busy} disabled={busy}>
            {mode === "info" ? null : <Send size={16} aria-hidden />} {current.button}
          </Button>
        </div>
        <p className={styles.muted}>Cmd/Ctrl + Enter submits.</p>
        {error && <Alert tone="error">{error}</Alert>}
      </form>
    </div>
  );
}

// --- Who they are ---------------------------------------------------------------------------

function BriefNote({ personId, brief }: { personId: string; brief: string | null }) {
  const notify = useToast();
  const [editing, setEditing] = useState(!brief);
  const [value, setValue] = useState(brief ?? "");
  const [busy, start] = useTransition();
  const save = () =>
    start(async () => {
      const r = await deskBrief(personId, value);
      if (r.ok) setEditing(false);
      notify(r.ok ? "success" : "error", r.ok ? "Saved." : r.error);
    });
  return (
    <section className={styles.note} aria-label="Who they are">
      <p className={styles.noteLabel}>Who they are</p>
      {editing ? (
        <>
          <TextArea
            label="Who they are"
            rows={3}
            value={value}
            maxLength={5000}
            placeholder="Their role, what they work on, anything from their profile or posts…"
            onChange={(e) => setValue(e.target.value)}
          />
          <div className={styles.row}>
            <Button variant="secondary" loading={busy} onClick={save}>
              Save
            </Button>
            {brief && (
              <Button variant="ghost" disabled={busy} onClick={() => setEditing(false)}>
                Cancel
              </Button>
            )}
          </div>
        </>
      ) : (
        <>
          <p className={styles.noteText}>{brief}</p>
          <Button variant="ghost" onClick={() => setEditing(true)} aria-label="Edit who they are">
            <Pencil size={14} aria-hidden /> Edit
          </Button>
        </>
      )}
    </section>
  );
}

function TitlePrompt() {
  const notify = useToast();
  const [value, setValue] = useState("");
  const [busy, start] = useTransition();
  return (
    <div className={styles.titlePrompt}>
      <TextField
        label="Your title, for signatures"
        placeholder="e.g. Co-founder"
        maxLength={100}
        value={value}
        onChange={(e) => setValue(e.target.value)}
      />
      <Button
        variant="secondary"
        loading={busy}
        disabled={!value.trim()}
        onClick={() =>
          start(async () => {
            const r = await deskTitle(value);
            notify(r.ok ? "success" : "error", r.ok ? "Title saved." : r.error);
          })
        }
      >
        Save title
      </Button>
    </div>
  );
}

// --- Thread entries -------------------------------------------------------------------------

function Entry({
  item,
  firstName,
  personId,
  channel,
  today,
}: {
  item: DeskItem;
  firstName: string;
  personId: string;
  channel: DeskChannel;
  today: string;
}) {
  const when = formatIst(item.at, "d MMM, h:mm aaa");
  switch (item.kind) {
    case "info":
      return (
        <div className={styles.note}>
          <p className={styles.noteLabel}>
            Note · {item.who ?? "Someone"} · {when}
          </p>
          <p className={styles.noteText}>{item.text}</p>
        </div>
      );
    case "event":
      return (
        <p className={styles.event}>
          {item.label}
          {item.text ? `: ${item.text}` : ""} · {when}
        </p>
      );
    case "them":
      return (
        <div className={styles.them}>
          <p className={styles.meta}>
            {firstName} · {item.channel} · {when}
          </p>
          <p className={styles.bubbleText}>{item.text}</p>
          <ReplyType activityId={item.id} initial={item.replyType} />
        </div>
      );
    case "sent":
      return (
        <div className={styles.sent}>
          <p className={styles.metaSent}>
            {item.called ? "You called · Call" : `You sent · ${item.channel}`} · {when}
            {item.approach ? ` · ${item.approach}` : ""}
          </p>
          {item.subject && <p className={styles.bubbleText}>Subject: {item.subject}</p>}
          <p className={styles.bubbleText}>{item.text}</p>
        </div>
      );
    case "ask":
      return (
        <div className={styles.ask}>
          <p className={styles.meta}>
            You asked{item.source === "chat" ? " (AI chat)" : ""} · {when}
          </p>
          <p className={styles.bubbleText}>{item.text}</p>
        </div>
      );
    case "draft":
      return (
        <DraftCard
          item={item}
          personId={personId}
          channel={item.channel ?? channel}
          when={when}
          today={today}
        />
      );
  }
}

function ReplyType({ activityId, initial }: { activityId: string; initial: string | null }) {
  const notify = useToast();
  const [value, setValue] = useState(initial ?? "");
  const [busy, start] = useTransition();
  return (
    <div className={styles.replyType}>
      <SelectField
        label="Reply type"
        value={value}
        disabled={busy}
        options={[
          { value: "", label: "Not set" },
          ...REPLY_TYPES.map((r) => ({ value: r, label: r })),
        ]}
        onChange={(e) => {
          const next = e.target.value;
          if (!next) return;
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

// --- Draft cards ----------------------------------------------------------------------------

type Draft = Extract<DeskItem, { kind: "draft" }>;

function DraftCard({
  item,
  personId,
  channel,
  when,
  today,
}: {
  item: Draft;
  personId: string;
  channel: DeskChannel;
  when: string;
  today: string;
}) {
  return (
    <section className={styles.draft} aria-label={`AI drafts · ${channel}`}>
      <p className={styles.meta}>
        <Sparkles size={14} aria-hidden /> AI drafts ·{" "}
        {item.source === "chat" ? "AI chat" : channel} · {when}
      </p>
      {item.warning && <Alert tone="error">{item.warning}</Alert>}
      {item.options.length > 0 && (
        <div className={styles.options}>
          {item.options.map((o, i) => (
            <OptionCard
              key={i}
              draft={item}
              index={i}
              personId={personId}
              channel={channel}
              label={o.label}
              initialSubject={o.subject}
              initialText={o.text}
              sent={item.sent.includes(i)}
              today={today}
            />
          ))}
        </div>
      )}
      {item.tip && <p className={styles.tip}>{item.tip}</p>}
    </section>
  );
}

function OptionCard({
  draft,
  index,
  personId,
  channel,
  label,
  initialSubject,
  initialText,
  sent,
  today,
}: {
  draft: Draft;
  index: number;
  personId: string;
  channel: DeskChannel;
  label: string;
  initialSubject: string;
  initialText: string;
  sent: boolean;
  today: string;
}) {
  const notify = useToast();
  const [subject, setSubject] = useState(initialSubject);
  const [text, setText] = useState(initialText);
  const [editing, setEditing] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [warnings, setWarnings] = useState<string[] | null>(null);
  const [busy, start] = useTransition();
  const call = channel === "Call";
  const hasSubject = channel === "Email" || channel === "LinkedIn InMail";
  // Messages expect a reply (F18 reply deadlines and nudges): 2 days by default.
  const isMessage = !call && channel !== "LinkedIn connection note";
  const [replyBy, setReplyBy] = useState(isMessage ? plusDays(today, 2) : "");

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(
        hasSubject && subject ? `Subject: ${subject}\n\n${text}` : text,
      );
      notify("success", "Copied.");
    } catch {
      notify("error", "Couldn't copy. Select the text and copy it.");
    }
  };

  const mark = (override = false) => {
    const left = [...placeholdersIn(text), ...placeholdersIn(hasSubject ? subject : "")];
    if (left.length) {
      setProblem(`Fill in {${left[0]}} first.`);
      setEditing(true);
      return;
    }
    setProblem(null);
    start(async () => {
      const r = await deskMark(personId, {
        source: draft.source,
        draftId: draft.id,
        optionIndex: index,
        text,
        subject: hasSubject ? subject : null,
        channel,
        override,
        replyBy: isMessage ? replyBy || null : null,
      });
      if (r.ok) {
        setWarnings(null);
        notify("success", call ? "Logged as called." : "Marked as sent.");
      } else if (r.warnings?.length) setWarnings(r.warnings);
      else setProblem(r.error);
    });
  };

  return (
    <article className={styles.option} aria-label={`Option: ${label}`}>
      <p className={styles.optionLabel}>{label}</p>
      {editing ? (
        <>
          {hasSubject && (
            <TextField
              label="Subject"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
            />
          )}
          <TextArea
            label={`Edit ${label}`}
            rows={6}
            value={text}
            maxLength={5000}
            onChange={(e) => setText(e.target.value)}
          />
        </>
      ) : (
        <>
          {hasSubject && subject && <p className={styles.subject}>Subject: {subject}</p>}
          <p className={styles.optionText}>{text}</p>
        </>
      )}
      {isMessage && !sent && (
        <TextField
          label="Expect a reply by"
          type="date"
          min={today}
          value={replyBy}
          onChange={(e) => setReplyBy(e.target.value)}
        />
      )}
      {problem && <p className={styles.problem}>{problem}</p>}
      {warnings && (
        <div className={styles.warnings}>
          <Alert tone="warning">
            <ul className={styles.list}>
              {warnings.map((w) => (
                <li key={w}>{w}</li>
              ))}
            </ul>
          </Alert>
          <div className={styles.row}>
            <Button onClick={() => mark(true)} loading={busy}>
              Log anyway
            </Button>
            <Button variant="secondary" onClick={() => setWarnings(null)} disabled={busy}>
              Cancel
            </Button>
          </div>
        </div>
      )}
      <div className={styles.row}>
        <Button variant="ghost" onClick={copy} aria-label={`Copy ${label}`}>
          <Copy size={14} aria-hidden /> Copy
        </Button>
        <Button
          variant="ghost"
          onClick={() => setEditing((e) => !e)}
          aria-label={editing ? `Done editing ${label}` : `Edit ${label}`}
        >
          <Pencil size={14} aria-hidden /> {editing ? "Done" : "Edit"}
        </Button>
        {sent ? (
          <span className={styles.sentMark}>
            <Check size={14} aria-hidden /> {call ? "Called" : "Sent"}
          </span>
        ) : (
          <Button
            variant="secondary"
            loading={busy}
            onClick={() => mark()}
            aria-label={`${call ? "Mark as called" : "Mark as sent"}: ${label}`}
          >
            {call ? <Phone size={14} aria-hidden /> : <Check size={14} aria-hidden />}{" "}
            {call ? "Mark as called" : "Mark as sent"}
          </Button>
        )}
      </div>
    </article>
  );
}

/** An IST date plus n days. */
function plusDays(date: string, n: number) {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}
