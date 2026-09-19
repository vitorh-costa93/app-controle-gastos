"use client";

import { useState } from "react";
import { Category, TransactionType, Person } from "@/types/db";
import { formatCurrencyBRL } from "@/lib/utils/format";
import { cn } from "@/lib/utils/cn";

type Dimension = "category" | "type" | "person";

export function ComparativeBars({
  categoryBreakdown,
  typeBreakdown,
  personBreakdown,
  categories,
  types,
  people,
}: {
  categoryBreakdown: { categoryId: string | null; amountCents: number; percent: number }[];
  typeBreakdown: { key: string | null; amountCents: number; percent: number }[];
  personBreakdown: { key: string | null; amountCents: number; percent: number }[];
  categories: Category[];
  types: TransactionType[];
  people: Person[];
}) {
  const [dimension, setDimension] = useState<Dimension>("category");

  const categoriesById = new Map(categories.map((c) => [c.id, c.name]));
  const typesById = new Map(types.map((t) => [t.id, t.name]));
  const peopleById = new Map(people.map((p) => [p.id, p.name]));

  const items =
    dimension === "category"
      ? categoryBreakdown.map((b) => ({
          label: b.categoryId ? categoriesById.get(b.categoryId) ?? "Outros" : "Sem categoria",
          amountCents: b.amountCents,
          percent: b.percent,
        }))
      : dimension === "type"
        ? typeBreakdown.map((b) => ({
            label: b.key ? typesById.get(b.key) ?? "Outros" : "Sem tipo",
            amountCents: b.amountCents,
            percent: b.percent,
          }))
        : personBreakdown.map((b) => ({
            label: b.key ? peopleById.get(b.key) ?? "—" : "—",
            amountCents: b.amountCents,
            percent: b.percent,
          }));

  const max = Math.max(...items.map((i) => i.amountCents), 1);

  return (
    <div>
      <div className="mb-4 inline-flex rounded-(--radius-md) bg-black/5 p-1">
        {(
          [
            ["category", "Categoria"],
            ["type", "Tipo"],
            ["person", "Origem"],
          ] as const
        ).map(([value, label]) => (
          <button
            key={value}
            onClick={() => setDimension(value)}
            className={cn(
              "rounded-(--radius-sm) px-3 py-1.5 text-sm font-medium transition-colors",
              dimension === value
                ? "bg-(--color-surface) text-(--color-text-primary) shadow-(--shadow-sm)"
                : "text-(--color-text-secondary)"
            )}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="space-y-3">
        {items.map((item, i) => (
          <div key={i}>
            <div className="mb-1 flex items-center justify-between text-sm">
              <span className="text-(--color-text-primary)">{item.label}</span>
              <span className="tabular-nums text-(--color-text-secondary)">
                {formatCurrencyBRL(item.amountCents)}
              </span>
            </div>
            <div className="h-2 w-full overflow-hidden rounded-full bg-black/5">
              <div
                className="h-full rounded-full bg-(--color-primary)"
                style={{ width: `${(item.amountCents / max) * 100}%` }}
              />
            </div>
          </div>
        ))}
        {items.length === 0 && (
          <p className="text-sm text-(--color-text-tertiary)">Sem dados suficientes neste mês.</p>
        )}
      </div>
    </div>
  );
}
