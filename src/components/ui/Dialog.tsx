"use client";

import * as RadixDialog from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import type { ReactNode } from "react";
import styles from "./Dialog.module.scss";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: ReactNode;
  /** "lg" for long forms. */
  size?: "md" | "lg";
  children: ReactNode;
};

/** A centred pop-up window with a title and a close button (Radix: keyboard and screen-reader friendly). */
export function Dialog({ open, onOpenChange, title, description, size = "md", children }: Props) {
  return (
    <RadixDialog.Root open={open} onOpenChange={onOpenChange}>
      <RadixDialog.Portal>
        <RadixDialog.Overlay className={styles.overlay} />
        <RadixDialog.Content className={`${styles.content} ${size === "lg" ? styles.lg : ""}`}>
          <div className={styles.header}>
            <RadixDialog.Title className={styles.title}>{title}</RadixDialog.Title>
            <RadixDialog.Close className={styles.close} aria-label="Close">
              <X size={18} aria-hidden />
            </RadixDialog.Close>
          </div>
          {description ? (
            <RadixDialog.Description className={styles.description}>
              {description}
            </RadixDialog.Description>
          ) : (
            <RadixDialog.Description className={styles.hidden}>{title}</RadixDialog.Description>
          )}
          <div className={styles.body}>{children}</div>
        </RadixDialog.Content>
      </RadixDialog.Portal>
    </RadixDialog.Root>
  );
}
