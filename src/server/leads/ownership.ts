// Owner changes notify (F28, D-054): when an office, a person or a company gets a new owner, the
// previous owner and the new owner each get a notification saying who changed it. Whoever made
// the change isn't notified. Runs inside the change's own transaction (its audit entry covers it).
import { inArray } from "drizzle-orm";
import type { DbOrTx } from "@/lib/db/client";
import { user } from "@/lib/db/schema";
import type { Actor } from "@/lib/permissions";
import { addNotificationsTx, type NewNotification } from "../notifications";

export type OwnedThing = {
  /** "office", "person" or "company". */
  kind: "office" | "person" | "company";
  /** What people read, e.g. "Acme · Bangalore office" or "Priya Sharma". */
  name: string;
  /** Where the notification opens. */
  link: string;
};

export async function notifyOwnerChange(
  tx: DbOrTx,
  actor: Actor,
  thing: OwnedThing,
  fromId: string,
  toId: string,
) {
  if (fromId === toId) return;
  const rows = await tx
    .select({ id: user.id, name: user.name })
    .from(user)
    .where(inArray(user.id, [actor.id, fromId, toId]));
  const name = (id: string) => rows.find((r) => r.id === id)?.name ?? "Someone";
  const items: NewNotification[] = [];
  if (fromId !== actor.id) {
    items.push({
      userId: fromId,
      kind: "removed",
      title: `New owner for the ${thing.kind} ${thing.name}`,
      body: `${name(actor.id)} made ${name(toId)} the owner of the ${thing.kind} ${thing.name}. You were its owner.`,
      link: thing.link,
    });
  }
  if (toId !== actor.id) {
    items.push({
      userId: toId,
      kind: "added",
      title: `You now own the ${thing.kind} ${thing.name}`,
      body: `${name(actor.id)} made you its owner (before: ${name(fromId)}).`,
      link: thing.link,
    });
  }
  await addNotificationsTx(tx, actor.id, items);
}
