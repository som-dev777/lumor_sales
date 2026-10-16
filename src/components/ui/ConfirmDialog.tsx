"use client";

import * as AlertDialog from "@radix-ui/react-alert-dialog";
import type { ReactNode } from "react";
import { Button } from "./Button";
import styles from "./Dialog.module.scss";
import confirmStyles from "./ConfirmDialog.module.scss";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: ReactNode;
  confirmLabel: string;
  tone?: "primary" | "danger";
  busy?: boolean;
  onConfirm: () => void;
};

/** "Are you sure?" before an important change, e.g. deactivating someone. */
export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel,
  tone = "primary",
  busy = false,
  onConfirm,
}: Props) {
  return (
    <AlertDialog.Root open={open} onOpenChange={onOpenChange}>
      <AlertDialog.Portal>
        <AlertDialog.Overlay className={styles.overlay} />
        <AlertDialog.Content className={styles.content}>
          <AlertDialog.Title className={styles.title}>{title}</AlertDialog.Title>
          <AlertDialog.Description className={styles.description}>
            {description}
          </AlertDialog.Description>
          <div className={confirmStyles.actions}>
            <AlertDialog.Cancel asChild>
              <Button variant="secondary" disabled={busy}>
                Cancel
              </Button>
            </AlertDialog.Cancel>
            <Button variant={tone} loading={busy} onClick={onConfirm}>
              {confirmLabel}
            </Button>
          </div>
        </AlertDialog.Content>
      </AlertDialog.Portal>
    </AlertDialog.Root>
  );
}
