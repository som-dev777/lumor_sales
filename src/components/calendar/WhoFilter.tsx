"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import fieldStyles from "@/components/ui/TextField.module.scss";
import styles from "./calendar.module.scss";

/**
 * Whose meetings the calendar shows: one rep's, starting on the signed-in rep (D-043). The
 * label is for screen readers, so the box lines up with the view buttons beside it.
 */
export function WhoFilter({
  value,
  me,
  reps,
}: {
  value: string;
  me: string;
  reps: { id: string; name: string }[];
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  return (
    <label className={styles.whoBox}>
      <span className={styles.srOnly}>Whose meetings</span>
      <select
        className={`${fieldStyles.input} ${styles.whoSelect}`}
        value={value}
        onChange={(e) => {
          const next = new URLSearchParams(params.toString());
          if (e.target.value === me) next.delete("who");
          else next.set("who", e.target.value);
          next.delete("booking");
          router.push(`${pathname}${next.size ? `?${next}` : ""}`);
        }}
      >
        {reps.map((r) => (
          <option key={r.id} value={r.id}>
            {r.id === me ? `${r.name} (me)` : r.name}
          </option>
        ))}
      </select>
    </label>
  );
}
