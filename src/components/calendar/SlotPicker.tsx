"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { useMemo, useState, useSyncExternalStore } from "react";
import { SelectField } from "@/components/ui/SelectField";
import styles from "./calendar.module.scss";

const subscribe = () => () => {};
const IST = "Asia/Kolkata";

/** A time zone's name for people: India's two names read "India Standard Time (IST)". */
export const zoneName = (z: string) =>
  z === IST || z === "Asia/Calcutta" ? "India Standard Time (IST)" : z.replaceAll("_", " ");

/** "GMT+5:30" for a zone right now. */
function offsetOf(zone: string, at: Date): string {
  try {
    const part = new Intl.DateTimeFormat("en-US", { timeZone: zone, timeZoneName: "shortOffset" })
      .formatToParts(at)
      .find((p) => p.type === "timeZoneName")?.value;
    return part === "GMT" ? "GMT+0" : (part ?? "");
  } catch {
    return "";
  }
}

const minutesOfOffset = (o: string) => {
  const m = /GMT([+-])(\d+)(?::(\d+))?/.exec(o);
  return m ? (m[1] === "-" ? -1 : 1) * (Number(m[2]) * 60 + Number(m[3] ?? 0)) : 0;
};

function allZones(): string[] {
  try {
    return Intl.supportedValuesOf("timeZone");
  } catch {
    return [IST, "Asia/Dubai", "Asia/Singapore", "Europe/London", "America/New_York", "UTC"];
  }
}

/**
 * The time zone the booking page shows: India Standard Time first (the owner's rule, D-042),
 * with every zone in a dropdown, and the visitor's own zone one click away.
 */
export function useTimeZone(initial: string = IST) {
  const browser = useSyncExternalStore(
    subscribe,
    () => Intl.DateTimeFormat().resolvedOptions().timeZone || IST,
    () => IST,
  );
  const [zone, setZone] = useState(initial);
  const options = useMemo(() => {
    const now = new Date();
    const zones = [...new Set([IST, browser, ...allZones()])].filter((z) => z !== "Asia/Calcutta");
    const rows = zones.map((z) => ({ z, off: offsetOf(z, now) }));
    rows.sort((a, b) =>
      a.z === IST
        ? -1
        : b.z === IST
          ? 1
          : minutesOfOffset(a.off) - minutesOfOffset(b.off) || a.z.localeCompare(b.z),
    );
    return rows.map(({ z, off }) => ({ value: z, label: `(${off}) ${zoneName(z)}` }));
  }, [browser]);
  const browserIsOther = browser !== zone && !(browser === "Asia/Calcutta" && zone === IST);
  return { zone, setZone, options, browser, browserIsOther };
}
export type TimeZoneState = ReturnType<typeof useTimeZone>;

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

/** "2026-11" → the grid of that month (Monday first), each cell a "YYYY-MM-DD" or null. */
function monthGrid(month: string): (string | null)[] {
  const [y, m] = month.split("-").map(Number);
  const first = new Date(Date.UTC(y, m - 1, 1));
  const lead = (first.getUTCDay() + 6) % 7;
  const days = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const cells: (string | null)[] = Array(lead).fill(null);
  for (let d = 1; d <= days; d++) cells.push(`${month}-${String(d).padStart(2, "0")}`);
  while (cells.length % 7) cells.push(null);
  return cells;
}

const monthLabel = (month: string) => {
  const [y, m] = month.split("-").map(Number);
  return new Intl.DateTimeFormat("en-GB", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(y, m - 1, 15)));
};

const longDate = (key: string) => {
  const [y, m, d] = key.split("-").map(Number);
  return new Intl.DateTimeFormat("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(y, m - 1, d)));
};

const WEEK = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

/** The time zone dropdown, with "Use my time zone" when the browser is elsewhere. */
export function TimeZonePicker({ tz }: { tz: TimeZoneState }) {
  return (
    <div className={styles.zoneBar}>
      <div className={styles.zoneSelect}>
        <SelectField
          label="Time zone"
          value={tz.zone}
          options={tz.options}
          onChange={(e) => tz.setZone(e.target.value)}
        />
      </div>
      {tz.browserIsOther && (
        <button type="button" className={styles.linkButton} onClick={() => tz.setZone(tz.browser)}>
          Use my time zone ({zoneName(tz.browser)})
        </button>
      )}
    </div>
  );
}

/**
 * Pick a day on a month calendar, then a time, in the chosen time zone (F22 round 2).
 * `slots` are the free start times from the server, as ISO strings.
 */
export function SlotPicker({
  slots,
  value,
  onChange,
  tz,
}: {
  slots: string[];
  value: string | null;
  onChange: (iso: string) => void;
  tz: TimeZoneState;
}) {
  const zone = tz.zone;
  const byDay = useMemo(() => {
    const map = new Map<string, Date[]>();
    for (const iso of slots) {
      const d = new Date(iso);
      const key = dayKey(d, zone);
      map.set(key, [...(map.get(key) ?? []), d]);
    }
    return map;
  }, [slots, zone]);
  const days = [...byDay.keys()].sort();
  const months = [...new Set(days.map((d) => d.slice(0, 7)))];
  const [picked, setPicked] = useState<string | null>(null);
  const day = picked && byDay.has(picked) ? picked : (days[0] ?? null);
  const [shownMonth, setShownMonth] = useState<string | null>(null);
  const month =
    shownMonth && months.includes(shownMonth) ? shownMonth : (day?.slice(0, 7) ?? months[0]);
  const times = day ? byDay.get(day)! : [];

  if (slots.length === 0) {
    return (
      <div className={styles.stack}>
        <TimeZonePicker tz={tz} />
        <p className={styles.emptySlots}>
          No free times right now. Please check again later, or reply to the message that brought
          you here.
        </p>
      </div>
    );
  }

  const mi = months.indexOf(month);
  return (
    <div className={styles.stack}>
      {/* The time zone first (D-047): India Standard Time unless they change it. */}
      <TimeZonePicker tz={tz} />
      <div className={styles.picker}>
        <div className={styles.monthBox}>
          <div className={styles.monthHead}>
            <button
              type="button"
              className={styles.iconButton}
              aria-label="Previous month"
              disabled={mi <= 0}
              onClick={() => setShownMonth(months[mi - 1])}
            >
              <ChevronLeft size={18} aria-hidden />
            </button>
            <h2 className={styles.monthTitle} aria-live="polite">
              {monthLabel(month)}
            </h2>
            <button
              type="button"
              className={styles.iconButton}
              aria-label="Next month"
              disabled={mi >= months.length - 1}
              onClick={() => setShownMonth(months[mi + 1])}
            >
              <ChevronRight size={18} aria-hidden />
            </button>
          </div>
          <div className={styles.monthGrid} role="group" aria-label="Days">
            {WEEK.map((w) => (
              <span key={w} className={styles.weekday} aria-hidden>
                {w}
              </span>
            ))}
            {monthGrid(month).map((key, i) => {
              if (!key) return <span key={`e${i}`} />;
              const free = byDay.get(key)?.length ?? 0;
              return (
                <button
                  key={key}
                  type="button"
                  className={styles.dateCell}
                  disabled={free === 0}
                  aria-pressed={key === day}
                  aria-label={`${longDate(key)}${free ? `, ${free} time${free === 1 ? "" : "s"} free` : ", no times"}`}
                  onClick={() => setPicked(key)}
                >
                  {Number(key.slice(8))}
                </button>
              );
            })}
          </div>
        </div>
        <div className={styles.timesBox}>
          <h2 className={styles.sectionTitle}>{day ? longDate(day) : "Times"}</h2>
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
    </div>
  );
}
