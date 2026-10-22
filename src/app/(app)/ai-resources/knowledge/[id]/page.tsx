import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { KnowledgeEditor } from "@/components/ai-resources/KnowledgeEditor";
import styles from "@/components/ai-resources/ai-resources.module.scss";
import { PROMPT_LABEL } from "@/components/ai-resources/labels";
import { ChangeHistory } from "@/components/audit/ChangeHistory";
import { Badge } from "@/components/ui/Badge";
import { StatusMessage } from "@/components/ui/StatusMessage";
import { getDb } from "@/lib/db/client";
import type { AiPromptId } from "@/lib/db/enums";
import { can } from "@/lib/permissions";
import { requireUser } from "@/lib/session";
import { formatIst } from "@/lib/time";
import { getKnowledge, revisionsOf } from "@/server/knowledge";

export const metadata: Metadata = { title: "Knowledge file" };

export default function KnowledgeFilePage({ params }: PageProps<"/ai-resources/knowledge/[id]">) {
  return (
    <Suspense fallback={<StatusMessage title="Loading…" />}>
      <KnowledgeFile params={params} />
    </Suspense>
  );
}

async function KnowledgeFile({
  params,
}: Pick<PageProps<"/ai-resources/knowledge/[id]">, "params">) {
  const viewer = await requireUser();
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const db = getDb();
  const f = await getKnowledge(db, id);
  if (!f) notFound();
  const revisions = await revisionsOf(db, id);
  const loadFor = f.loadFor as AiPromptId[];

  return (
    <>
      <p className={styles.muted}>
        <Link href="/ai-resources">← AI Resources</Link>
      </p>
      <section className={styles.card} aria-label={f.title}>
        <div className={styles.topRow}>
          <div>
            <div className={styles.badges}>
              {f.placeLast && <Badge tone="primary">Placed last</Badge>}
              <Badge tone={f.active ? "success" : "warning"}>{f.active ? "Active" : "Off"}</Badge>
            </div>
            <h1 className={styles.fileTitle}>{f.title}</h1>
            <p className={styles.muted}>
              {f.slug}.md · version {f.version}
              {f.lastEditedAt
                ? ` · edited ${formatIst(f.lastEditedAt)}${f.editorName ? ` by ${f.editorName}` : ""}`
                : ""}
            </p>
            <p className={styles.muted}>
              Read by: {loadFor.map((p) => PROMPT_LABEL[p]).join(", ")}
            </p>
          </div>
          {can(viewer, "knowledge.edit") && (
            <KnowledgeEditor
              fileId={f.id}
              initial={{
                title: f.title,
                content: f.content,
                loadFor,
                placeLast: f.placeLast,
                active: f.active,
              }}
            />
          )}
        </div>
      </section>
      <section className={styles.card} aria-label="Text">
        <pre className={styles.content}>{f.content}</pre>
      </section>
      {revisions.length > 0 && (
        <section className={styles.card} aria-label="Earlier versions">
          <h2 className={styles.sectionTitle}>Earlier versions</h2>
          {revisions.map((r) => (
            <details key={r.id} className={styles.versions}>
              <summary>
                Version {r.version} · replaced {formatIst(r.createdAt)}
              </summary>
              <pre className={styles.content}>{r.content}</pre>
            </details>
          ))}
        </section>
      )}
      <section className={styles.card}>
        <Suspense fallback={<StatusMessage title="Loading history…" />}>
          <ChangeHistory entityType="Knowledge file" recordId={f.id} />
        </Suspense>
      </section>
    </>
  );
}
