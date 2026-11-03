"use client";

import * as RadixDialog from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { useEffect, useRef, type ReactNode } from "react";
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
  const content = useRef<HTMLDivElement>(null);
  // A success message (toast) sits above the dialog, so Radix would give Escape to the message
  // first. Escape closes the topmost dialog straight away instead (D-045).
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || !content.current) return;
      const dialogs = document.querySelectorAll('[role="dialog"], [role="alertdialog"]');
      if (dialogs[dialogs.length - 1] !== content.current) return;
      e.preventDefault();
      e.stopPropagation();
      onOpenChange(false);
    };
    document.addEventListener("keydown", onKey, true);
    return () => document.removeEventListener("keydown", onKey, true);
  }, [open, onOpenChange]);
  // When a dialog disappears while open (say the meeting it belongs to was just cancelled), the
  // page could stay frozen: nothing clickable. Unfreeze it once no dialog is left (D-051).
  useEffect(() => {
    if (!open) return;
    return () => {
      setTimeout(() => {
        if (!document.querySelector('[role="dialog"], [role="alertdialog"]')) {
          document.body.style.pointerEvents = "";
        }
      }, 300);
    };
  }, [open]);
  return (
    <RadixDialog.Root open={open} onOpenChange={onOpenChange}>
      <RadixDialog.Portal>
        <RadixDialog.Overlay className={styles.overlay} />
        <RadixDialog.Content
          ref={content}
          className={`${styles.content} ${size === "lg" ? styles.lg : ""}`}
        >
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
