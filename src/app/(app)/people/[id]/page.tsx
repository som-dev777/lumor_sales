import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { ExternalLink } from "lucide-react";
import { ChangeHistory } from "@/components/audit/ChangeHistory";
import { AiPanel } from "@/components/ai/AiPanel";
import { MarkCustomerButton } from "@/components/leads/MarkCustomerButton";
import { NoteForm } from "@/components/leads/NoteForm";
import { PersonDialogButton } from "@/components/leads/PersonDialogButton";
import { QuickLogBar } from "@/components/leads/QuickLogBar";
import { StageBadge } from "@/components/leads/StageBadge";
import { Timeline } from "@/components/leads/Timeline";
import styles from "@/components/leads/leads.module.scss";
import { Alert } from "@/components/ui/Alert";
import { StatusMessage } from "@/components/ui/StatusMessage";
import { getDb } from "@/lib/db/client";
import { profileHref } from "@/lib/linkedin";
import { can } from "@/lib/permissions";
import { requireUser } from "@/lib/session";
import { formatIstDate, todayIst } from "@/lib/time";
import { leadFormOptions } from "@/server/leads/options";
import { canLogOutreach, getPerson, personTimeline } from "@/server/leads/people";
import { aiMode } from "@/server/ai/client";
import { factsMissing, getProductFacts } from "@/server/settings";

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
  await connection();
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const db = getDb();
  const p = await getPerson(db, id);
  if (!p) notFound();
  const [events, options, facts] = await Promise.all([
    personTimeline(db, id),
    leadFormOptions(db),
    getProductFacts(db),
  ]);
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
            {fact(
              "Plan",
              p.planName
                ? `${p.planName} · step ${p.planStep}${p.planStatus === "Paused" ? " (paused)" : ""}`
                : null,
            )}
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
            {(p.phone || p.email) &&
              fact("Contact", [p.phone, p.email].filter(Boolean).join(" · "))}
            {p.doNotContact &&
              fact(
                "Do not contact",
                `${p.dncReason ?? "Yes"}${p.dncDate ? ` (since ${formatIstDate(p.dncDate)})` : ""}`,
              )}
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
                phone: p.phone ?? "",
                email: p.email ?? "",
                seniority: p.seniority ?? "",
                doNotContact: p.doNotContact,
                dncReason: p.dncReason ?? "",
              }}
            />
          ) : (
            <p className={styles.claimed}>
              This lead is claimed by {p.ownerName ?? "someone else"}. You can add notes.
            </p>
          )}
        </div>
      </section>

      {mayEdit && p.converted && p.companyId && p.companyStatus !== "Customer" && (
        <div className={styles.customerPrompt}>
          <Alert tone="info">
            {p.fullName} is converted. Mark {p.companyName} as a customer too?
          </Alert>
          <MarkCustomerButton
            companyId={p.companyId}
            companyName={p.companyName ?? "the company"}
            today={todayIst()}
          />
        </div>
      )}

      {mayEdit && <QuickLogBar personId={p.id} templates={options.templates} today={todayIst()} />}

      {mayEdit && (
        <AiPanel
          personId={p.id}
          status={aiMode() === "off" ? "off" : factsMissing(facts) ? "no-facts" : "ready"}
          templates={options.templates}
        />
      )}

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
