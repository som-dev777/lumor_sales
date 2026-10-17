"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  LabelList,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import styles from "./dashboard.module.scss";

type Props = { data: { label: string; count: number }[] };

/** The period's funnel: one bar per stage with its count (F11). One series, one hue. */
export function FunnelChart({ data }: Props) {
  return (
    <div className={styles.chart}>
      <ResponsiveContainer width="100%" height={data.length * 40 + 16}>
        <BarChart
          data={data}
          layout="vertical"
          margin={{ top: 4, right: 40, bottom: 4, left: 0 }}
          barCategoryGap={8}
        >
          <CartesianGrid horizontal={false} stroke="var(--color-border)" />
          <XAxis type="number" allowDecimals={false} hide />
          <YAxis
            type="category"
            dataKey="label"
            width={110}
            tickLine={false}
            axisLine={false}
            tick={{ fill: "var(--color-text-secondary)", fontSize: 13 }}
          />
          <Tooltip
            cursor={{ fill: "var(--color-primary-soft)" }}
            content={({ active, payload }) =>
              active && payload?.[0] ? (
                <div className={styles.tooltip}>
                  <strong>{String(payload[0].payload.label)}</strong>
                  <span>{String(payload[0].value)}</span>
                </div>
              ) : null
            }
          />
          <Bar
            dataKey="count"
            fill="var(--color-primary)"
            radius={[0, 4, 4, 0]}
            minPointSize={2}
            isAnimationActive={false}
          >
            <LabelList dataKey="count" position="right" fill="var(--color-text)" fontSize={13} />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
