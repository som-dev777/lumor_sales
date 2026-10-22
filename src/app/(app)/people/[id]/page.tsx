import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { ExternalLink } from "lucide-react";
import { ChangeHistory } from "@/components/audit/ChangeHistory";
import { AiPanel } from "@/components/ai/AiPanel";
import { PlanPanel } from "@/components/plans/PlanPanel";
import { Conversation, type ThreadView } from "@/components/conversation/Conversation";
import { MarkCustomerButton } from "@/components/leads/MarkCustomerButton";
import { PersonDialogButton } from "@/components/leads/PersonDialogButton";
import { QuickLogBar } from "@/components/leads/QuickLogBar";
import { StageBadge } from "@/components/leads/StageBadge";
import styles from "@/components/leads/leads.module.scss";
import { Alert } from "@/components/ui/Alert";
import { StatusMessage } from "@/components/ui/StatusMessage";
import { getDb } from "@/lib/db/client";
import { profileHref } from "@/lib/linkedin";
import { can } from "@/lib/permissions";
import { requireUser } from "@/lib/session";
import { formatIst, formatIstDate, toIstLocal, todayIst } from "@/lib/time";
import { leadFormOptions } from "@/server/leads/options";
import { canLogOutreach, getPerson } from "@/server/leads/people";
import { situationOf, threadOf } from "@/server/conversation";
import { describeSituation } from "@/server/ai/assist";
import { aiMode } from "@/server/ai/client";
import { planState } from "@/server/plans/enrolment";
import { usablePlans } from "@/server/plans/plans";
import { appNow } from "@/lib/clock";
import { knowledgeFor } from "@/server/knowledge";

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
  const now = await appNow();
  const today = todayIst(now);
  const [thread, situation, options, knowledge, state, plans] = await Promise.all([
    threadOf(db, id),
    situationOf(db, id, today),
    leadFormOptions(db),
    knowledgeFor(db, "P02"),
    planState(db, id, today),
    usablePlans(db, viewer),
  ]);
  const SUGGESTED: Partial<Record<string, string>> = {
    "Meeting done": "Meeting follow-up",
    Trial: "Trial",
    Paid: "Onboarding",
  };
  const activeStep =
    state &&
    state.enrolment.status === "Active" &&
    !state.enrolment.waitingForAcceptance &&
    !state.finished
      ? state.channel
      : null;
  const currentStep =
    state && activeStep
      ? activeStep === "LinkedIn connection request"
        ? { order: state.enrolment.currentStep, action: "requestSent" as const }
        : activeStep === "Call"
          ? { order: state.enrolment.currentStep, action: "callLogged" as const }
          : ["LinkedIn message", "InMail", "Email", "WhatsApp"].includes(activeStep)
            ? { order: state.enrolment.currentStep, action: "messageSent" as const }
            : null
      : null;
  const mayEdit = canLogOutreach(viewer, p.ownerId);
  const firstName = p.fullName.split(/\s+/)[0];
  const items: ThreadView[] = thread.map((i) => ({
    id: i.id,
    side: i.side,
    when: formatIst(i.at),
    who: i.side === "them" ? p.fullName : i.userId === viewer.id ? "You" : (i.userName ?? "System"),
    type: i.type,
    channel: i.channel,
    content: i.content,
    replyType: i.replyType,
    step: i.side === "me" ? i.planStepOrder : null,
  }));

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

      {mayEdit && (
        <PlanPanel
          key={
            state
              ? `${state.enrolment.id}-${state.enrolment.currentStep}-${state.enrolment.status}-${state.enrolment.nextDueDate}`
              : "none"
          }
          personId={p.id}
          personName={p.fullName}
          email={p.email}
          usablePlans={plans}
          suggestedType={SUGGESTED[p.stage] ?? null}
          nurtureUntil={p.nurtureUntil}
          nurtureEnded={p.nurtureUntil !== null && p.nurtureUntil <= today}
          today={today}
          plan={
            state
              ? {
                  planName: state.plan.name,
                  planType: state.plan.planType,
                  version: state.enrolment.version,
                  status: state.enrolment.status as "Active" | "Paused",
                  stepOrder: state.enrolment.currentStep,
                  stepCount: state.steps.length,
                  channel: state.channel,
                  message: state.message,
                  script: state.step?.script ?? null,
                  nextDueDate: state.enrolment.nextDueDate,
                  nextDueLabel: state.enrolment.nextDueDate
                    ? formatIstDate(state.enrolment.nextDueDate)
                    : null,
                  overdue: state.overdue,
                  dueToday: state.dueToday,
                  waiting: state.enrolment.waitingForAcceptance,
                  withdrawDue: state.withdrawDue,
                  finished: state.finished,
                  timeUp: Boolean(state.step) && state.finished,
                }
              : null
          }
        />
      )}

      {mayEdit && (
        <QuickLogBar
          personId={p.id}
          templates={options.templates}
          today={today}
          currentStep={currentStep}
        />
      )}

      {mayEdit && (
        <AiPanel
          personId={p.id}
          status={aiMode() === "off" ? "off" : knowledge ? "ready" : "no-knowledge"}
          templates={options.templates}
          situation={describeSituation(situation, firstName)}
        />
      )}

      <div className={styles.columns}>
        <Conversation
          personId={p.id}
          firstName={firstName}
          items={items}
          canLog={mayEdit}
          now={toIstLocal(now)}
          currentStep={currentStep && currentStep.action !== "requestSent" ? currentStep : null}
          defaultChannel={
            situation.lastChannel && situation.lastChannel !== "In person"
              ? situation.lastChannel
              : "LinkedIn"
          }
        />
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
