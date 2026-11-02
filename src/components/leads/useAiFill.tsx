"use client";

import { Sparkles } from "lucide-react";
import { useState, useTransition, type ReactNode } from "react";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import type { AiResult } from "@/server/actions/ai";
import type { FillResult } from "@/server/ai/autofill";
import styles from "./leads.module.scss";

export const AI_HINT = "Filled by AI. Check it.";

/**
 * Fill with AI (F24) for a form: the button (bottom-left), the result box (above the buttons),
 * and which fields the AI filled, so each can say "Filled by AI" until the rep edits it.
 */
export function useAiFill(
  ask: () => Promise<AiResult<FillResult>>,
  apply: (values: Record<string, string>) => void,
): {
  button: ReactNode;
  panel: ReactNode;
  hint: (field: string) => string | undefined;
  edited: (field: string) => void;
} {
  const [busy, start] = useTransition();
  const [filled, setFilled] = useState<Set<string>>(new Set());
  const [result, setResult] = useState<FillResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const run = () =>
    start(async () => {
      setError(null);
      setResult(null);
      const r = await ask();
      if (!r.ok) {
        setError(r.error);
        return;
      }
      apply(r.data.values);
      setFilled((before) => new Set([...before, ...Object.keys(r.data.values)]));
      setResult(r.data);
    });

  const count = result ? Object.keys(result.values).length : 0;
  const button = (
    <Button variant="ghost" className={styles.fillButton} onClick={run} loading={busy}>
      <Sparkles size={16} aria-hidden /> Fill with AI
    </Button>
  );
  const panel = (
    <>
      {busy && <p className={styles.muted}>Searching the web… (up to a minute)</p>}
      {error && <Alert tone="error">{error}</Alert>}
      {result && (
        <Alert tone={result.confidence === "low" ? "warning" : "info"}>
          <strong>
            {result.confidence === "low"
              ? "The AI couldn't tell which one this is, so nothing was filled. Add the website or LinkedIn link and try again."
              : count === 0
                ? "The AI found nothing new for the empty fields."
                : `Filled ${count} field${count === 1 ? "" : "s"} (confidence: ${result.confidence}). Check them before saving.`}
          </strong>
          {!result.searched && (
            <p>The AI couldn&rsquo;t search the web, so this is from what it already knows.</p>
          )}
          {result.checks.length > 0 && (
            <ul className={styles.fillList}>
              {result.checks.map((c) => (
                <li key={c}>{c}</li>
              ))}
            </ul>
          )}
          {result.sources.length > 0 && (
            <p className={styles.fillSources}>
              Sources:{" "}
              {result.sources.map((s, i) => (
                <span key={s}>
                  {i > 0 && " · "}
                  <a href={s} target="_blank" rel="noopener noreferrer">
                    {new URL(s).hostname.replace(/^www\./, "")}
                  </a>
                </span>
              ))}
            </p>
          )}
        </Alert>
      )}
    </>
  );
  return {
    button,
    panel,
    hint: (field) => (filled.has(field) ? AI_HINT : undefined),
    edited: (field) =>
      setFilled((before) => {
        if (!before.has(field)) return before;
        const next = new Set(before);
        next.delete(field);
        return next;
      }),
  };
}
