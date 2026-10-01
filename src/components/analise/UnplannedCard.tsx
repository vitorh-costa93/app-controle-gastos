"use client";

import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from "recharts";
import { Card } from "@/components/ui/Card";
import { Category } from "@/types/db";
import { MonthUnplanned } from "@/lib/domain/insights";
import { formatCurrencyBRL, formatMonthShort, formatMonthLabel } from "@/lib/utils/format";

const pct = (part: number, total: number) => (total > 0 ? (part / total) * 100 : 0);
const fmtPct = (v: number) => `${v.toFixed(1).replace(".", ",")}%`;

/** Dinheiro gasto que não estava no planejamento: nem parcelado, nem fixo/recorrente. */
export function UnplannedCard({
  months,
  byCategory,
  categories,
}: {
  months: MonthUnplanned[];
  byCategory: { categoryId: string | null; amountCents: number; percent: number }[];
  categories: Category[];
}) {
  const categoriesById = new Map(categories.map((c) => [c.id, c.name]));
  const current = months[months.length - 1];
  const previous = months.length > 1 ? months[months.length - 2] : null;
  const data = months.slice(-6).map((m) => ({ ...m, label: formatMonthShort(m.referenceMonth) }));
  const delta = previous ? current.unplannedCents - previous.unplannedCents : null;
  const top = byCategory.slice(0, 5);
  const maxCents = top[0]?.amountCents ?? 0;

  return (
    <Card className="p-5">
      <h3 className="mb-1 text-[15px] font-semibold">Fora do planejado</h3>
      <p className="mb-4 text-xs text-(--color-text-tertiary)">
        Gastos do mês que não são parcelas nem fixos — o que você decidiu gastar no dia a dia.
      </p>

      <div className="mb-3 flex items-baseline gap-2">
        <span className="text-xl font-semibold tabular-nums">{formatCurrencyBRL(current.unplannedCents)}</span>
        <span className="text-xs text-(--color-text-tertiary)">
          {fmtPct(pct(current.unplannedCents, current.expenseCents))} das saídas ·{" "}
          {fmtPct(pct(current.unplannedCents, current.incomeCents))} da renda
        </span>
      </div>
      {delta !== null && delta !== 0 && (
        <p className="mb-3 text-xs text-(--color-text-secondary)">
          {delta > 0 ? "▲" : "▼"} {formatCurrencyBRL(Math.abs(delta))} {delta > 0 ? "a mais" : "a menos"} que em{" "}
          {formatMonthShort(previous!.referenceMonth)}
        </p>
      )}

      <div className="h-32 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 4, right: 8, left: 8, bottom: 0 }}>
            <XAxis
              dataKey="label"
              axisLine={false}
              tickLine={false}
              tick={{ fontSize: 11, fill: "var(--color-text-tertiary)" }}
            />
            <YAxis hide domain={[0, "dataMax"]} />
            <Tooltip
              cursor={{ fill: "rgba(0,0,0,0.03)" }}
              content={({ active, payload }) => {
                if (!active || !payload?.length) return null;
                const d = payload[0].payload as (typeof data)[number];
                return (
                  <div className="rounded-(--radius-md) border border-(--color-border) bg-(--color-surface) px-3 py-2 text-xs shadow-(--shadow-md)">
                    <p className="mb-1 font-medium">{formatMonthLabel(d.referenceMonth)}</p>
                    <p>Fora do planejado: {formatCurrencyBRL(d.unplannedCents)}</p>
                    <p className="text-(--color-text-tertiary)">Saídas totais: {formatCurrencyBRL(d.expenseCents)}</p>
                  </div>
                );
              }}
            />
            <Bar dataKey="unplannedCents" radius={[4, 4, 0, 0]} maxBarSize={36}>
              {data.map((d) => (
                <Cell
                  key={d.referenceMonth}
                  fill="var(--chart-2)"
                  opacity={d.referenceMonth === current.referenceMonth ? 1 : 0.45}
                />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      <h4 className="mb-2 mt-4 text-xs font-semibold uppercase tracking-wide text-(--color-text-tertiary)">
        Onde mais pesou neste mês
      </h4>
      {top.length === 0 ? (
        <p className="text-sm text-(--color-text-tertiary)">Nenhum gasto fora do planejado neste mês.</p>
      ) : (
        <ul className="space-y-2.5">
          {top.map((c) => (
            <li key={c.categoryId ?? "none"} className="text-sm">
              <div className="flex items-center justify-between">
                <span>{c.categoryId ? categoriesById.get(c.categoryId) ?? "Categoria removida" : "Sem categoria"}</span>
                <span className="tabular-nums">
                  <span className="font-medium">{formatCurrencyBRL(c.amountCents)}</span>
                  <span className="ml-2 text-(--color-text-tertiary)">{fmtPct(c.percent)}</span>
                </span>
              </div>
              <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-(--color-surface-secondary)">
                <div
                  className="h-full rounded-full"
                  style={{ width: `${pct(c.amountCents, maxCents)}%`, backgroundColor: "var(--chart-2)" }}
                />
              </div>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
