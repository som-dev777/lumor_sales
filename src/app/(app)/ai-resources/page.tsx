import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { AddResourceButton } from "@/components/ai-resources/AddResourceButton";
import { CalendarLinkForm } from "@/components/ai-resources/CalendarLinkForm";
import { KnowledgeEditor } from "@/components/ai-resources/KnowledgeEditor";
import { ResourceActions } from "@/components/ai-resources/ResourceActions";
import styles from "@/components/ai-resources/ai-resources.module.scss";
import { formatBytes, PROMPT_SHORT } from "@/components/ai-resources/labels";
import { PageHeader } from "@/components/shell/PageHeader";
import { Badge } from "@/components/ui/Badge";
import { StatusMessage } from "@/components/ui/StatusMessage";
import { getDb } from "@/lib/db/client";
import { RESOURCE_CATEGORIES, type AiPromptId } from "@/lib/db/enums";
import { can } from "@/lib/permissions";
import { requireUser } from "@/lib/session";
import { formatIst } from "@/lib/time";
import { listKnowledge } from "@/server/knowledge";
import { listResources } from "@/server/sales-resources";
import { getCalendarLink } from "@/server/settings";

export const metadata: Metadata = { title: "AI Resources" };

export default function AiResourcesPage({ searchParams }: PageProps<"/ai-resources">) {
  return (
    <>
      <PageHeader
        title="AI Resources"
        description="What the AI knows about Lumor, and the decks and videos reps can share."
      />
      <Suspense fallback={<StatusMessage title="Loading…" />}>
        <Resources searchParams={searchParams} />
      </Suspense>
    </>
  );
}

async function Resources({ searchParams }: Pick<PageProps<"/ai-resources">, "searchParams">) {
  const viewer = await requireUser();
  const params = await searchParams;
  const tab =
    (Array.isArray(params.tab) ? params.tab[0] : params.tab) === "sales" ? "sales" : "knowledge";
  const db = getDb();

  return (
    <>
      <nav className={styles.tabs} aria-label="AI Resources sections">
        {(
          [
            ["knowledge", "AI knowledge"],
            ["sales", "Sales resources"],
          ] as const
        ).map(([key, label]) => (
          <Link
            key={key}
            href={`/ai-resources?tab=${key}`}
            className={key === tab ? styles.tabActive : styles.tab}
            aria-current={key === tab ? "page" : undefined}
          >
            {label}
          </Link>
        ))}
      </nav>
      {tab === "knowledge" ? (
        <Knowledge canEdit={can(viewer, "knowledge.edit")} db={db} />
      ) : (
        <Sales canManage={can(viewer, "resources.manage")} db={db} />
      )}
    </>
  );
}

async function Knowledge({ canEdit, db }: { canEdit: boolean; db: ReturnType<typeof getDb> }) {
  const [files, calendar] = await Promise.all([listKnowledge(db), getCalendarLink(db)]);
  return (
    <>
      <div className={styles.topRow}>
        <p className={styles.muted}>
          The AI may only say what these files say about Lumor. Each AI feature reads the files
          ticked for it; files placed last win.
        </p>
        {canEdit && <KnowledgeEditor />}
      </div>
      <section className={styles.card} aria-label="Calendar link">
        {canEdit ? (
          <CalendarLinkForm current={calendar.calendarLink} />
        ) : (
          <p>
            <strong>Calendar link for demos:</strong>{" "}
            {calendar.calendarLink ? (
              <a href={calendar.calendarLink} target="_blank" rel="noopener noreferrer">
                {calendar.calendarLink}
              </a>
            ) : (
              <span className={styles.muted}>not set yet</span>
            )}
          </p>
        )}
      </section>
      {files.length === 0 ? (
        <StatusMessage title="No knowledge files yet">
          <p>
            Until files are added, the AI features won&rsquo;t run. Run npm run seed:knowledge to
            load the starting set.
          </p>
        </StatusMessage>
      ) : (
        <div className={styles.grid}>
          {files.map((f) => (
            <Link
              key={f.id}
              href={`/ai-resources/knowledge/${f.id}`}
              className={styles.fileCard}
              aria-label={f.title}
            >
              <div className={styles.badges}>
                {(f.loadFor as AiPromptId[]).map((p) => (
                  <Badge key={p} tone="neutral">
                    {PROMPT_SHORT[p]}
                  </Badge>
                ))}
                {f.placeLast && <Badge tone="primary">Placed last</Badge>}
                {!f.active && <Badge tone="warning">Off</Badge>}
              </div>
              <h2 className={styles.fileTitle}>{f.title}</h2>
              <p className={styles.muted}>
                {f.slug}.md · version {f.version}
                {f.lastEditedAt
                  ? ` · edited ${formatIst(f.lastEditedAt)}${f.editorName ? ` by ${f.editorName}` : ""}`
                  : ""}
              </p>
            </Link>
          ))}
        </div>
      )}
    </>
  );
}

async function Sales({ canManage, db }: { canManage: boolean; db: ReturnType<typeof getDb> }) {
  const resources = await listResources(db);
  return (
    <>
      <div className={styles.topRow}>
        <p className={styles.muted}>
          Decks, product videos and one-pagers to share with prospects. Files up to 5 MB; videos and
          big decks are links.
        </p>
        {canManage && <AddResourceButton />}
      </div>
      {resources.length === 0 ? (
        <StatusMessage title="No sales resources yet">
          <p>
            {canManage
              ? "Add a deck, video link or one-pager with Add resource."
              : "An Admin adds decks and videos here."}
          </p>
        </StatusMessage>
      ) : (
        RESOURCE_CATEGORIES.map((category) => {
          const items = resources.filter((r) => r.category === category);
          if (items.length === 0) return null;
          return (
            <section key={category} className={styles.section} aria-label={category}>
              <h2 className={styles.sectionTitle}>{category}</h2>
              <ul className={styles.list}>
                {items.map((r) => (
                  <li key={r.id} className={styles.resource} aria-label={r.title}>
                    <div className={styles.resourceMain}>
                      <strong>{r.title}</strong>
                      {r.description && <span className={styles.muted}>{r.description}</span>}
                      <span className={styles.muted}>
                        {r.kind === "link"
                          ? `Link · ${new URL(r.url!).hostname}`
                          : `${r.fileName} · ${formatBytes(r.sizeBytes)}`}
                        {r.addedBy ? ` · added by ${r.addedBy}` : ""}
                      </span>
                    </div>
                    <ResourceActions
                      id={r.id}
                      title={r.title}
                      kind={r.kind}
                      url={r.url}
                      canManage={canManage}
                    />
                  </li>
                ))}
              </ul>
            </section>
          );
        })
      )}
    </>
  );
}
