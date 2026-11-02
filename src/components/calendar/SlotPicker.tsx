"use client";

import { useState, useSyncExternalStore } from "react";
import { SelectField } from "@/components/ui/SelectField";
import styles from "./calendar.module.scss";

const subscribe = () => () => {};
const ZONES = [
  "Asia/Kolkata",
  "Asia/Dubai",
  "Asia/Singapore",
  "Asia/Tokyo",
  "Australia/Sydney",
  "Europe/London",
  "Europe/Berlin",
  "America/New_York",
  "America/Chicago",
  "America/Los_Angeles",
  "UTC",
];

/** A time zone's name for people: India's two names read "India time (IST)". */
export const zoneName = (z: string) =>
  z === "Asia/Kolkata" || z === "Asia/Calcutta" ? "India time (IST)" : z.replaceAll("_", " ");

/** The visitor's time zone (their browser's until they pick another). */
export function useTimeZone() {
  const browser = useSyncExternalStore(
    subscribe,
    () => Intl.DateTimeFormat().resolvedOptions().timeZone || "Asia/Kolkata",
    () => "Asia/Kolkata",
  );
  const [chosen, setChosen] = useState<string | null>(null);
  const zone = chosen ?? browser;
  const options = [...new Set([browser, ...ZONES])].map((z) => ({ value: z, label: zoneName(z) }));
  return { zone, setZone: setChosen, options };
}

const dayKey = (d: Date, tz: string) =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);

export const formatTime = (d: Date, tz: string) =>
  new Intl.DateTimeFormat("en-GB", {
    timeZone: tz,
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(d);

export const formatDay = (d: Date, tz: string, long = false) =>
  new Intl.DateTimeFormat("en-GB", {
    timeZone: tz,
    weekday: long ? "long" : "short",
    day: "numeric",
    month: long ? "long" : "short",
  }).format(d);

/**
 * Pick a day, then a time, in the visitor's time zone (F22). `slots` are the free start times
 * from the server, as ISO strings.
 */
export function SlotPicker({
  slots,
  value,
  onChange,
  zone,
  setZone,
  zoneOptions,
}: {
  slots: string[];
  value: string | null;
  onChange: (iso: string) => void;
  zone: string;
  setZone: (z: string) => void;
  zoneOptions: { value: string; label: string }[];
}) {
  const byDay = new Map<string, Date[]>();
  for (const iso of slots) {
    const d = new Date(iso);
    const key = dayKey(d, zone);
    byDay.set(key, [...(byDay.get(key) ?? []), d]);
  }
  const days = [...byDay.keys()];
  const [picked, setPicked] = useState<string | null>(null);
  const day = picked && byDay.has(picked) ? picked : (days[0] ?? null);
  const times = day ? byDay.get(day)! : [];

  if (slots.length === 0) {
    return <p className={styles.muted}>No free times right now. Please check again later.</p>;
  }

  return (
    <div className={styles.stack}>
      <div className={styles.picker}>
        <div>
          <h2 className={styles.sectionTitle}>Pick a day</h2>
          <div className={styles.days} role="group" aria-label="Days">
            {days.map((k) => {
              const first = byDay.get(k)![0];
              return (
                <button
                  key={k}
                  type="button"
                  className={styles.day}
                  aria-pressed={k === day}
                  onClick={() => setPicked(k)}
                >
                  <span className={styles.dayWeek}>
                    {new Intl.DateTimeFormat("en-GB", { timeZone: zone, weekday: "short" }).format(
                      first,
                    )}
                  </span>
                  {new Intl.DateTimeFormat("en-GB", {
                    timeZone: zone,
                    day: "numeric",
                    month: "short",
                  }).format(first)}
                </button>
              );
            })}
          </div>
        </div>
        <div>
          <h2 className={styles.sectionTitle}>{day ? formatDay(times[0], zone, true) : "Times"}</h2>
          <div className={styles.times} role="group" aria-label="Times">
            {times.map((t) => (
              <button
                key={t.toISOString()}
                type="button"
                className={styles.time}
                aria-pressed={value === t.toISOString()}
                onClick={() => onChange(t.toISOString())}
              >
                {formatTime(t, zone)}
              </button>
            ))}
          </div>
        </div>
      </div>
      <div className={styles.grid2}>
        <SelectField
          label="Time zone"
          value={zone}
          options={zoneOptions}
          onChange={(e) => setZone(e.target.value)}
        />
      </div>
    </div>
  );
}
