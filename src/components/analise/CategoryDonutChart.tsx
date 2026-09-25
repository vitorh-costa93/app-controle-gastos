"use client";

import { useMemo, useState } from "react";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from "recharts";
import { X } from "lucide-react";
import { Category, Person } from "@/types/db";
import { MonthlyOccurrence } from "@/types/domain";
import { formatCurrencyBRL } from "@/lib/utils/format";
import { cn } from "@/lib/utils/cn";

const OTHERS_KEY = "__others__";
const NO_CATEGORY_KEY = "__none__";

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
  occurrences,
  people,
}: {
  breakdown: { categoryId: string | null; amountCents: number; percent: number }[];
  categories: Category[];
  totalCents: number;
  /** Lançamentos do mês (já respeitando o filtro de pessoa) — base da lista ao clicar numa categoria. */
  occurrences: MonthlyOccurrence[];
  people: Person[];
}) {
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const categoriesById = new Map(categories.map((c) => [c.id, c.name]));
  const top = breakdown.slice(0, 7);
  const rest = breakdown.slice(7);
  const restTotal = rest.reduce((sum, r) => sum + r.amountCents, 0);

  const items = [
    ...top.map((b, i) => ({
      key: b.categoryId ?? NO_CATEGORY_KEY,
      name: b.categoryId ? categoriesById.get(b.categoryId) ?? "Outros" : "Sem categoria",
      value: b.amountCents,
      percent: b.percent,
      color: CHART_COLORS[i],
    })),
    ...(restTotal > 0
      ? [
          {
            key: OTHERS_KEY,
            name: "Outros",
            value: restTotal,
            percent: (restTotal / totalCents) * 100,
            color: "var(--chart-other)",
          },
        ]
      : []),
  ];

  const topCategoryKeys = useMemo(() => new Set(top.map((b) => b.categoryId ?? NO_CATEGORY_KEY)), [top]);
  const peopleById = useMemo(() => new Map(people.map((p) => [p.id, p.name])), [people]);

  // Mesma base do gráfico: saídas consideradas do mês, com as recorrências projetadas.
  const selectedItems = useMemo(() => {
    if (!selectedKey) return [];
    return occurrences
      .filter((o) => o.direction === "expense" && o.considered)
      .filter((o) => {
        const key = o.categoryId ?? NO_CATEGORY_KEY;
        return selectedKey === OTHERS_KEY ? !topCategoryKeys.has(key) : key === selectedKey;
      })
      .sort((a, b) => b.amountCents - a.amountCents);
  }, [occurrences, selectedKey, topCategoryKeys]);

  const selected = items.find((i) => i.key === selectedKey) ?? null;

  function toggle(key: string) {
    setSelectedKey((cur) => (cur === key ? null : key));
  }

  if (items.length === 0) return null;

  return (
    <div>
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
              {items.map((item) => (
                <Cell
                  key={item.key}
                  fill={item.color}
                  className="cursor-pointer outline-none"
                  opacity={selectedKey && selectedKey !== item.key ? 0.35 : 1}
                  onClick={() => toggle(item.key)}
                />
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
        {items.map((item) => (
          <li key={item.key}>
            <button
              type="button"
              onClick={() => toggle(item.key)}
              aria-pressed={selectedKey === item.key}
              className={cn(
                "flex w-full items-center justify-between rounded-md px-2 py-1 text-sm hover:bg-(--color-surface-secondary)",
                selectedKey === item.key && "bg-(--color-primary-soft) font-medium"
              )}
            >
              <span className="flex items-center gap-2">
                <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: item.color }} />
                <span className="text-(--color-text-primary)">{item.name}</span>
              </span>
              <span className="flex items-center gap-2 tabular-nums text-(--color-text-secondary)">
                <span className="text-(--color-text-tertiary)">{item.percent.toFixed(1)}%</span>
                {formatCurrencyBRL(item.value)}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </div>

    {selected && (
      <div className="mt-4 rounded-(--radius-lg) border border-(--color-border) bg-(--color-surface-secondary) p-4">
        <div className="mb-2 flex items-center justify-between">
          <span className="flex items-center gap-2 text-sm font-semibold">
            <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: selected.color }} />
            {selected.name}
            <span className="font-normal text-(--color-text-tertiary)">
              · {selectedItems.length} {selectedItems.length === 1 ? "lançamento" : "lançamentos"} ·{" "}
              {formatCurrencyBRL(selected.value)}
            </span>
          </span>
          <button
            type="button"
            aria-label="Fechar lista"
            onClick={() => setSelectedKey(null)}
            className="text-(--color-text-tertiary) hover:text-(--color-text-primary)"
          >
            <X size={16} />
          </button>
        </div>
        <ul className="divide-y divide-(--color-border)">
          {selectedItems.map((o) => (
            <li key={o.id} className="flex items-center justify-between gap-3 py-2 text-sm">
              <span className="min-w-0">
                <span className="block truncate">{o.description ?? "Sem descrição"}</span>
                <span className="block text-xs text-(--color-text-tertiary)">
                  {o.fixedVariable === "fixed" ? "Fixo" : "Variável"} · {peopleById.get(o.personId) ?? "—"}
                  {o.installmentTotal > 1 ? ` · parcela ${o.installmentCurrent}/${o.installmentTotal}` : ""}
                </span>
              </span>
              <span className="shrink-0 font-medium tabular-nums">{formatCurrencyBRL(o.amountCents)}</span>
            </li>
          ))}
        </ul>
      </div>
    )}
    </div>
  );
}
