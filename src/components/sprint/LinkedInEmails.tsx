// The follow-up sprint's LinkedIn emails panel (F30, D-066): whether Gmail is connected, Check now,
// and the last emails read with what happened. The scheduled job also checks every 15 minutes.
import { Mail } from "lucide-react";
import Link from "next/link";
import { Alert } from "@/components/ui/Alert";
import { formatIst } from "@/lib/time";
import type { LinkedInEmailRow } from "@/server/google/linkedin-mail";
import { CheckEmailsButton } from "./CheckEmailsButton";
import styles from "./sprint.module.scss";

type Props = {
  /** Google set up for the site (GOOGLE_CLIENT_ID and secret). */
  configured: boolean;
  /** The rep's Google connection reads Gmail. */
  readsGmail: boolean;
  rows: LinkedInEmailRow[];
  /** ?gmail= after Google's sign-in. */
  result?: string;
};

const RESULT: Record<string, { tone: "success" | "warning" | "error"; text: string }> = {
  connected: {
    tone: "success",
    text: "Gmail connected. LinkedIn's acceptance and message emails are now logged by themselves. Click Check now to read the last 7 days.",
  },
  missing: {
    tone: "warning",
    text: "Google connected, but without permission to read your email. Click Connect Gmail again and tick “View your email messages and settings”.",
  },
  cancelled: { tone: "warning", text: "Gmail connection cancelled. Nothing changed." },
  failed: { tone: "error", text: "Couldn't connect Gmail. Please try again." },
  "not-set-up": {
    tone: "warning",
    text: "Google isn't set up for this site yet. The owner adds it once (docs/deploy.md).",
  },
};

function what(r: LinkedInEmailRow): string {
  const who = r.personName ?? r.fromName ?? "someone";
  switch (r.result) {
    case "Logged":
      return r.kind === "Accepted" ? `Logged: ${who} accepted` : `Logged: reply from ${who}`;
    case "Already logged":
      return `Already logged (${who})`;
    case "Not matched":
      return `Not matched: ${r.fromName ?? "no name"} isn't one of your people. Add them, then log it on their page.`;
    default:
      return `Skipped: ${r.subject}`;
  }
}

export function LinkedInEmails({ configured, readsGmail, rows, result }: Props) {
  const shown = result ? RESULT[result] : undefined;
  return (
    <section className={styles.waiting} aria-label="LinkedIn emails">
      <h2 className={styles.sectionTitle}>
        <Mail size={18} aria-hidden /> LinkedIn emails
      </h2>
      {shown && <Alert tone={shown.tone}>{shown.text}</Alert>}
      {readsGmail ? (
        <>
          <p className={styles.muted}>
            Sales Hub reads LinkedIn&rsquo;s &ldquo;accepted your invitation&rdquo; and &ldquo;new
            message&rdquo; emails in your Gmail every 15 minutes and logs them for the right person.
            It only reads; it never sends or changes anything.
          </p>
          <div className={styles.waitActions}>
            <CheckEmailsButton />
          </div>
          {rows.length > 0 && (
            <ul className={styles.waitList} aria-label="LinkedIn emails read">
              {rows.map((r) => (
                <li key={r.id} className={styles.waitRow}>
                  <span className={styles.waitName}>
                    {r.personId && r.personName ? (
                      <Link href={`/people/${r.personId}`}>{what(r)}</Link>
                    ) : (
                      what(r)
                    )}
                  </span>
                  <span className={styles.muted}>{formatIst(r.receivedAt, "d MMM, h:mm aaa")}</span>
                </li>
              ))}
            </ul>
          )}
        </>
      ) : configured ? (
        <>
          <p className={styles.muted}>
            Connect Gmail and Sales Hub logs acceptances and replies from LinkedIn&rsquo;s emails by
            itself, so you don&rsquo;t click Accepted or paste replies. It only reads
            LinkedIn&rsquo;s emails; nothing is sent or changed.
          </p>
          <div>
            <a className={styles.linkButton} href="/api/google/connect?gmail=1">
              Connect Gmail
            </a>
          </div>
        </>
      ) : (
        <p className={styles.muted}>
          Google isn&rsquo;t set up for this site yet, so LinkedIn emails can&rsquo;t be read. The
          owner adds it once (docs/deploy.md).
        </p>
      )}
    </section>
  );
}
