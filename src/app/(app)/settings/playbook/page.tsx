import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { ChangeHistory } from "@/components/audit/ChangeHistory";
import { PLAYBOOK_LABELS } from "@/components/settings/fields";
import { PlaybookButton } from "@/components/settings/PlaybookButton";
import styles from "@/components/settings/settings.module.scss";
import { PageHeader } from "@/components/shell/PageHeader";
import { StatusMessage } from "@/components/ui/StatusMessage";
import { getDb } from "@/lib/db/client";
import { assertCan, can } from "@/lib/permissions";
import { requireUser } from "@/lib/session";
import { getPlaybookSettings, PLAYBOOK_FIELDS } from "@/server/settings";

export const metadata: Metadata = { title: "Playbook Settings" };

export default function PlaybookPage() {
  return (
    <>
      <p className={styles.meta}>
        <Link href="/settings">← Settings</Link>
      </p>
      <PageHeader
        title="Playbook Settings"
        description="Follow-up delays and daily targets the playbook runs on."
      />
      <Suspense fallback={<StatusMessage title="Loading…" />}>
        <Playbook />
      </Suspense>
    </>
  );
}

async function Playbook() {
  const viewer = await requireUser();
  assertCan(viewer, "settings.read");
  const s = await getPlaybookSettings(getDb());

  return (
    <>
      <div className={styles.topRow}>
        <p className={styles.meta}>
          Follow-up delays count from the Message 1 date. Changes apply to quick-logs from now on.
        </p>
        {can(viewer, "settings.edit") && (
          <PlaybookButton
            defaults={
              Object.fromEntries(PLAYBOOK_FIELDS.map((k) => [k, s[k]])) as Record<
                (typeof PLAYBOOK_FIELDS)[number],
                number
              >
            }
          />
        )}
      </div>
      <section className={styles.card} aria-label="Playbook Settings">
        <dl className={styles.numbers}>
          {PLAYBOOK_FIELDS.map((k) => (
            <div key={k}>
              <dt>{PLAYBOOK_LABELS[k].label}</dt>
              <dd>
                <span className={styles.number}>{s[k]}</span>
                <span className={styles.unit}>{PLAYBOOK_LABELS[k].unit}</span>
              </dd>
              <dd className={styles.hint}>{PLAYBOOK_LABELS[k].hint}</dd>
            </div>
          ))}
        </dl>
      </section>
      <section className={styles.card}>
        <Suspense fallback={<StatusMessage title="Loading history…" />}>
          <ChangeHistory entityType="Playbook Settings" recordId="1" />
        </Suspense>
      </section>
    </>
  );
}
