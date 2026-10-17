import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { ChangeHistory } from "@/components/audit/ChangeHistory";
import { FACT_LABELS } from "@/components/settings/fields";
import { ProductFactsButton } from "@/components/settings/ProductFactsButton";
import styles from "@/components/settings/settings.module.scss";
import { PageHeader } from "@/components/shell/PageHeader";
import { Alert } from "@/components/ui/Alert";
import { StatusMessage } from "@/components/ui/StatusMessage";
import { getDb } from "@/lib/db/client";
import { assertCan, can } from "@/lib/permissions";
import { requireUser } from "@/lib/session";
import { formatIst } from "@/lib/time";
import { FACT_FIELDS, factsMissing, getProductFacts } from "@/server/settings";

export const metadata: Metadata = { title: "Product Facts" };

export default function ProductFactsPage() {
  return (
    <>
      <p className={styles.meta}>
        <Link href="/settings">← Settings</Link>
      </p>
      <PageHeader title="Product Facts" description="The only facts the AI may use about Lumor." />
      <Suspense fallback={<StatusMessage title="Loading…" />}>
        <Facts />
      </Suspense>
    </>
  );
}

async function Facts() {
  const viewer = await requireUser();
  assertCan(viewer, "settings.read");
  const f = await getProductFacts(getDb());

  return (
    <>
      <div className={styles.topRow}>
        <p className={styles.meta}>
          {f.lastEditedAt
            ? `Last edited by ${f.editorName ?? "someone"} · ${formatIst(f.lastEditedAt)}`
            : "Not edited yet."}
        </p>
        {can(viewer, "settings.edit") && (
          <ProductFactsButton
            defaults={Object.fromEntries(FACT_FIELDS.map((k) => [k, f[k] ?? ""]))}
          />
        )}
      </div>
      {factsMissing(f) && (
        <div className={styles.notice}>
          <Alert tone="warning">
            Not filled in yet: the AI features need &ldquo;What Lumor does&rdquo; and &ldquo;Live
            features&rdquo; before they can be used.
          </Alert>
        </div>
      )}
      <section className={styles.card} aria-label="Product Facts">
        <dl className={styles.facts}>
          {FACT_FIELDS.map((k) => (
            <div key={k}>
              <dt>{FACT_LABELS[k].label}</dt>
              <dd>
                {!f[k] ? (
                  <span className={styles.empty}>Not set</span>
                ) : k === "calendarLink" ? (
                  <a href={f[k]} target="_blank" rel="noopener noreferrer">
                    {f[k]}
                  </a>
                ) : (
                  f[k]
                )}
              </dd>
              <p className={styles.hint}>{FACT_LABELS[k].hint}</p>
            </div>
          ))}
        </dl>
      </section>
      <section className={styles.card}>
        <Suspense fallback={<StatusMessage title="Loading history…" />}>
          <ChangeHistory entityType="Product Facts" recordId="1" />
        </Suspense>
      </section>
    </>
  );
}
