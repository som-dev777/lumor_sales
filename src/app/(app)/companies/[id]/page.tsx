import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { ExternalLink } from "lucide-react";
import { ChangeHistory } from "@/components/audit/ChangeHistory";
import { CompanyDialogButton } from "@/components/leads/CompanyDialogButton";
import { MarkCustomerButton } from "@/components/leads/MarkCustomerButton";
import { StageBadge } from "@/components/leads/StageBadge";
import { Timeline } from "@/components/leads/Timeline";
import styles from "@/components/leads/leads.module.scss";
import { Badge } from "@/components/ui/Badge";
import { StatusMessage } from "@/components/ui/StatusMessage";
import { getDb } from "@/lib/db/client";
import { profileHref } from "@/lib/linkedin";
import { formatInr } from "@/lib/money";
import { can } from "@/lib/permissions";
import { requireUser } from "@/lib/session";
import { formatIstDate, todayIst } from "@/lib/time";
import { companyTimeline, getCompany } from "@/server/leads/companies";
import { leadFormOptions } from "@/server/leads/options";

export const metadata: Metadata = { title: "Company" };

const STATUS_TONE = {
  Target: "neutral",
  Engaged: "primary",
  Customer: "success",
  Lost: "danger",
} as const;

export default function CompanyPage({ params }: PageProps<"/companies/[id]">) {
  return (
    <Suspense fallback={<StatusMessage title="Loading…" />}>
      <Company params={params} />
    </Suspense>
  );
}

async function Company({ params }: Pick<PageProps<"/companies/[id]">, "params">) {
  const viewer = await requireUser();
  await connection();
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const db = getDb();
  const c = await getCompany(db, id);
  if (!c) notFound();
  const [events, options] = await Promise.all([companyTimeline(db, id), leadFormOptions(db)]);
  const mayEdit = can(viewer, "lead.edit", { ownerId: c.ownerId });
  const fact = (label: string, value: React.ReactNode) => (
    <div>
      <dt>{label}</dt>
      <dd>{value ?? "—"}</dd>
    </div>
  );

  return (
    <>
      <p className={styles.muted}>
        <Link href="/companies">← Companies</Link>
      </p>
      <section className={styles.detailHeader} aria-label={c.name}>
        <div className={styles.detailMain}>
          <h1 className={styles.detailTitle}>
            {c.name} <Badge tone={STATUS_TONE[c.status]}>{c.status}</Badge>
          </h1>
          <dl className={styles.facts}>
            {fact("Industry", c.industry)}
            {fact("Headcount", c.headcountBand)}
            {fact("Location", [c.city, c.country].filter(Boolean).join(", ") || null)}
            {fact(
              "Account filter",
              c.accountFilterCode ? `${c.accountFilterCode} ${c.accountFilterName}` : null,
            )}
            {fact("Owner", c.ownerName)}
            {fact(
              "Website",
              c.website ? (
                <a href={profileHref(c.website)} target="_blank" rel="noopener noreferrer">
                  {c.website}
                </a>
              ) : null,
            )}
          </dl>
        </div>
        <div className={styles.headerActions}>
          {c.linkedinUrl && (
            <a
              href={profileHref(c.linkedinUrl)}
              target="_blank"
              rel="noopener noreferrer"
              className={styles.linkButton}
            >
              <ExternalLink size={16} aria-hidden />
              LinkedIn
            </a>
          )}
          {mayEdit && (
            <>
              <CompanyDialogButton
                companyId={c.id}
                options={options}
                canChooseOwner={can(viewer, "lead.reassign")}
                defaults={{
                  name: c.name,
                  website: c.website ?? "",
                  linkedinUrl: c.linkedinUrl ?? "",
                  industry: c.industry ?? "",
                  headcountBand: c.headcountBand ?? "",
                  city: c.city ?? "",
                  country: c.country ?? "",
                  accountFilterId: c.accountFilterId ?? "",
                  ownerId: c.ownerId,
                  status: c.status,
                  notes: c.notes ?? "",
                }}
              />
              <MarkCustomerButton
                companyId={c.id}
                companyName={c.name}
                today={todayIst()}
                defaults={
                  c.status === "Customer"
                    ? {
                        planTier: c.planTier ?? "",
                        dealValueInr: c.dealValueInr ?? "",
                        customerStartDate: c.customerStartDate ?? todayIst(),
                      }
                    : undefined
                }
              />
            </>
          )}
        </div>
      </section>

      <div className={styles.columns}>
        <section className={styles.panel} aria-label="Timeline">
          <h2 className={styles.panelTitle}>Timeline (all their people)</h2>
          <Timeline events={events} showPerson />
        </section>
        <div>
          <section className={styles.panel} aria-label="Deal">
            <h2 className={styles.panelTitle}>Deal</h2>
            {c.status === "Customer" ? (
              <>
                <p className={styles.deal}>{formatInr(c.dealValueInr)}</p>
                <p className={styles.muted}>
                  {c.planTier ?? "No plan"} · customer since{" "}
                  {c.customerStartDate ? formatIstDate(c.customerStartDate) : "—"}
                </p>
              </>
            ) : (
              <p className={styles.muted}>Not a customer yet.</p>
            )}
          </section>
          <section className={styles.panel} aria-label="People">
            <h2 className={styles.panelTitle}>People ({c.people.length})</h2>
            {c.people.length === 0 ? (
              <p className={styles.muted}>No people linked yet.</p>
            ) : (
              <ul className={styles.peopleList}>
                {c.people.map((p) => (
                  <li key={p.id}>
                    <span>
                      <Link href={`/people/${p.id}`}>{p.fullName}</Link>
                      <span className={styles.muted}>
                        {" "}
                        · {p.title ?? "No title"} · {p.ownerName}
                      </span>
                    </span>
                    <StageBadge stage={p.stage} />
                  </li>
                ))}
              </ul>
            )}
          </section>
          {c.notes && (
            <section className={styles.panel}>
              <h2 className={styles.panelTitle}>Notes</h2>
              <p className={styles.eventBody}>{c.notes}</p>
            </section>
          )}
          <section className={styles.panel}>
            <Suspense fallback={<StatusMessage title="Loading history…" />}>
              <ChangeHistory entityType="Company" recordId={c.id} />
            </Suspense>
          </section>
        </div>
      </div>
    </>
  );
}
