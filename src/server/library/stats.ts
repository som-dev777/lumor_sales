// Live stats on library cards (F04–F06). Each item counts only its own leads and activities.
import { sql } from "drizzle-orm";
import type { DbOrTx } from "@/lib/db/client";
import type { LibraryKind } from "./items";

export type ItemStats = {
  leads: number;
  replied: number;
  demos: number;
  paid: number;
  accepted: number;
  /** replied ÷ accepted (D-017); null when nobody has accepted yet. */
  replyRate: number | null;
};

export type TemplateStats = {
  timesUsed: number;
  messaged: number;
  replied: number;
  /** Of the people messaged with this template, the share who replied afterwards; null if unused. */
  replyRate: number | null;
};

export const EMPTY_STATS: ItemStats = {
  leads: 0,
  replied: 0,
  demos: 0,
  paid: 0,
  accepted: 0,
  replyRate: null,
};
export const EMPTY_TEMPLATE_STATS: TemplateStats = {
  timesUsed: 0,
  messaged: 0,
  replied: 0,
  replyRate: null,
};

const hasActivity = (type: string) =>
  sql`sum(exists(select 1 from activity a where a.person_id = p.id and a.type = ${type}))`;

/** Lead stats for every persona or account filter (or templates, by opener), keyed by item id. */
export async function leadStats(db: DbOrTx, kind: LibraryKind): Promise<Map<string, ItemStats>> {
  const column =
    kind === "persona"
      ? sql.raw("p.persona_id")
      : kind === "accountFilter"
        ? sql.raw("p.account_filter_id")
        : sql.raw("p.opener_template_id");

  const rows = await db.all<{
    item_id: string;
    leads: number;
    paid: number;
    replied: number;
    demos: number;
    accepted: number;
  }>(sql`
    select ${column} as item_id,
           count(*) as leads,
           sum(p.converted) as paid,
           ${hasActivity("Reply received")} as replied,
           ${hasActivity("Meeting booked")} as demos,
           ${hasActivity("Request accepted")} as accepted
    from person p
    where ${column} is not null
    group by ${column}
  `);

  return new Map(
    rows.map((r) => {
      const accepted = Number(r.accepted);
      const replied = Number(r.replied);
      return [
        r.item_id,
        {
          leads: Number(r.leads),
          paid: Number(r.paid),
          replied,
          demos: Number(r.demos),
          accepted,
          replyRate: accepted > 0 ? replied / accepted : null,
        },
      ];
    }),
  );
}

/** Usage and reply rate for every template, keyed by template id (F06). */
export async function templateStats(db: DbOrTx): Promise<Map<string, TemplateStats>> {
  const rows = await db.all<{
    template_id: string;
    sent: number;
    messaged: number;
    replied: number;
  }>(sql`
    with first_use as (
      select a.template_id, a.person_id, min(a.occurred_at) as first_at, count(*) as sent
      from activity a
      where a.template_id is not null and a.type = 'Message sent'
      group by a.template_id, a.person_id
    )
    select f.template_id,
           sum(f.sent) as sent,
           count(*) as messaged,
           sum(exists(
             select 1 from activity r
             where r.person_id = f.person_id and r.type = 'Reply received' and r.occurred_at > f.first_at
           )) as replied
    from first_use f
    group by f.template_id
  `);
  const openers = await db.all<{ template_id: string; n: number }>(sql`
    select opener_template_id as template_id, count(*) as n
    from person where opener_template_id is not null
    group by opener_template_id
  `);
  const openerCount = new Map(openers.map((o) => [o.template_id, Number(o.n)]));

  const out = new Map<string, TemplateStats>();
  for (const r of rows) {
    const messaged = Number(r.messaged);
    const replied = Number(r.replied);
    out.set(r.template_id, {
      timesUsed: Math.max(Number(r.sent), openerCount.get(r.template_id) ?? 0),
      messaged,
      replied,
      replyRate: messaged > 0 ? replied / messaged : null,
    });
  }
  for (const [id, n] of openerCount) {
    if (!out.has(id)) out.set(id, { ...EMPTY_TEMPLATE_STATS, timesUsed: n });
  }
  return out;
}
