import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { ExternalLink } from "lucide-react";
import { ChangeHistory } from "@/components/audit/ChangeHistory";
import { NoteForm } from "@/components/leads/NoteForm";
import { PersonDialogButton } from "@/components/leads/PersonDialogButton";
import { StageBadge } from "@/components/leads/StageBadge";
import { Timeline } from "@/components/leads/Timeline";
import styles from "@/components/leads/leads.module.scss";
import { StatusMessage } from "@/components/ui/StatusMessage";
import { getDb } from "@/lib/db/client";
import { profileHref } from "@/lib/linkedin";
import { can } from "@/lib/permissions";
import { requireUser } from "@/lib/session";
import { formatIstDate } from "@/lib/time";
import { leadFormOptions } from "@/server/leads/options";
import { canLogOutreach, getPerson, personTimeline } from "@/server/leads/people";

export const metadata: Metadata = { title: "Person" };

export default function PersonPage({ params }: PageProps<"/people/[id]">) {
  return (
    <Suspense fallback={<StatusMessage title="Loading…" />}>
      <Person params={params} />
    </Suspense>
  );
}

async function Person({ params }: Pick<PageProps<"/people/[id]">, "params">) {
  const viewer = await requireUser();
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const db = getDb();
  const p = await getPerson(db, id);
  if (!p) notFound();
  const [events, options] = await Promise.all([personTimeline(db, id), leadFormOptions(db)]);
  const mayEdit = canLogOutreach(viewer, p.ownerId);

  const fact = (label: string, value: React.ReactNode) => (
    <div>
      <dt>{label}</dt>
      <dd>{value ?? "—"}</dd>
    </div>
  );

  return (
    <>
      <p className={styles.muted}>
        <Link href="/people">← People</Link>
      </p>
      <section className={styles.detailHeader} aria-label={p.fullName}>
        <div className={styles.detailMain}>
          <h1 className={styles.detailTitle}>{p.fullName}</h1>
          <p className={styles.muted}>
            {p.title ?? "No title"}
            {p.companyName && (
              <>
                {" · "}
                <Link href={`/companies/${p.companyId}`}>{p.companyName}</Link>
              </>
            )}
          </p>
          <dl className={styles.facts}>
            {fact("Stage", <StageBadge stage={p.stage} />)}
            {fact("Sequence step", p.sequenceStep)}
            {fact("Persona", p.personaName)}
            {fact("Level", p.level)}
            {fact("Owner", p.ownerName)}
            {fact(
              "Next action",
              p.nextAction
                ? `${p.nextAction}${p.nextActionDate ? ` · ${formatIstDate(p.nextActionDate)}` : ""}`
                : null,
            )}
            {fact("Market", p.market)}
            {p.stage === "Lost" && fact("Lost reason", p.lostReason)}
          </dl>
        </div>
        <div className={styles.headerActions}>
          <a
            href={profileHref(p.linkedinUrl)}
            target="_blank"
            rel="noopener noreferrer"
            className={styles.linkButton}
          >
            <ExternalLink size={16} aria-hidden />
            LinkedIn
          </a>
          {p.salesNavUrl && (
            <a
              href={profileHref(p.salesNavUrl)}
              target="_blank"
              rel="noopener noreferrer"
              className={styles.linkButton}
            >
              <ExternalLink size={16} aria-hidden />
              Sales Navigator
            </a>
          )}
          {mayEdit ? (
            <PersonDialogButton
              personId={p.id}
              options={options}
              canChooseOwner={can(viewer, "lead.reassign")}
              defaults={{
                fullName: p.fullName,
                title: p.title ?? "",
                linkedinUrl: p.linkedinUrl,
                salesNavUrl: p.salesNavUrl ?? "",
                companyName: p.companyName ?? "",
                personaId: p.personaId ?? "",
                level: p.level ?? "",
                accountFilterId: p.accountFilterId ?? "",
                market: p.market ?? "",
                ownerId: p.ownerId,
                stage: p.stage,
                lostReason: p.lostReason ?? "",
                openerTemplateId: p.openerTemplateId ?? "",
                nextAction: p.nextAction ?? "",
                nextActionDate: p.nextActionDate ?? "",
                notes: p.notes ?? "",
              }}
            />
          ) : (
            <p className={styles.claimed}>
              This lead is claimed by {p.ownerName ?? "someone else"}. You can add notes.
            </p>
          )}
        </div>
      </section>

      <div className={styles.columns}>
        <section className={styles.panel} aria-label="Timeline">
          <h2 className={styles.panelTitle}>Timeline</h2>
          <NoteForm personId={p.id} />
          <Timeline events={events} />
        </section>
        <div>
          {p.notes && (
            <section className={styles.panel}>
              <h2 className={styles.panelTitle}>Notes</h2>
              <p className={styles.eventBody}>{p.notes}</p>
            </section>
          )}
          <section className={styles.panel}>
            <Suspense fallback={<StatusMessage title="Loading history…" />}>
              <ChangeHistory entityType="Person" recordId={p.id} />
            </Suspense>
          </section>
        </div>
      </div>
    </>
  );
}
