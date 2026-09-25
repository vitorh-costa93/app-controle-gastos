"use client";

import { ComposedChart, Bar, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from "recharts";
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
    savingsRate: s.incomeCents > 0 ? (s.leftoverCents / s.incomeCents) * 100 : null,
  }));

  return (
    <div className="h-56 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <XAxis
            dataKey="label"
            axisLine={false}
            tickLine={false}
            tick={{ fontSize: 11, fill: "var(--color-text-tertiary)" }}
          />
          <YAxis yAxisId="amount" hide />
          <YAxis yAxisId="rate" orientation="right" hide domain={[-10, 100]} />
          <Tooltip
            cursor={{ fill: "rgba(0,0,0,0.03)" }}
            content={({ active, payload }) => {
              if (!active || !payload?.length) return null;
              const d = payload[0].payload as MonthSummary & { savingsRate: number | null };
              return (
                <div className="rounded-(--radius-md) border border-(--color-border) bg-(--color-surface) px-3 py-2 text-xs shadow-(--shadow-md)">
                  <p className="mb-1 font-medium">{formatMonthLabel(d.referenceMonth)}</p>
                  <p className="text-(--color-positive)">Entradas: {formatCurrencyBRL(d.incomeCents)}</p>
                  <p className="text-(--color-negative)">Saídas: {formatCurrencyBRL(d.expenseCents)}</p>
                  <p className="mt-1 font-medium">Sobra: {formatCurrencyBRL(d.leftoverCents)}</p>
                  {d.savingsRate !== null && (
                    <p className="text-(--color-text-secondary)">Poupança: {d.savingsRate.toFixed(1).replace(".", ",")}%</p>
                  )}
                </div>
              );
            }}
          />
          <Bar yAxisId="amount" dataKey="leftoverCents" radius={[4, 4, 4, 4]} maxBarSize={22}>
            {data.map((d) => (
              <Cell
                key={d.referenceMonth}
                fill={d.referenceMonth === selectedMonth ? "var(--chart-1)" : "#d1d1d6"}
              />
            ))}
          </Bar>
          <Line
            yAxisId="rate"
            type="monotone"
            dataKey="savingsRate"
            stroke="var(--chart-2)"
            strokeWidth={2}
            dot={{ r: 2.5, fill: "var(--chart-2)", strokeWidth: 0 }}
            connectNulls
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
