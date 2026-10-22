"use client";

import { Copy } from "lucide-react";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/Button";
import { SelectField } from "@/components/ui/SelectField";
import { TextArea } from "@/components/ui/TextArea";
import { TextField } from "@/components/ui/TextField";
import { useToast } from "@/components/ui/Toast";
import { sendAiMessage } from "@/server/actions/ai";
import styles from "./ai.module.scss";

export type Suggestion = { approach: string; text: string };
export type SituationKind = "start" | "reply" | "wait" | "nudge" | "close";

const CHANNELS = ["LinkedIn", "InMail", "Email", "WhatsApp"] as const;

/**
 * One AI message: edit it, copy it, then Mark as sent with its channel and, for F18, the
 * reply-by date the rep confirms (the AI only suggests it).
 */
export function SuggestionCard({
  personId,
  suggestion,
  templateId,
  channel = "LinkedIn",
  situation = null,
  replyBy = null,
}: {
  personId: string;
  suggestion: Suggestion;
  templateId?: string;
  channel?: string;
  situation?: SituationKind | null;
  replyBy?: { date: string; reason: string } | null;
}) {
  const notify = useToast();
  const [text, setText] = useState(suggestion.text);
  const [via, setVia] = useState<string>(
    (CHANNELS as readonly string[]).includes(channel) ? channel : "LinkedIn",
  );
  const [date, setDate] = useState(replyBy?.date ?? "");
  const [sent, setSent] = useState(false);
  const [busy, start] = useTransition();
  const askDate = situation !== null && situation !== "close";
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
      {situation !== null && (
        <div className={styles.grid2}>
          <SelectField
            label="Sent on"
            value={via}
            onChange={(e) => setVia(e.target.value)}
            options={CHANNELS.map((c) => ({ value: c, label: c }))}
          />
          {askDate && (
            <TextField
              label="Expect a reply by"
              type="date"
              value={date}
              hint={replyBy?.reason}
              onChange={(e) => setDate(e.target.value)}
            />
          )}
        </div>
      )}
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
                ...(situation !== null
                  ? {
                      channel: via,
                      situation,
                      replyBy: askDate && date ? date : null,
                    }
                  : {}),
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
