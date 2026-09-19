"use client";

import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from "recharts";
import { MonthSummary } from "@/types/domain";
import { formatCurrencyBRL, formatMonthShort, formatMonthLabel } from "@/lib/utils/format";

export function MonthlyEvolutionChart({
  summaries,
  selectedMonth,
}: {
  summaries: MonthSummary[];
  selectedMonth: string;
}) {
  const data = summaries.map((s) => ({
    ...s,
    label: formatMonthShort(s.referenceMonth),
  }));

  return (
    <div className="h-56 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <XAxis
            dataKey="label"
            axisLine={false}
            tickLine={false}
            tick={{ fontSize: 11, fill: "var(--color-text-tertiary)" }}
          />
          <YAxis hide />
          <Tooltip
            cursor={{ fill: "rgba(0,0,0,0.03)" }}
            content={({ active, payload }) => {
              if (!active || !payload?.length) return null;
              const d = payload[0].payload as MonthSummary;
              return (
                <div className="rounded-(--radius-md) border border-(--color-border) bg-(--color-surface) px-3 py-2 text-xs shadow-(--shadow-md)">
                  <p className="mb-1 font-medium">{formatMonthLabel(d.referenceMonth)}</p>
                  <p className="text-(--color-positive)">Entradas: {formatCurrencyBRL(d.incomeCents)}</p>
                  <p className="text-(--color-negative)">Saídas: {formatCurrencyBRL(d.expenseCents)}</p>
                  <p className="mt-1 font-medium">Sobra: {formatCurrencyBRL(d.leftoverCents)}</p>
                </div>
              );
            }}
          />
          <Bar dataKey="leftoverCents" radius={[4, 4, 4, 4]} maxBarSize={22}>
            {data.map((d) => (
              <Cell
                key={d.referenceMonth}
                fill={d.referenceMonth === selectedMonth ? "var(--chart-1)" : "#d1d1d6"}
              />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
