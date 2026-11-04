"use client";

import { MessageSquare, NotebookPen } from "lucide-react";
import { useState, useTransition } from "react";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { TextField } from "@/components/ui/TextField";
import { askCompanyAi } from "@/server/actions/ai";
import type { CompanyInput } from "@/lib/validation/leads";
import styles from "./leads.module.scss";

type Turn = { question: string; answer: string; sources: string[] };

/**
 * Ask AI about this company (P10, D-054): a chat box on the company form. The AI searches the
 * web and answers with sources; an answer can be added to the notes. Nothing else is stored.
 */
export function CompanyAiChat({
  getCompany,
  onAddToNotes,
  startOpen,
}: {
  getCompany: () => CompanyInput;
  onAddToNotes: (text: string) => void;
  /** Opens by itself after Fill with AI. */
  startOpen: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [turns, setTurns] = useState<Turn[]>([]);
  const [question, setQuestion] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [added, setAdded] = useState<Set<number>>(new Set());
  const [busy, start] = useTransition();

  const ask = () => {
    if (!question.trim() || busy) return;
    start(async () => {
      setError(null);
      const r = await askCompanyAi({
        company: getCompany(),
        chat: turns.map(({ question: q, answer }) => ({ question: q, answer })),
        question,
      });
      if (!r.ok) {
        setError(r.error);
        return;
      }
      setTurns((t) => [...t.slice(-9), { question, ...r.data }]);
      setQuestion("");
    });
  };

  if (!open && !startOpen) {
    return (
      <div>
        <Button variant="ghost" onClick={() => setOpen(true)}>
          <MessageSquare size={16} aria-hidden /> Ask AI about this company
        </Button>
      </div>
    );
  }
  return (
    <section className={styles.aiChat} aria-label="Ask AI about this company">
      <h3 className={styles.aiChatTitle}>
        <MessageSquare size={16} aria-hidden /> Ask AI about this company
      </h3>
      <p className={styles.muted}>
        Ask anything, like their offices, size, leaders or recent news. The AI searches the web.
      </p>
      {turns.length > 0 && (
        <div className={styles.aiChatLog} role="log" aria-label="Answers about this company">
          {turns.map((t, i) => (
            <div key={i} className={styles.aiTurn}>
              <p className={styles.aiQuestion}>
                <strong>You:</strong> {t.question}
              </p>
              <p className={styles.aiAnswer}>{t.answer}</p>
              {t.sources.length > 0 && (
                <p className={styles.fillSources}>
                  Sources:{" "}
                  {t.sources.map((s, j) => (
                    <span key={s}>
                      {j > 0 && " · "}
                      <a href={s} target="_blank" rel="noopener noreferrer">
                        {new URL(s).hostname.replace(/^www\./, "")}
                      </a>
                    </span>
                  ))}
                </p>
              )}
              <div>
                <Button
                  variant="ghost"
                  disabled={added.has(i)}
                  onClick={() => {
                    onAddToNotes(t.answer);
                    setAdded((a) => new Set([...a, i]));
                  }}
                >
                  <NotebookPen size={16} aria-hidden />{" "}
                  {added.has(i) ? "Added to notes" : "Add to notes"}
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
      <div className={styles.aiAsk}>
        <TextField
          label="Your question"
          placeholder="e.g. Where are their offices in India?"
          value={question}
          maxLength={1000}
          onChange={(e) => setQuestion(e.target.value)}
          onKeyDown={(e) => {
            // Enter asks; it mustn't submit the company form.
            if (e.key === "Enter") {
              e.preventDefault();
              ask();
            }
          }}
        />
        <Button variant="secondary" loading={busy} disabled={!question.trim()} onClick={ask}>
          Ask
        </Button>
      </div>
      {busy && <p className={styles.muted}>Searching the web… (up to a minute)</p>}
      {error && <Alert tone="error">{error}</Alert>}
    </section>
  );
}
