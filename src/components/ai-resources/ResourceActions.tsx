"use client";

import { Copy, Download, ExternalLink, Trash2 } from "lucide-react";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/Button";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { useToast } from "@/components/ui/Toast";
import { removeResource } from "@/server/actions/ai-resources";
import styles from "./ai-resources.module.scss";

type Props = {
  id: string;
  title: string;
  kind: "file" | "link";
  url: string | null;
  canManage: boolean;
};

/** Open, download, copy the link and (Admins) remove a sales resource (F20). */
export function ResourceActions({ id, title, kind, url, canManage }: Props) {
  const notify = useToast();
  const [confirm, setConfirm] = useState(false);
  const [busy, start] = useTransition();
  const href = kind === "link" ? (url ?? "#") : `/ai-resources/files/${id}`;

  return (
    <div className={styles.resourceActions}>
      <a
        className={styles.linkButton}
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        aria-label={`Open ${title}`}
      >
        <ExternalLink size={16} aria-hidden /> Open
      </a>
      {kind === "file" && (
        <a
          className={styles.linkButton}
          href={`${href}?download=1`}
          aria-label={`Download ${title}`}
        >
          <Download size={16} aria-hidden /> Download
        </a>
      )}
      <Button
        variant="ghost"
        aria-label={`Copy link to ${title}`}
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(
              kind === "link" ? (url ?? "") : new URL(href, window.location.href).href,
            );
            notify("success", "Link copied.");
          } catch {
            notify("error", "Couldn't copy. Open it and copy the address instead.");
          }
        }}
      >
        <Copy size={16} aria-hidden /> Copy link
      </Button>
      {canManage && (
        <>
          <Button variant="ghost" aria-label={`Remove ${title}`} onClick={() => setConfirm(true)}>
            <Trash2 size={16} aria-hidden /> Remove
          </Button>
          <ConfirmDialog
            open={confirm}
            onOpenChange={setConfirm}
            title={`Remove ${title}?`}
            description="Reps won't see it any more. The removal is recorded in the audit log."
            confirmLabel="Remove"
            tone="danger"
            busy={busy}
            onConfirm={() =>
              start(async () => {
                const r = await removeResource(id);
                notify(r.ok ? "success" : "error", r.ok ? (r.message ?? "Removed.") : r.error);
                if (r.ok) setConfirm(false);
              })
            }
          />
        </>
      )}
    </div>
  );
}
