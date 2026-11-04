import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { ExternalLink } from "lucide-react";
import { ChangeHistory } from "@/components/audit/ChangeHistory";
import { CompanyAdminActions } from "@/components/leads/CompanyAdminActions";
import { CompanyDialogButton } from "@/components/leads/CompanyDialogButton";
import { CompanyNotes } from "@/components/leads/CompanyNotes";
import { PersonDialogButton } from "@/components/leads/PersonDialogButton";
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
import { asc, ne } from "drizzle-orm";
import { company } from "@/lib/db/schema";
import { companyTimeline, getCompany } from "@/server/leads/companies";
import { canChangeOfficeOwner, canEditOffice, listOffices } from "@/server/leads/offices";
import { DeleteOfficeButton, OfficeDialogButton } from "@/components/leads/OfficeDialogButton";
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
  const mayDelete = can(viewer, "lead.delete");
  const [events, options, others, offices] = await Promise.all([
    companyTimeline(db, id),
    leadFormOptions(db),
    mayDelete
      ? db
          .select({ id: company.id, name: company.name })
          .from(company)
          .where(ne(company.id, id))
          .orderBy(asc(company.name))
      : Promise.resolve([]),
    listOffices(db, id),
  ]);
  const officeName = new Map(offices.map((o) => [o.id, o.name]));
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
          {mayDelete && (
            <CompanyAdminActions
              companyId={c.id}
              companyName={c.name}
              peopleCount={c.people.length}
              others={others}
            />
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
          <section className={styles.panel} aria-label="Offices">
            <div className={styles.panelHead}>
              <h2 className={styles.panelTitle}>Offices ({offices.length})</h2>
              {can(viewer, "lead.create") && (
                <OfficeDialogButton
                  companyId={c.id}
                  companyName={c.name}
                  owners={options.owners}
                  canChooseOwner={can(viewer, "lead.reassign")}
                />
              )}
            </div>
            {offices.length === 0 ? (
              <p className={styles.muted}>
                No offices yet. Add the main (corporate) office and any others, like Bangalore or
                Mumbai.
              </p>
            ) : (
              <ul className={styles.officeList}>
                {offices.map((o) => (
                  <li key={o.id} className={styles.officeItem} aria-label={`Office ${o.name}`}>
                    <div className={styles.officeMain}>
                      <span>
                        <strong>{o.name}</strong>{" "}
                        {o.isMain && <Badge tone="primary">Main office</Badge>}
                      </span>
                      <span className={styles.muted}>
                        {[o.address, o.city, o.country].filter(Boolean).join(", ") ||
                          "No location yet"}{" "}
                        · {o.peopleCount} {o.peopleCount === 1 ? "person" : "people"}
                      </span>
                      <span className={styles.muted}>
                        Owner: {o.ownerName} · Added by {o.addedByName ?? "—"}
                      </span>
                    </div>
                    {canEditOffice(viewer, o, c.ownerId) && (
                      <div className={styles.officeActions}>
                        <OfficeDialogButton
                          companyId={c.id}
                          companyName={c.name}
                          officeId={o.id}
                          owners={options.owners}
                          canChooseOwner={canChangeOfficeOwner(viewer, o)}
                          defaults={{
                            name: o.name,
                            city: o.city ?? "",
                            country: o.country ?? "",
                            address: o.address ?? "",
                            isMain: o.isMain,
                            ownerId: "",
                          }}
                        />
                        <DeleteOfficeButton officeId={o.id} name={o.name} />
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </section>
          <section className={styles.panel} aria-label="People">
            <div className={styles.panelHead}>
              <h2 className={styles.panelTitle}>People ({c.people.length})</h2>
              {can(viewer, "lead.create") && (
                <PersonDialogButton
                  options={options}
                  canChooseOwner={can(viewer, "lead.reassign")}
                  companyName={c.name}
                />
              )}
            </div>
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
                        · {p.title ?? "No title"}
                        {p.officeId && officeName.has(p.officeId)
                          ? ` · ${officeName.get(p.officeId)}`
                          : ""}{" "}
                        · {p.ownerName}
                      </span>
                    </span>
                    <StageBadge stage={p.stage} />
                  </li>
                ))}
              </ul>
            )}
          </section>
          <section className={styles.panel} aria-label="Notes">
            <h2 className={styles.panelTitle}>Notes</h2>
            <CompanyNotes key={c.notes ?? ""} companyId={c.id} notes={c.notes} canEdit={mayEdit} />
          </section>
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
