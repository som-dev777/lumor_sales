"use client";

// An outreach sprint (F30, D-065): one person at a time. Sales Hub writes the note or message and
// opens the profile; the rep pastes and sends it on LinkedIn, then clicks Sent ✓ here. The next
// cards' drafts are prepared while the rep works on this one.
import { Copy, ExternalLink, SkipForward, UserX } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";
import { sprintDraft, sprintNotFit, sprintSend } from "@/server/actions/sprint";
import type { SprintCard, SprintDraft, SprintLimits } from "@/server/sprint";
import styles from "./sprint.module.scss";

const NOTE_MAX = 300;
const AHEAD = 3;

type DraftState =
  | { status: "loading" }
  | { status: "ready"; draft: SprintDraft | null; text: string; option: number; error?: string };

type Props = {
  kind: "connect" | "follow";
  cards: SprintCard[];
  limits?: SprintLimits;
};

const placeholderIn = (t: string) => /\{[^}]+\}/.exec(t)?.[0] ?? null;

export function Sprint({ kind, cards, limits }: Props) {
  const notify = useToast();
  const [queue, setQueue] = useState(cards);
  const [sent, setSent] = useState(0);
  const [drafts, setDrafts] = useState<Record<string, DraftState>>({});
  const [error, setError] = useState<string | null>(null);
  const [warnings, setWarnings] = useState<string[] | null>(null);
  const [pending, start] = useTransition();
  const asked = useRef(new Set<string>());
  const total = cards.length;
  const card = queue[0];

  // Prepare the drafts for this card and the next few.
  useEffect(() => {
    for (const c of queue.slice(0, AHEAD)) {
      if (asked.current.has(c.personId)) continue;
      asked.current.add(c.personId);
      setDrafts((d) => ({ ...d, [c.personId]: { status: "loading" } }));
      sprintDraft(c.personId, { kind: c.kind, channel: c.channel }).then((r) => {
        const text = r.ok ? (r.data?.options[0]?.text ?? "") : "";
        setDrafts((d) => ({
          ...d,
          [c.personId]: {
            status: "ready",
            draft: r.ok ? (r.data ?? null) : null,
            text,
            option: 0,
            error: r.ok ? undefined : r.error,
          },
        }));
      });
    }
  }, [queue]);

  const state = card ? drafts[card.personId] : undefined;
  const ready = state?.status === "ready" ? state : null;
  const text = ready?.text ?? "";
  const tooLong = card?.kind === "connect" && text.trim().length > NOTE_MAX;
  const left = placeholderIn(text);

  const setText = (value: string) =>
    card &&
    setDrafts((d) => {
      const cur = d[card.personId];
      return cur?.status === "ready" ? { ...d, [card.personId]: { ...cur, text: value } } : d;
    });

  const pickOption = (i: number) =>
    card &&
    setDrafts((d) => {
      const cur = d[card.personId];
      if (cur?.status !== "ready" || !cur.draft) return d;
      return {
        ...d,
        [card.personId]: { ...cur, option: i, text: cur.draft.options[i]?.text ?? "" },
      };
    });

  const next = useCallback(() => {
    setError(null);
    setWarnings(null);
    setQueue((q) => q.slice(1));
  }, []);

  const copy = useCallback(async () => {
    if (!text.trim()) return;
    try {
      await navigator.clipboard.writeText(text.trim());
      notify("success", kind === "connect" ? "Note copied. Paste it on LinkedIn." : "Copied.");
    } catch {
      notify("error", "Couldn't copy. Select the text and copy it yourself.");
    }
  }, [text, kind, notify]);

  const open = useCallback(() => {
    if (card?.profileUrl) window.open(card.profileUrl, "_blank", "noopener,noreferrer");
  }, [card]);

  const send = useCallback(
    (override = false) => {
      if (!card || !ready || tooLong || left || !text.trim()) return;
      start(async () => {
        const r = await sprintSend(card.personId, {
          kind: card.kind,
          text,
          draftId: ready.draft?.id ?? null,
          optionIndex: ready.option,
          override,
        });
        if (!r.ok) {
          setError(r.error);
          setWarnings(r.warnings ?? null);
          return;
        }
        setSent((n) => n + 1);
        notify("success", `Logged for ${card.name}.`);
        next();
      });
    },
    [card, ready, tooLong, left, text, notify, next],
  );

  const skip = useCallback(() => {
    setError(null);
    setWarnings(null);
    setQueue((q) => (q.length > 1 ? [...q.slice(1), q[0]] : q));
  }, []);

  const notFit = () =>
    card &&
    start(async () => {
      const r = await sprintNotFit(card.personId);
      if (!r.ok) {
        setError(r.error);
        return;
      }
      notify("success", `${card.name} marked Lost: not a fit.`);
      next();
    });

  // Keys: O open, C copy, S sent, K skip (not while typing).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (t.closest("textarea, input, select") || e.metaKey || e.ctrlKey || e.altKey) return;
      const key = e.key.toLowerCase();
      if (key === "o") open();
      else if (key === "c") void copy();
      else if (key === "s") send();
      else if (key === "k") skip();
      else return;
      e.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, copy, send, skip]);

  const progress =
    kind === "connect" && limits
      ? `${limits.sentToday + sent} of ${limits.dailyTarget} sent today · ${limits.sentWeek + sent} of ${limits.weeklyLimit} this week`
      : `${sent} of ${total} done`;

  return (
    <section className={styles.sprint} aria-label="Sprint">
      <div className={styles.progressRow}>
        <p className={styles.progressText} role="status">
          {progress}
        </p>
        <progress
          className={styles.bar}
          value={sent}
          max={Math.max(total, 1)}
          aria-label="Sprint progress"
        />
      </div>

      {!card ? (
        <div className={styles.done}>
          <p className={styles.doneTitle}>
            {total === 0 ? "Nobody to do right now." : "All done for this sprint."}
          </p>
          <p className={styles.muted}>
            {kind === "connect"
              ? total === 0 && limits && limits.left === 0
                ? "You've reached today's target or this week's limit."
                : "Add more people from Sales Navigator with People → Add many."
              : "New follow-ups appear as plan steps come due and people reply."}
          </p>
          <Link href="/" className={styles.back}>
            Back to My tasks
          </Link>
        </div>
      ) : (
        <article className={styles.card} aria-label={`Card: ${card.name}`}>
          <header className={styles.head}>
            <div>
              <h2 className={styles.name}>{card.name}</h2>
              <p className={styles.meta}>
                {[card.title, card.company].filter(Boolean).join(" · ") || "No title or company"}
              </p>
            </div>
            <div className={styles.tags}>
              <span className={styles.tag}>{card.label}</span>
              {card.persona && (
                <span className={styles.tag}>
                  {card.persona}
                  {card.tier ? ` · Tier ${card.tier}` : ""}
                </span>
              )}
            </div>
          </header>

          {card.brief && (
            <p className={styles.brief}>
              <strong>Who they are:</strong> {card.brief}
            </p>
          )}
          {card.theySaid && (
            <p className={styles.brief}>
              <strong>They said:</strong> {card.theySaid}
            </p>
          )}

          {!state || state.status === "loading" ? (
            <p className={styles.muted} role="status">
              Writing the {card.kind === "connect" ? "note" : "message"}…
            </p>
          ) : (
            <>
              {state.error && <Alert tone="warning">{state.error}</Alert>}
              {state.draft && state.draft.options.length > 1 && (
                <div className={styles.options} role="group" aria-label="Drafts">
                  {state.draft.options.map((o, i) => (
                    <button
                      key={i}
                      type="button"
                      className={i === state.option ? styles.optionOn : styles.option}
                      aria-pressed={i === state.option}
                      onClick={() => pickOption(i)}
                    >
                      {o.label}
                    </button>
                  ))}
                </div>
              )}
              <label className={styles.label} htmlFor="sprint-text">
                {card.kind === "connect" ? "Connection note" : "Message"}
              </label>
              <textarea
                id="sprint-text"
                className={styles.text}
                rows={card.kind === "connect" ? 4 : 7}
                value={text}
                onChange={(e) => setText(e.target.value)}
              />
              <p className={tooLong ? styles.countOver : styles.count}>
                {card.kind === "connect"
                  ? `${text.trim().length} / ${NOTE_MAX} characters`
                  : `${text.trim().length} characters`}
                {left && ` · fill in ${left} before sending`}
              </p>
            </>
          )}

          {error && (
            <Alert tone="error">
              {error}
              {warnings && warnings.length > 0 && (
                <>
                  <ul className={styles.warnings}>
                    {warnings.map((w) => (
                      <li key={w}>{w}</li>
                    ))}
                  </ul>
                  <Button variant="secondary" onClick={() => send(true)} loading={pending}>
                    Log anyway
                  </Button>
                </>
              )}
            </Alert>
          )}

          <div className={styles.actions}>
            {card.profileUrl ? (
              <a
                className={styles.linkButton}
                href={card.profileUrl}
                target="_blank"
                rel="noopener noreferrer"
              >
                <ExternalLink size={16} aria-hidden />
                {card.kind === "connect" ? "Open profile" : "Open conversation"}
              </a>
            ) : (
              <span className={styles.muted}>No profile link</span>
            )}
            <Button variant="secondary" onClick={() => void copy()} disabled={!text.trim()}>
              <Copy size={16} aria-hidden />
              {card.kind === "connect" ? "Copy note" : "Copy message"}
            </Button>
            <Button
              onClick={() => send()}
              loading={pending}
              disabled={!ready || !text.trim() || tooLong || Boolean(left)}
            >
              Sent ✓
            </Button>
            <Button variant="ghost" onClick={skip} disabled={pending}>
              <SkipForward size={16} aria-hidden />
              Skip
            </Button>
            {card.kind === "connect" && (
              <Button variant="ghost" onClick={notFit} disabled={pending}>
                <UserX size={16} aria-hidden />
                Not a fit
              </Button>
            )}
          </div>
          <p className={styles.keys}>
            Keys: O open · C copy · S sent · K skip. Send it on LinkedIn yourself, then click Sent
            ✓.
          </p>
        </article>
      )}
    </section>
  );
}
