import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import styles from "@/components/reports/reports.module.scss";
import { PageHeader } from "@/components/shell/PageHeader";
import { StatusMessage } from "@/components/ui/StatusMessage";
import { getDb } from "@/lib/db/client";
import { spanLabel } from "@/lib/report-periods";
import { requireUser } from "@/lib/session";
import { formatIst } from "@/lib/time";
import { aiMode } from "@/server/ai/client";
import { asc, eq } from "drizzle-orm";
import { ReportBody } from "@/components/reports/ReportBody";
import { hiddenOf } from "@/lib/report-shape";
import { user } from "@/lib/db/schema";
import { getReport, mayShape } from "@/server/reports";

export const metadata: Metadata = { title: "Report" };

export default function ReportPage({ params }: PageProps<"/reports/[id]">) {
  return (
    <Suspense fallback={<StatusMessage title="Loading…" />}>
      <Report params={params} />
    </Suspense>
  );
}

async function Report({ params }: Pick<PageProps<"/reports/[id]">, "params">) {
  const viewer = await requireUser();
  await connection();
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const run = await getReport(getDb(), viewer, id);
  if (!run) notFound();
  const r = run.data;
  const teammates = (
    await getDb()
      .select({ id: user.id, name: user.name })
      .from(user)
      .where(eq(user.active, true))
      .orderBy(asc(user.name))
  ).filter((u) => u.id !== viewer.id);

  return (
    <>
      <p className={`${styles.muted} ${styles.noPrint}`}>
        <Link href="/reports">← Reports</Link>
      </p>
      <PageHeader
        title={r.title}
        description={`${spanLabel({ from: r.from, to: r.to })} · made ${formatIst(new Date(r.generatedAt))}${
          run.scheduleId ? " by a schedule" : ""
        }`}
      />
      <ReportBody
        reportId={run.id}
        data={run.data}
        edits={run.edits}
        hidden={hiddenOf(run.hiddenSections)}
        canShape={mayShape(viewer, run)}
        aiSummary={run.aiSummary}
        canSummarise={!run.aiSummary && aiMode() !== "off"}
        teammates={teammates}
      />
    </>
  );
}
