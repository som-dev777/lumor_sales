import type { Metadata } from "next";
import { connection } from "next/server";
import { Suspense } from "react";
import { PageHeader } from "@/components/shell/PageHeader";
import { RequirePermission } from "@/components/shell/RequirePermission";
import { StatusMessage } from "@/components/ui/StatusMessage";
import { InviteButton } from "@/components/users/InviteButton";
import { PendingInvites } from "@/components/users/PendingInvites";
import { TeamTable } from "@/components/users/TeamTable";
import { getDb } from "@/lib/db/client";
import { requireUser } from "@/lib/session";
import { formatIst, formatIstDate, toIstDate } from "@/lib/time";
import { listPendingInvites, listTeam } from "@/server/user-admin";

export const metadata: Metadata = { title: "Users" };

export default function UsersPage() {
  return (
    <RequirePermission action="user.manage">
      <PageHeader
        title="Users"
        description="Invite people, change roles, deactivate and reactivate. Nobody is ever deleted."
        actions={<InviteButton />}
      />
      <Suspense fallback={<StatusMessage title="Loading the team…" />}>
        <Team />
      </Suspense>
    </RequirePermission>
  );
}

async function Team() {
  const viewer = await requireUser();
  await connection(); // the pending-invite list depends on the current time
  const db = getDb();
  const [members, invites] = await Promise.all([listTeam(db), listPendingInvites(db)]);

  return (
    <>
      <TeamTable
        viewerId={viewer.id}
        members={members.map((m) => ({
          id: m.id,
          name: m.name,
          email: m.email,
          role: m.role,
          active: m.active,
          openLeads: m.openLeads,
          joined: formatIstDate(toIstDate(m.createdAt)),
        }))}
      />
      <PendingInvites
        invites={invites.map((i) => ({
          id: i.id,
          email: i.email,
          role: i.role,
          expires: formatIst(i.expiresAt),
        }))}
      />
    </>
  );
}
