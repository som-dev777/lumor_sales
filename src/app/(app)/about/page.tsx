import type { Metadata } from "next";
import { Suspense } from "react";
import { PageHeader } from "@/components/shell/PageHeader";
import { StatusMessage } from "@/components/ui/StatusMessage";
import { Badge } from "@/components/ui/Badge";
import { getDb } from "@/lib/db/client";
import { requireUser } from "@/lib/session";
import { testDate, testDateAllowed } from "@/lib/clock";
import { TestDateSwitch } from "@/components/shell/TestDateSwitch";
import { formatIstDate } from "@/lib/time";
import { APP_VERSION } from "@/lib/version";
import { latestReleases } from "@/server/releases";
import styles from "./about.module.scss";

export const metadata: Metadata = { title: "About" };

export default function AboutPage() {
  return (
    <>
      <PageHeader
        title="About"
        description="Lumor Sales Hub: LinkedIn prospecting, from first touch to paying customer."
      />
      <section className={styles.version}>
        <span className={styles.label}>Current version</span>
        <span className={styles.number}>v{APP_VERSION}</span>
      </section>
      <h2 className={styles.heading}>Latest releases</h2>
      <Suspense fallback={<StatusMessage title="Loading releases…" />}>
        <Releases />
      </Suspense>
      <Suspense fallback={null}>
        <TestDate />
      </Suspense>
    </>
  );
}

/** Local testing only (D-033 F10); never shown online. */
async function TestDate() {
  await requireUser();
  if (!testDateAllowed()) return null;
  return <TestDateSwitch current={await testDate()} />;
}

async function Releases() {
  await requireUser();
  const releases = await latestReleases(getDb(), 5);

  if (releases.length === 0) {
    return (
      <StatusMessage title="No releases recorded yet">
        <p>The first release, v1.0.0, will appear here.</p>
      </StatusMessage>
    );
  }

  return (
    <ol className={styles.list}>
      {releases.map((r) => (
        <li key={r.id} className={styles.release}>
          <div className={styles.releaseHeader}>
            <h3 className={styles.releaseVersion}>v{r.version}</h3>
            {r.version === APP_VERSION && <Badge tone="primary">Current</Badge>}
            <span className={styles.date}>{formatIstDate(r.releaseDate)}</span>
          </div>
          <p className={styles.summary}>{r.summary}</p>
          <ul className={styles.changes}>
            {r.changes.map((c, i) => (
              <li key={i}>{c}</li>
            ))}
          </ul>
        </li>
      ))}
    </ol>
  );
}
