"use client";

import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from "recharts";
import type { NavPoint } from "@/lib/types";

export function NavChart({
  data,
  height = 200,
  color,
}: {
  data: NavPoint[];
  height?: number;
  color?: string;
}) {
  if (!data?.length) {
    return (
      <div
        className="flex items-center justify-center text-xs text-[var(--muted)]"
        style={{ height }}
      >
        暂无走势数据
      </div>
    );
  }

  const values = data.map((d) => d.close || d.nav || 0);
  const first = values[0] || 0;
  const last = values[values.length - 1] || 0;
  const up = last >= first;
  const stroke = color || (up ? "#ff5c6c" : "#22c55e");
  const fill = up ? "rgba(255,92,108,0.18)" : "rgba(34,197,94,0.15)";

  const chartData = data.map((d) => ({
    date: d.date?.slice(5) || d.date,
    fullDate: d.date,
    value: Number((d.close || d.nav || 0).toFixed(4)),
    pct: d.changePercent,
  }));

  return (
    <div style={{ width: "100%", height }}>
      <ResponsiveContainer>
        <AreaChart data={chartData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id={`navFill-${stroke}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={stroke} stopOpacity={0.35} />
              <stop offset="100%" stopColor={stroke} stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <CartesianGrid stroke="rgba(148,163,184,0.08)" vertical={false} />
          <XAxis
            dataKey="date"
            tick={{ fill: "#93a4c3", fontSize: 10 }}
            axisLine={false}
            tickLine={false}
            minTickGap={24}
          />
          <YAxis
            domain={["auto", "auto"]}
            tick={{ fill: "#93a4c3", fontSize: 10 }}
            axisLine={false}
            tickLine={false}
            width={48}
            tickFormatter={(v) => Number(v).toFixed(2)}
          />
          <Tooltip
            contentStyle={{
              background: "#0e1626",
              border: "1px solid rgba(148,163,184,0.2)",
              borderRadius: 10,
              fontSize: 12,
            }}
            labelStyle={{ color: "#93a4c3" }}
            formatter={(value: number | string) => [
              Number(value).toFixed(4),
              "净值/收盘",
            ]}
            labelFormatter={(_, payload) =>
              payload?.[0]?.payload?.fullDate || ""
            }
          />
          <Area
            type="monotone"
            dataKey="value"
            stroke={stroke}
            fill={fill.startsWith("rgba") ? `url(#navFill-${stroke})` : fill}
            strokeWidth={2}
            dot={false}
            isAnimationActive={false}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
