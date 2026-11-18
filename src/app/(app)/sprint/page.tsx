import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { PageHeader } from "@/components/shell/PageHeader";
import { LinkedInEmails } from "@/components/sprint/LinkedInEmails";
import { Sprint } from "@/components/sprint/Sprint";
import { WaitingList } from "@/components/sprint/WaitingList";
import styles from "@/components/sprint/sprint.module.scss";
import { Button } from "@/components/ui/Button";
import { SelectField } from "@/components/ui/SelectField";
import { StatusMessage } from "@/components/ui/StatusMessage";
import { appNow } from "@/lib/clock";
import { getDb } from "@/lib/db/client";
import { requireUser } from "@/lib/session";
import { connectionView, googleConfigured } from "@/server/google/google";
import { recentLinkedInEmails } from "@/server/google/linkedin-mail";
import { leadFormOptions } from "@/server/leads/options";
import { connectionQueue, followUpQueue } from "@/server/sprint";

export const metadata: Metadata = { title: "Outreach sprint" };

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
const UUID = /^[0-9a-f-]{36}$/;

export default function SprintPage({ searchParams }: PageProps<"/sprint">) {
  return (
    <Suspense
      fallback={
        <>
          <PageHeader title="Outreach sprint" />
          <StatusMessage title="Finding who's next…" />
        </>
      }
    >
      <SprintView searchParams={searchParams} />
    </Suspense>
  );
}

async function SprintView({ searchParams }: Pick<PageProps<"/sprint">, "searchParams">) {
  const viewer = await requireUser();
  await connection();
  const params = await searchParams;
  const follow = one(params.kind) === "follow";
  const now = await appNow();
  const db = getDb();
  const tabs = (
    <nav className={styles.tabs} aria-label="Sprint kind">
      <Link href="/sprint" aria-current={follow ? undefined : "page"} className={styles.linkButton}>
        Connection sprint
      </Link>
      <Link
        href="/sprint?kind=follow"
        aria-current={follow ? "page" : undefined}
        className={styles.linkButton}
      >
        Follow-up sprint
      </Link>
    </nav>
  );

  if (follow) {
    const [{ waiting, cards }, google, emails] = await Promise.all([
      followUpQueue(db, viewer, now),
      connectionView(db, viewer.id),
      recentLinkedInEmails(db, viewer.id),
    ]);
    return (
      <>
        <PageHeader
          title="Follow-up sprint"
          description="Check who accepted, then send the messages that are due. You send each one on LinkedIn; Sales Hub writes it and logs it."
        />
        {tabs}
        <LinkedInEmails
          configured={googleConfigured()}
          readsGmail={Boolean(google?.readsGmail)}
          rows={emails}
          result={one(params.gmail)}
        />
        <WaitingList rows={waiting} now={now.getTime()} />
        <h2 className={styles.sectionTitle}>Messages to send ({cards.length})</h2>
        <Sprint key={cards.map((c) => c.personId).join()} kind="follow" cards={cards} />
      </>
    );
  }

  const personaId = one(params.persona);
  const accountFilterId = one(params.filter);
  const [{ limits, cards }, options] = await Promise.all([
    connectionQueue(
      db,
      viewer,
      {
        personaId: personaId && UUID.test(personaId) ? personaId : null,
        accountFilterId: accountFilterId && UUID.test(accountFilterId) ? accountFilterId : null,
      },
      now,
    ),
    leadFormOptions(db),
  ]);
  return (
    <>
      <PageHeader
        title="Connection sprint"
        description="People you haven't contacted yet, Tier 1 first, with a note written for each. Send each request on LinkedIn yourself, then click Sent ✓."
      />
      {tabs}
      <form className={styles.filters} action="/sprint">
        <SelectField
          label="Persona"
          name="persona"
          defaultValue={personaId ?? ""}
          options={[
            { value: "", label: "Any persona" },
            ...options.personas.map((p) => ({ value: p.id, label: p.label })),
          ]}
        />
        <SelectField
          label="Account filter"
          name="filter"
          defaultValue={accountFilterId ?? ""}
          options={[
            { value: "", label: "Any account filter" },
            ...options.accountFilters.map((p) => ({ value: p.id, label: p.label })),
          ]}
        />
        <Button type="submit" variant="secondary">
          Apply
        </Button>
      </form>
      <Sprint
        key={`${personaId ?? ""}-${accountFilterId ?? ""}`}
        kind="connect"
        cards={cards}
        limits={limits}
      />
    </>
  );
}
