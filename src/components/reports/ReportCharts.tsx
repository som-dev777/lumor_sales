"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  LabelList,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import styles from "./reports.module.scss";

const SERIES = [
  { key: "outreach", name: "New outreach", color: "var(--color-series-1)" },
  { key: "replied", name: "Replied", color: "var(--color-series-2)" },
  { key: "meetings", name: "Meetings booked", color: "var(--color-series-3)" },
] as const;

type RepRow = { name: string; outreach: number; replied: number; meetings: number };

/** New outreach, replies and meetings per rep (D-043). The table below has the same numbers. */
export function OutreachChart({ data }: { data: RepRow[] }) {
  return (
    <div
      className={styles.chart}
      role="img"
      aria-label="New outreach, replies and meetings per rep"
    >
      <ResponsiveContainer width="100%" height={260}>
        <BarChart data={data} margin={{ top: 20, right: 8, bottom: 4, left: 0 }} barGap={2}>
          <CartesianGrid vertical={false} stroke="var(--color-border)" />
          <XAxis
            dataKey="name"
            tickLine={false}
            axisLine={{ stroke: "var(--color-border)" }}
            tick={{ fill: "var(--color-text-secondary)", fontSize: 12 }}
          />
          <YAxis
            allowDecimals={false}
            tickLine={false}
            axisLine={false}
            width={32}
            tick={{ fill: "var(--color-text-secondary)", fontSize: 12 }}
          />
          <Tooltip cursor={{ fill: "var(--color-primary-soft)" }} />
          <Legend wrapperStyle={{ fontSize: 13 }} />
          {SERIES.map((s) => (
            <Bar
              key={s.key}
              dataKey={s.key}
              name={s.name}
              fill={s.color}
              radius={[4, 4, 0, 0]}
              maxBarSize={28}
              isAnimationActive={false}
            >
              <LabelList dataKey={s.key} position="top" fill="var(--color-text)" fontSize={11} />
            </Bar>
          ))}
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

/** Where everyone's people stand now, by stage (one series). */
export function StageChart({ data }: { data: { stage: string; count: number }[] }) {
  return (
    <div className={styles.chart} role="img" aria-label="People by stage">
      <ResponsiveContainer width="100%" height={data.length * 34 + 16}>
        <BarChart data={data} layout="vertical" margin={{ top: 4, right: 40, bottom: 4, left: 0 }}>
          <CartesianGrid horizontal={false} stroke="var(--color-border)" />
          <XAxis type="number" allowDecimals={false} hide />
          <YAxis
            type="category"
            dataKey="stage"
            width={130}
            tickLine={false}
            axisLine={false}
            tick={{ fill: "var(--color-text-secondary)", fontSize: 12 }}
          />
          <Tooltip cursor={{ fill: "var(--color-primary-soft)" }} />
          <Bar
            dataKey="count"
            name="People"
            fill="var(--color-series-1)"
            radius={[0, 4, 4, 0]}
            minPointSize={2}
            isAnimationActive={false}
          >
            <LabelList dataKey="count" position="right" fill="var(--color-text)" fontSize={12} />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
