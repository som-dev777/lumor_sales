"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { SelectField } from "@/components/ui/SelectField";

/** Whose meetings the calendar shows: everyone's (default), mine, or one rep's (D-042). */
export function WhoFilter({
  value,
  reps,
}: {
  value: string;
  reps: { id: string; name: string }[];
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  return (
    <SelectField
      label="Whose meetings"
      value={value}
      options={[
        { value: "all", label: "Everyone" },
        { value: "me", label: "Just me" },
        ...reps.map((r) => ({ value: r.id, label: r.name })),
      ]}
      onChange={(e) => {
        const next = new URLSearchParams(params.toString());
        if (e.target.value === "all") next.delete("who");
        else next.set("who", e.target.value);
        next.delete("booking");
        router.push(`${pathname}${next.size ? `?${next}` : ""}`);
      }}
    />
  );
}
