"use client";

import { MessageSquarePlus, Send, Sparkles, Trash2 } from "lucide-react";
import { useEffect, useRef, useState, useTransition } from "react";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { SelectField } from "@/components/ui/SelectField";
import { TextArea } from "@/components/ui/TextArea";
import { useToast } from "@/components/ui/Toast";
import { REPLY_TYPES } from "@/lib/db/enums";
import { changeReplyType, chatDelete, chatOpen, chatSend } from "@/server/actions/ai";
import type { ChatSummary, ChatView, SavedReply } from "@/server/ai/chat";
import { DictateButton } from "./DictateButton";
import { SuggestionCard, type SituationKind } from "./SuggestionCard";
import styles from "./ai.module.scss";

/** One-click questions; `ask` is what's sent when it says more than the button (D-055). */
const STARTERS: { label: string; ask?: string }[] = [
  { label: "Suggest my next message" },
  {
    label: "They accepted my LinkedIn request: first message?",
    ask: "They just accepted my LinkedIn connection request. Look closely at who they are (their role, seniority, company, industry and persona) and write my first LinkedIn message to them. Make it personal and relevant to their work, short, and not a hard pitch.",
  },
  { label: "How should I handle their objection?" },
  { label: "Write a short follow-up" },
];

/**
 * The AI chat on a person (F23): talk it through with the AI, then **Use this message** opens a
 * draft in the editor, and Mark as sent records it in the conversation.
 */
export function ChatTool({
  personId,
  situation,
  situationKind,
  channel,
  initialChats,
  initialChat,
}: {
  personId: string;
  situation: string;
  situationKind: SituationKind;
  channel: string;
  initialChats: ChatSummary[];
  initialChat: ChatView | null;
}) {
  const notify = useToast();
  const [chats, setChats] = useState(initialChats);
  const [chat, setChat] = useState<ChatView | null>(initialChat);
  const [text, setText] = useState("");
  // The rep's message while the AI is answering, shown straight away.
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [using, setUsing] = useState<string | null>(null);
  const [busy, start] = useTransition();
  const [deleting, setDeleting] = useState(false);
  const [savedReply, setSavedReply] = useState<(SavedReply & { key: number }) | null>(null);
  const end = useRef<HTMLDivElement>(null);

  useEffect(() => {
    end.current?.scrollIntoView?.({ block: "nearest" });
  }, [chat, pending]);

  const send = (message: string) => {
    const m = message.trim();
    if (!m || busy) return;
    setError(null);
    setPending(m);
    setText("");
    start(async () => {
      const r = await chatSend(personId, chat?.id ?? null, m);
      setPending(null);
      if (r.ok) {
        setChat(r.data.chat);
        setChats(r.data.chats);
        if (r.data.savedReply) setSavedReply({ ...r.data.savedReply, key: Date.now() });
      } else {
        setError(r.error);
        setText(m);
      }
    });
  };

  const open = (id: string) => {
    if (!id) {
      setChat(null);
      return;
    }
    start(async () => {
      const r = await chatOpen(id);
      if (r.ok) setChat(r.data);
      else notify("error", r.error);
    });
  };

  const messages = chat?.messages ?? [];
  const lastAi = [...messages].reverse().find((m) => m.role === "ai");
  // The draft the rep chose: edited and marked as sent below the chat, not inside it.
  const active = (() => {
    for (const m of messages) {
      const i = m.drafts.findIndex((_, j) => `${m.id}-${j}` === using);
      if (i >= 0) return { message: m, draft: m.drafts[i] };
    }
    return null;
  })();

  return (
    <div className={styles.stack}>
      <p>{situation}</p>
      <div className={styles.chatBar}>
        {chats.length > 0 && (
          <div className={styles.inline}>
            <SelectField
              label="Chats"
              value={chat?.id ?? ""}
              disabled={busy}
              onChange={(e) => open(e.target.value)}
              options={[
                ...(chat ? [] : [{ value: "", label: "New chat" }]),
                ...chats.map((c) => ({ value: c.id, label: c.title })),
              ]}
            />
          </div>
        )}
        <div className={styles.row}>
          <Button
            variant="secondary"
            disabled={busy || !chat}
            onClick={() => {
              setChat(null);
              setError(null);
            }}
          >
            <MessageSquarePlus size={16} aria-hidden /> New chat
          </Button>
          {chat && (
            <Button variant="ghost" disabled={busy} onClick={() => setDeleting(true)}>
              <Trash2 size={16} aria-hidden /> Delete chat
            </Button>
          )}
        </div>
      </div>

      <div className={styles.chatLog} role="log" aria-label="AI chat" aria-live="polite">
        {messages.length === 0 && !pending && (
          <div className={styles.chatEmpty}>
            <p className={styles.muted}>
              Ask anything about this lead. The AI knows the person, their company and the whole
              conversation below. Ask for a message whenever you&rsquo;re ready.
            </p>
            <div className={styles.row}>
              {STARTERS.map((s) => (
                <button
                  key={s.label}
                  type="button"
                  className={styles.starter}
                  disabled={busy}
                  onClick={() => send(s.ask ?? s.label)}
                >
                  {s.label}
                </button>
              ))}
            </div>
          </div>
        )}
        {messages.map((m) =>
          m.role === "rep" ? (
            <div key={m.id} className={styles.bubbleRep}>
              <span className={styles.srOnly}>You: </span>
              {m.content}
            </div>
          ) : (
            <div key={m.id} className={styles.aiTurn}>
              <div className={styles.bubbleAi}>
                <span className={styles.srOnly}>AI: </span>
                <Sparkles size={14} aria-hidden className={styles.aiMark} />
                {m.content}
              </div>
              {m.flags.length > 0 && (
                <Alert tone="warning">
                  <strong>Check before sending:</strong>
                  <ul className={styles.list}>
                    {m.flags.map((f) => (
                      <li key={f}>{f}</li>
                    ))}
                  </ul>
                </Alert>
              )}
              {m.drafts.map((d, i) => {
                const key = `${m.id}-${i}`;
                return (
                  <div
                    key={key}
                    className={styles.draft}
                    aria-current={using === key ? "true" : undefined}
                  >
                    {d.approach && <p className={styles.approach}>{d.approach}</p>}
                    <p className={styles.draftText}>{d.text}</p>
                    <div className={styles.row}>
                      <Button
                        variant="secondary"
                        disabled={using === key}
                        onClick={() => setUsing(key)}
                      >
                        {using === key ? "Editing below" : "Use this message"}
                      </Button>
                      <Button
                        variant="ghost"
                        onClick={async () => {
                          try {
                            await navigator.clipboard.writeText(d.text);
                            notify("success", "Copied.");
                          } catch {
                            notify("error", "Couldn't copy. Select the text and copy it.");
                          }
                        }}
                      >
                        Copy
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          ),
        )}
        {pending && (
          <>
            <div className={styles.bubbleRep}>{pending}</div>
            <p className={styles.muted}>Thinking… (up to 30 seconds)</p>
          </>
        )}
        <div ref={end} />
      </div>

      {active && (
        <SuggestionCard
          key={using}
          personId={personId}
          suggestion={active.draft}
          channel={channel}
          situation={situationKind}
          replyBy={active.message === lastAi ? active.message.replyBy : null}
        />
      )}
      {error && <Alert tone="error">{error}</Alert>}
      {savedReply && (
        <ReplyTypePicker
          key={savedReply.key}
          activityId={savedReply.activityId}
          initial={savedReply.replyType}
        />
      )}

      <form
        className={styles.chatForm}
        onSubmit={(e) => {
          e.preventDefault();
          send(text);
        }}
      >
        <TextArea
          label="Message the AI"
          rows={2}
          value={text}
          maxLength={2000}
          placeholder="e.g. They said budget is tight. How should I reply?"
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault();
              send(text);
            }
          }}
        />
        <div className={styles.micRow}>
          <DictateButton
            disabled={busy}
            onText={(t) => setText((v) => (v.trim() ? `${v.trimEnd()} ${t}` : t))}
          />
          <Button type="submit" loading={busy && pending !== null} disabled={!text.trim() || busy}>
            <Send size={16} aria-hidden /> Send
          </Button>
        </div>
      </form>
      <p className={styles.muted}>
        Enter sends · Shift+Enter starts a new line · the mic types what you say.
      </p>

      <ConfirmDialog
        open={deleting}
        onOpenChange={setDeleting}
        title="Delete chat"
        description="This chat will be deleted for good. Messages already in the conversation stay."
        confirmLabel="Delete chat"
        tone="danger"
        onConfirm={async () => {
          setDeleting(false);
          if (!chat) return;
          const r = await chatDelete(personId, chat.id);
          if (r.ok) {
            setChats(r.data);
            setChat(null);
            notify("success", "Chat deleted.");
          } else notify("error", r.error);
        }}
      />
    </div>
  );
}

/** The AI saved a reply type on the prospect's message; the rep can change it here. */
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
