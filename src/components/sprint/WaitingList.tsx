"use client";

// The follow-up sprint's first part (F30): connection requests still waiting. Accepted logs the
// acceptance (the plan's next step is dated from today); Not yet just hides it for now.
import { ExternalLink } from "lucide-react";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";
import { sprintAccept } from "@/server/actions/sprint";
import type { WaitingRow } from "@/server/sprint";
import styles from "./sprint.module.scss";

const DAY = 24 * 60 * 60 * 1000;

export function WaitingList({ rows, now }: { rows: WaitingRow[]; now: number }) {
  const notify = useToast();
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState<string | null>(null);
  const [, start] = useTransition();
  const shown = rows.filter((r) => !hidden.has(r.personId));
  const hide = (id: string) => setHidden((h) => new Set(h).add(id));

  const accept = (r: WaitingRow) =>
    start(async () => {
      setBusy(r.personId);
      const res = await sprintAccept(r.personId);
      setBusy(null);
      if (!res.ok) {
        notify("error", res.error);
        return;
      }
      notify("success", `${r.name} accepted. Their next step is dated from today.`);
      hide(r.personId);
    });

  return (
    <section className={styles.waiting} aria-label="Waiting for acceptance">
      <h2 className={styles.sectionTitle}>
        Waiting for acceptance <span className={styles.muted}>({shown.length})</span>
      </h2>
      {shown.length === 0 ? (
        <p className={styles.muted}>No requests waiting.</p>
      ) : (
        <>
          <p className={styles.muted}>
            Open each profile: if they accepted, click Accepted so their plan moves on.
          </p>
          <ul className={styles.waitList}>
            {shown.map((r) => {
              const days = Math.max(0, Math.floor((now - new Date(r.sentOn).getTime()) / DAY));
              return (
                <li key={r.personId} className={styles.waitRow}>
                  <span className={styles.waitName}>
                    <strong>{r.name}</strong>
                    {r.company && <span className={styles.muted}> · {r.company}</span>}
                    <span className={styles.muted}>
                      {" "}
                      · sent {days === 0 ? "today" : `${days} day${days === 1 ? "" : "s"} ago`}
                    </span>
                  </span>
                  <span className={styles.waitActions}>
                    {r.profileUrl && (
                      <a
                        className={styles.linkButton}
                        href={r.profileUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        aria-label={`Open ${r.name}'s profile`}
                      >
                        <ExternalLink size={16} aria-hidden />
                        Open
                      </a>
                    )}
                    <Button
                      variant="secondary"
                      onClick={() => accept(r)}
                      loading={busy === r.personId}
                      aria-label={`${r.name} accepted`}
                    >
                      Accepted
                    </Button>
                    <Button
                      variant="ghost"
                      onClick={() => hide(r.personId)}
                      aria-label={`${r.name}: not yet`}
                    >
                      Not yet
                    </Button>
                  </span>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </section>
  );
}
