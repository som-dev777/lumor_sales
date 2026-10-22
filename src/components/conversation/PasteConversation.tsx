"use client";

import { Trash2 } from "lucide-react";
import { useState, useTransition, type ReactNode } from "react";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";
import { SelectField } from "@/components/ui/SelectField";
import { TextArea } from "@/components/ui/TextArea";
import { TextField } from "@/components/ui/TextField";
import { useToast } from "@/components/ui/Toast";
import { THREAD_CHANNELS } from "@/lib/db/enums";
import { splitPasted } from "@/server/actions/ai";
import { savePastedRows } from "@/server/actions/conversation";
import styles from "./conversation.module.scss";

type Row = {
  key: number;
  keep: boolean;
  duplicate: boolean;
  from: "me" | "them";
  at: string;
  channel: string;
  text: string;
};

const channelOptions = THREAD_CHANNELS.map((c) => ({ value: c, label: c }));

/**
 * Paste a whole conversation (F18): the AI (P05) splits it into messages; the rep checks who
 * sent each one and when, then saves. Nothing is saved before that.
 */
export function PasteConversation({
  personId,
  firstName,
  defaultChannel,
  now,
  trigger,
}: {
  personId: string;
  firstName: string;
  defaultChannel: string;
  now: string;
  trigger: ReactNode;
}) {
  const notify = useToast();
  const [open, setOpen] = useState(false);
  const [pasted, setPasted] = useState("");
  const [channel, setChannel] = useState(defaultChannel);
  const [rows, setRows] = useState<Row[] | null>(null);
  const [notes, setNotes] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, start] = useTransition();

  const reset = () => {
    setPasted("");
    setRows(null);
    setNotes([]);
    setError(null);
  };

  const split = () =>
    start(async () => {
      setError(null);
      const r = await splitPasted(personId, pasted);
      if (!r.ok) return setError(r.error);
      if (r.data.rows.length === 0) {
        return setError("No messages were found in that text. Check what you pasted.");
      }
      setNotes(r.data.notes);
      setRows(
        r.data.rows.map((m, i) => ({
          key: i,
          keep: !m.duplicate,
          duplicate: m.duplicate,
          from: m.from,
          at: m.at,
          channel,
          text: m.text,
        })),
      );
    });

  const kept = rows?.filter((r) => r.keep) ?? [];
  const save = () =>
    start(async () => {
      setError(null);
      const r = await savePastedRows(
        personId,
        kept.map(({ from, at, channel: c, text }) => ({ from, at, channel: c, text })),
      );
      if (!r.ok) return setError(r.error);
      notify("success", r.message ?? "Saved.");
      reset();
      setOpen(false);
    });

  const update = (key: number, values: Partial<Row>) =>
    setRows((list) => list?.map((r) => (r.key === key ? { ...r, ...values } : r)) ?? null);

  return (
    <>
      <Button variant="secondary" onClick={() => setOpen(true)}>
        {trigger}
      </Button>
      <Dialog
        open={open}
        onOpenChange={(o) => {
          setOpen(o);
          if (!o) reset();
        }}
        title="Paste a whole conversation"
        size="lg"
      >
        <div className={styles.form}>
          {error && <Alert tone="error">{error}</Alert>}
          {rows === null ? (
            <>
              <TextArea
                label="Conversation"
                hint="Copy the whole thread from LinkedIn or your email and paste it here. The AI splits it into messages for you to check. Nothing is saved yet."
                rows={10}
                value={pasted}
                maxLength={20000}
                onChange={(e) => setPasted(e.target.value)}
              />
              <SelectField
                label="Where it happened"
                value={channel}
                onChange={(e) => setChannel(e.target.value)}
                options={channelOptions}
              />
              <div className={styles.actions}>
                <Button onClick={split} loading={busy} disabled={!pasted.trim()}>
                  Split into messages
                </Button>
                {busy && <span className={styles.muted}>Thinking… (up to 30 seconds)</span>}
              </div>
            </>
          ) : (
            <>
              <p className={styles.muted}>
                Check who sent each message and when. Untick anything you don&rsquo;t want to save.
              </p>
              {notes.length > 0 && (
                <Alert tone="info">
                  <ul className={styles.list}>
                    {notes.map((n) => (
                      <li key={n}>{n}</li>
                    ))}
                  </ul>
                </Alert>
              )}
              <ol className={styles.rows}>
                {rows.map((r, i) => (
                  <li key={r.key} className={styles.rowCard} aria-label={`Message ${i + 1}`}>
                    <div className={styles.rowHead}>
                      <label className={styles.check}>
                        <input
                          type="checkbox"
                          checked={r.keep}
                          onChange={(e) => update(r.key, { keep: e.target.checked })}
                        />
                        Save message {i + 1}
                      </label>
                      {r.duplicate && (
                        <span className={styles.muted}>Already in the conversation</span>
                      )}
                      <Button
                        variant="ghost"
                        aria-label={`Remove message ${i + 1}`}
                        onClick={() =>
                          setRows((list) => list?.filter((x) => x.key !== r.key) ?? null)
                        }
                      >
                        <Trash2 size={16} aria-hidden />
                      </Button>
                    </div>
                    <div className={styles.fields}>
                      <SelectField
                        label="From"
                        value={r.from}
                        onChange={(e) => update(r.key, { from: e.target.value as "me" | "them" })}
                        options={[
                          { value: "me", label: "Me" },
                          { value: "them", label: firstName },
                        ]}
                      />
                      <TextField
                        label="When"
                        type="datetime-local"
                        value={r.at}
                        max={now}
                        error={r.keep && !r.at ? "Add the date and time." : undefined}
                        onChange={(e) => update(r.key, { at: e.target.value })}
                      />
                      <SelectField
                        label="Channel"
                        value={r.channel}
                        onChange={(e) => update(r.key, { channel: e.target.value })}
                        options={channelOptions}
                      />
                    </div>
                    <TextArea
                      label="Text"
                      rows={2}
                      value={r.text}
                      maxLength={5000}
                      onChange={(e) => update(r.key, { text: e.target.value })}
                    />
                  </li>
                ))}
              </ol>
              <div className={styles.actions}>
                <Button onClick={save} loading={busy} disabled={kept.length === 0}>
                  Save {kept.length} {kept.length === 1 ? "message" : "messages"}
                </Button>
                <Button variant="secondary" onClick={() => setRows(null)} disabled={busy}>
                  Back
                </Button>
              </div>
            </>
          )}
        </div>
      </Dialog>
    </>
  );
}
