"use client";

import * as Menu from "@radix-ui/react-dropdown-menu";
import { MoreHorizontal } from "lucide-react";
import { useState, useTransition } from "react";
import { Alert } from "@/components/ui/Alert";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { CopyField } from "@/components/ui/CopyField";
import { Dialog } from "@/components/ui/Dialog";
import type { ActionResult } from "@/lib/action-result";
import {
  changeRole,
  createResetLink,
  deactivateUser,
  reactivateUser,
} from "@/server/actions/users";
import styles from "./users.module.scss";

export type TeamRow = {
  id: string;
  name: string;
  email: string;
  role: "Admin" | "User";
  active: boolean;
  joined: string;
  openLeads: number;
};

type Pending =
  | { kind: "role"; member: TeamRow }
  | { kind: "deactivate"; member: TeamRow }
  | { kind: "reactivate"; member: TeamRow }
  | { kind: "reset"; member: TeamRow };

export function TeamTable({ members, viewerId }: { members: TeamRow[]; viewerId: string }) {
  const [pending, setPending] = useState<Pending | null>(null);
  const [result, setResult] = useState<ActionResult | null>(null);
  const [resetLink, setResetLink] = useState<{ name: string; link: string } | null>(null);
  const [busy, startTransition] = useTransition();

  function confirm() {
    if (!pending) return;
    const { kind, member } = pending;
    startTransition(async () => {
      const res =
        kind === "role"
          ? await changeRole(member.id, member.role === "Admin" ? "User" : "Admin")
          : kind === "deactivate"
            ? await deactivateUser(member.id)
            : kind === "reactivate"
              ? await reactivateUser(member.id)
              : await createResetLink(member.id);
      setPending(null);
      if (kind === "reset" && res.ok && res.link) {
        setResetLink({ name: member.name, link: res.link });
        setResult(null);
      } else {
        setResult(res);
      }
    });
  }

  const copy = pending ? confirmCopy(pending) : null;

  return (
    <>
      {result && (
        <div className={styles.result}>
          <Alert tone={result.ok ? "success" : "error"}>
            {result.ok ? result.message : result.error}
          </Alert>
        </div>
      )}

      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th scope="col">Name</th>
              <th scope="col">Role</th>
              <th scope="col">Status</th>
              <th scope="col" className={styles.num}>
                Open leads
              </th>
              <th scope="col">Joined</th>
              <th scope="col">
                <span className={styles.srOnly}>Actions</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {members.map((m) => {
              const isMe = m.id === viewerId;
              return (
                <tr key={m.id} className={m.active ? undefined : styles.inactiveRow}>
                  <td>
                    <div className={styles.name}>
                      {m.name} {isMe && <Badge>You</Badge>}
                    </div>
                    <div className={styles.email}>{m.email}</div>
                  </td>
                  <td>
                    <Badge tone={m.role === "Admin" ? "primary" : "neutral"}>{m.role}</Badge>
                  </td>
                  <td>
                    {m.active ? (
                      <Badge tone="success">Active</Badge>
                    ) : (
                      <Badge tone="danger">Deactivated</Badge>
                    )}
                  </td>
                  <td className={styles.num}>
                    {m.openLeads}
                    {!m.active && m.openLeads > 0 && (
                      <div className={styles.warn}>Reassign these leads</div>
                    )}
                  </td>
                  <td className={styles.muted}>{m.joined}</td>
                  <td className={styles.actionsCell}>
                    <Menu.Root>
                      <Menu.Trigger asChild>
                        <Button variant="ghost" aria-label={`Actions for ${m.name}`}>
                          <MoreHorizontal size={18} aria-hidden />
                        </Button>
                      </Menu.Trigger>
                      <Menu.Portal>
                        <Menu.Content className={styles.menu} align="end" sideOffset={4}>
                          <Menu.Item
                            className={styles.menuItem}
                            disabled={isMe}
                            onSelect={() => setPending({ kind: "role", member: m })}
                          >
                            {m.role === "Admin" ? "Make User" : "Make Admin"}
                          </Menu.Item>
                          <Menu.Item
                            className={styles.menuItem}
                            onSelect={() => setPending({ kind: "reset", member: m })}
                          >
                            Create password reset link
                          </Menu.Item>
                          <Menu.Separator className={styles.menuSeparator} />
                          {m.active ? (
                            <Menu.Item
                              className={`${styles.menuItem} ${styles.danger}`}
                              disabled={isMe}
                              onSelect={() => setPending({ kind: "deactivate", member: m })}
                            >
                              Deactivate
                            </Menu.Item>
                          ) : (
                            <Menu.Item
                              className={styles.menuItem}
                              onSelect={() => setPending({ kind: "reactivate", member: m })}
                            >
                              Reactivate
                            </Menu.Item>
                          )}
                          {isMe && (
                            <div className={styles.menuNote}>
                              You can&apos;t change your own role or deactivate yourself.
                            </div>
                          )}
                        </Menu.Content>
                      </Menu.Portal>
                    </Menu.Root>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {copy && (
        <ConfirmDialog
          open={pending !== null}
          onOpenChange={(o) => !o && !busy && setPending(null)}
          title={copy.title}
          description={copy.description}
          confirmLabel={copy.confirmLabel}
          tone={copy.tone}
          busy={busy}
          onConfirm={confirm}
        />
      )}

      <Dialog
        open={resetLink !== null}
        onOpenChange={(o) => !o && setResetLink(null)}
        title="Password reset link"
        description={`Send this to ${resetLink?.name}. It works once, for 24 hours, and logs them out on other devices.`}
      >
        {resetLink && (
          <div className={styles.stack}>
            <CopyField label="Reset link" value={resetLink.link} />
            <div className={styles.dialogActions}>
              <Button onClick={() => setResetLink(null)}>Done</Button>
            </div>
          </div>
        )}
      </Dialog>
    </>
  );
}

function confirmCopy({ kind, member }: Pending) {
  switch (kind) {
    case "role":
      return member.role === "Admin"
        ? {
            title: `Make ${member.name} a User?`,
            description:
              "They'll lose Admin powers: managing the team, the Official playbook, approvals, settings and the Audit Log.",
            confirmLabel: "Make User",
            tone: "primary" as const,
          }
        : {
            title: `Make ${member.name} an Admin?`,
            description:
              "They'll be able to manage the team, the Official playbook, approvals, settings and see the Audit Log.",
            confirmLabel: "Make Admin",
            tone: "primary" as const,
          };
    case "deactivate":
      return {
        title: `Deactivate ${member.name}?`,
        description:
          member.openLeads > 0
            ? `They'll be blocked from the app straight away. Their ${member.openLeads} open leads stay assigned to them until you reassign them.`
            : "They'll be blocked from the app straight away. You can reactivate them later; nothing is deleted.",
        confirmLabel: "Deactivate",
        tone: "danger" as const,
      };
    case "reactivate":
      return {
        title: `Reactivate ${member.name}?`,
        description: "They'll be able to log in again with their existing password.",
        confirmLabel: "Reactivate",
        tone: "primary" as const,
      };
    case "reset":
      return {
        title: `Create a reset link for ${member.name}?`,
        description:
          "You'll get a link to send them. Their current password keeps working until they use it.",
        confirmLabel: "Create link",
        tone: "primary" as const,
      };
  }
}
