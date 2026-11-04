"use client";

import Link from "next/link";
import type { FieldErrors, FieldValues } from "react-hook-form";
import { Alert } from "@/components/ui/Alert";
import styles from "./leads.module.scss";

/**
 * What stops a save, shown next to the buttons (D-054): after Fill with AI the form is scrolled
 * down, so a message at the top (or under a field out of view) looked like "nothing happens".
 */
export function FormProblems<T extends FieldValues>({
  formError,
  errors,
  labels,
  link,
}: {
  formError: string | null;
  errors: FieldErrors<T>;
  labels: Record<string, string>;
  link?: { href: string; label: string } | null;
}) {
  const problems = Object.entries(errors)
    .filter(([key, e]) => key !== "root" && e && typeof e.message === "string")
    .map(([key, e]) => `${labels[key] ?? key}: ${e!.message as string}`);
  if (!formError && problems.length === 0) return null;
  return (
    <Alert tone="error">
      {formError ?? "Please fix these before saving:"}
      {link && (
        <>
          {" "}
          <Link href={link.href}>{link.label}</Link>
        </>
      )}
      {problems.length > 0 && (
        <ul className={styles.formProblems}>
          {problems.map((p) => (
            <li key={p}>{p}</li>
          ))}
        </ul>
      )}
    </Alert>
  );
}
