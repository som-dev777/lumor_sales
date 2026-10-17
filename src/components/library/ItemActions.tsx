"use client";

import * as Menu from "@radix-ui/react-dropdown-menu";
import { MoreHorizontal } from "lucide-react";
import { useState, useTransition } from "react";
import { ChangeDetails } from "@/components/audit/ChangeDetails";
import { Button } from "@/components/ui/Button";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { Dialog } from "@/components/ui/Dialog";
import { StatusMessage } from "@/components/ui/StatusMessage";
import { useToast } from "@/components/ui/Toast";
import { itemHistory, libraryAction, type HistoryEntry } from "@/server/actions/library";
import { KIND_NOUN, type LibraryKind } from "@/server/library/kinds";
import { LibraryForm } from "./LibraryForm";
import styles from "./library.module.scss";

export type ItemPermissions = {
  canEdit: boolean;
  canDelete: boolean;
  canPropose: boolean;
};

type Props = {
  kind: LibraryKind;
  id: string;
  name: string;
  archived: boolean;
  permissions: ItemPermissions;
  /** Current values for the edit form. */
  editValues: unknown;
};

type Confirm = "archive" | "delete" | "propose" | null;

/** The ⋯ menu on a library card. What's offered depends on the server's permission check. */
export function ItemActions({ kind, id, name, archived, permissions, editValues }: Props) {
  const notify = useToast();
  const noun = KIND_NOUN[kind];
  const [editing, setEditing] = useState(false);
  const [confirm, setConfirm] = useState<Confirm>(null);
  const [history, setHistory] = useState<HistoryEntry[] | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [busy, startTransition] = useTransition();

  function run(action: "archive" | "restore" | "delete" | "duplicate" | "propose") {
    startTransition(async () => {
      const result = await libraryAction(kind, id, action);
      setConfirm(null);
      notify(
        result.ok ? "success" : "error",
        result.ok ? (result.message ?? "Done.") : result.error,
      );
    });
  }

  function openHistory() {
    setHistoryOpen(true);
    setHistory(null);
    startTransition(async () => setHistory(await itemHistory(kind, id)));
  }

  const confirmCopy = {
    archive: {
      title: `Archive "${name}"?`,
      description: `It will be hidden from pickers and from the list (use "Show archived" to see it), but stays on old records. You can restore it any time.`,
      label: "Archive",
      tone: "primary" as const,
    },
    delete: {
      title: `Delete "${name}"?`,
      description: `This can't be undone. If any lead uses this ${noun}, the app will refuse and suggest archiving instead.`,
      label: "Delete",
      tone: "danger" as const,
    },
    propose: {
      title: `Propose "${name}" as Official?`,
      description:
        "An Admin will review it. If approved, it becomes part of the team's Official playbook, owned by that Admin.",
      label: "Propose",
      tone: "primary" as const,
    },
  };

  return (
    <>
      <Menu.Root>
        <Menu.Trigger asChild>
          <Button variant="ghost" aria-label={`Actions for ${name}`}>
            <MoreHorizontal size={18} aria-hidden />
          </Button>
        </Menu.Trigger>
        <Menu.Portal>
          <Menu.Content className={styles.menu} align="end" sideOffset={4}>
            {permissions.canEdit && !archived && (
              <Menu.Item className={styles.menuItem} onSelect={() => setEditing(true)}>
                Edit
              </Menu.Item>
            )}
            <Menu.Item className={styles.menuItem} onSelect={() => run("duplicate")}>
              Duplicate to my Personal
            </Menu.Item>
            {permissions.canPropose && (
              <Menu.Item className={styles.menuItem} onSelect={() => setConfirm("propose")}>
                Propose as Official
              </Menu.Item>
            )}
            <Menu.Item className={styles.menuItem} onSelect={openHistory}>
              Change history
            </Menu.Item>
            {(permissions.canEdit || permissions.canDelete) && (
              <Menu.Separator className={styles.menuSeparator} />
            )}
            {permissions.canEdit &&
              (archived ? (
                <Menu.Item className={styles.menuItem} onSelect={() => run("restore")}>
                  Restore
                </Menu.Item>
              ) : (
                <Menu.Item className={styles.menuItem} onSelect={() => setConfirm("archive")}>
                  Archive
                </Menu.Item>
              ))}
            {permissions.canDelete && (
              <Menu.Item
                className={`${styles.menuItem} ${styles.danger}`}
                onSelect={() => setConfirm("delete")}
              >
                Delete
              </Menu.Item>
            )}
          </Menu.Content>
        </Menu.Portal>
      </Menu.Root>

      {confirm && (
        <ConfirmDialog
          open
          onOpenChange={(o) => !o && !busy && setConfirm(null)}
          title={confirmCopy[confirm].title}
          description={confirmCopy[confirm].description}
          confirmLabel={confirmCopy[confirm].label}
          tone={confirmCopy[confirm].tone}
          busy={busy}
          onConfirm={() => run(confirm)}
        />
      )}

      <Dialog open={editing} onOpenChange={setEditing} size="lg" title={`Edit ${noun}`}>
        {editing && (
          <LibraryForm
            kind={kind}
            target={{ mode: "edit", id }}
            values={editValues}
            onDone={() => setEditing(false)}
          />
        )}
      </Dialog>

      <Dialog
        open={historyOpen}
        onOpenChange={setHistoryOpen}
        size="lg"
        title={`Change history: ${name}`}
      >
        {history === null ? (
          <StatusMessage title="Loading…" />
        ) : history.length === 0 ? (
          <p className={styles.empty}>No changes recorded yet.</p>
        ) : (
          <ol className={styles.history}>
            {history.map((h) => (
              <li key={h.id}>
                <p className={styles.historyMeta}>
                  <strong>{h.action}</strong> by {h.who} · {h.when}
                </p>
                <ChangeDetails changes={h.changes} />
              </li>
            ))}
          </ol>
        )}
      </Dialog>
    </>
  );
}
