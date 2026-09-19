"use client";

import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from "recharts";
import { Category } from "@/types/db";
import { formatCurrencyBRL } from "@/lib/utils/format";

const CHART_COLORS = [
  "var(--chart-1)",
  "var(--chart-2)",
  "var(--chart-3)",
  "var(--chart-4)",
  "var(--chart-5)",
  "var(--chart-6)",
  "var(--chart-7)",
  "var(--chart-8)",
];

export function CategoryDonutChart({
  breakdown,
  categories,
  totalCents,
}: {
  breakdown: { categoryId: string | null; amountCents: number; percent: number }[];
  categories: Category[];
  totalCents: number;
}) {
  const categoriesById = new Map(categories.map((c) => [c.id, c.name]));
  const top = breakdown.slice(0, 7);
  const rest = breakdown.slice(7);
  const restTotal = rest.reduce((sum, r) => sum + r.amountCents, 0);

  const items = [
    ...top.map((b, i) => ({
      name: b.categoryId ? categoriesById.get(b.categoryId) ?? "Outros" : "Sem categoria",
      value: b.amountCents,
      percent: b.percent,
      color: CHART_COLORS[i],
    })),
    ...(restTotal > 0
      ? [
          {
            name: "Outros",
            value: restTotal,
            percent: (restTotal / totalCents) * 100,
            color: "var(--chart-other)",
          },
        ]
      : []),
  ];

  if (items.length === 0) return null;

  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
      <div className="relative mx-auto h-44 w-44 shrink-0">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={items}
              dataKey="value"
              nameKey="name"
              innerRadius={54}
              outerRadius={80}
              paddingAngle={2}
              stroke="var(--color-surface)"
              strokeWidth={2}
            >
              {items.map((item, i) => (
                <Cell key={i} fill={item.color} />
              ))}
            </Pie>
            <Tooltip
              formatter={(value, name) => [formatCurrencyBRL(Number(value)), String(name)]}
              contentStyle={{
                borderRadius: 12,
                border: "1px solid var(--color-border)",
                fontSize: 13,
              }}
            />
          </PieChart>
        </ResponsiveContainer>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-xs text-(--color-text-tertiary)">Total de saídas</span>
          <span className="text-[15px] font-semibold tabular-nums">{formatCurrencyBRL(totalCents)}</span>
        </div>
      </div>

      <ul className="flex-1 space-y-2">
        {items.map((item, i) => (
          <li key={i} className="flex items-center justify-between text-sm">
            <span className="flex items-center gap-2">
              <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: item.color }} />
              <span className="text-(--color-text-primary)">{item.name}</span>
            </span>
            <span className="flex items-center gap-2 tabular-nums text-(--color-text-secondary)">
              <span className="text-(--color-text-tertiary)">{item.percent.toFixed(1)}%</span>
              {formatCurrencyBRL(item.value)}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
