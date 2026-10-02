"use client";

import { useMemo, useState, useTransition } from "react";
import { ChevronDown } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from "recharts";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Category, Person } from "@/types/db";
import { MonthlyOccurrence } from "@/types/domain";
import { cn } from "@/lib/utils/cn";
import { MonthUnplanned } from "@/lib/domain/insights";
import { setUnplannedMarks } from "@/lib/data/unplanned";
import { formatCurrencyBRL, formatDateBR, formatMonthShort, formatMonthLabel } from "@/lib/utils/format";

const NONE_KEY = "__none__";

const pct = (part: number, total: number) => (total > 0 ? (part / total) * 100 : 0);
const fmtPct = (v: number) => `${v.toFixed(1).replace(".", ",")}%`;

/** Dinheiro gasto que não estava no planejamento: nem parcelado, nem fixo/recorrente, nem custo essencial. */
export function UnplannedCard({
  months,
  byCategory,
  categories,
  occurrences,
  people,
  onSaved,
}: {
  months: MonthUnplanned[];
  byCategory: { categoryId: string | null; amountCents: number; percent: number }[];
  categories: Category[];
  /** Candidatos a "fora do planejado" no mês selecionado, inclusive os que você já marcou como planejados. */
  occurrences: MonthlyOccurrence[];
  people: Person[];
  /** Recarrega a Análise depois de salvar as marcações. */
  onSaved: () => Promise<void> | void;
}) {
  const [openKey, setOpenKey] = useState<string | null>(null);
  const [showExcluded, setShowExcluded] = useState(false);
  // id -> excluído? Só guarda o que difere do que está salvo.
  const [marks, setMarks] = useState<Record<string, boolean>>({});
  const [error, setError] = useState<string | null>(null);
  const [isSaving, startSaving] = useTransition();
  const peopleById = useMemo(() => new Map(people.map((p) => [p.id, p.name])), [people]);
  const categoriesById = new Map(categories.map((c) => [c.id, c.name]));
  const current = months[months.length - 1];
  const previous = months.length > 1 ? months[months.length - 2] : null;
  const data = months.slice(-6).map((m) => ({ ...m, label: formatMonthShort(m.referenceMonth) }));
  const delta = previous ? current.unplannedCents - previous.unplannedCents : null;
  const top = byCategory.slice(0, 5);
  const maxCents = top[0]?.amountCents ?? 0;

  const savedExcluded = (o: MonthlyOccurrence) => Boolean(o.unplannedExcluded);
  const isExcluded = (o: MonthlyOccurrence) => marks[o.id] ?? savedExcluded(o);
  const dirtyIds = Object.keys(marks);
  // Efeito das marcações pendentes no total do mês, antes de salvar.
  const pendingDeltaCents = occurrences.reduce(
    (sum, o) => (o.id in marks ? sum + (marks[o.id] ? -o.amountCents : o.amountCents) : sum),
    0
  );

  function toggle(o: MonthlyOccurrence) {
    const next = !isExcluded(o);
    setMarks((prev) => {
      const copy = { ...prev };
      if (next === savedExcluded(o)) delete copy[o.id];
      else copy[o.id] = next;
      return copy;
    });
  }

  function save() {
    setError(null);
    startSaving(async () => {
      const result = await setUnplannedMarks(dirtyIds.map((id) => ({ id, excluded: marks[id] })));
      if (!result.ok) {
        setError(result.error);
        return;
      }
      await onSaved();
      setMarks({});
    });
  }

  const renderItem = (o: MonthlyOccurrence) => {
    const excluded = isExcluded(o);
    return (
      <li key={o.id} className="flex items-center justify-between gap-3 py-2 text-sm">
        <span className={cn("min-w-0", excluded && "opacity-50")}>
          <span className="block truncate">{o.description ?? "Sem descrição"}</span>
          <span className="block text-xs text-(--color-text-tertiary)">
            {formatDateBR(o.registrationDate)} · {peopleById.get(o.personId) ?? "—"}
          </span>
        </span>
        <span className="flex shrink-0 items-center gap-3">
          <span className={cn("font-medium tabular-nums", excluded && "line-through opacity-50")}>
            {formatCurrencyBRL(o.amountCents)}
          </span>
          <label className="flex cursor-pointer items-center gap-1.5 text-xs text-(--color-text-secondary)">
            <input
              type="checkbox"
              role="switch"
              checked={!excluded}
              onChange={() => toggle(o)}
              aria-label={`Foi fora do planejado: ${o.description ?? "lançamento"}`}
              className="h-4 w-4 accent-(--color-primary)"
            />
            Fora do planejado
          </label>
        </span>
      </li>
    );
  };

  const excludedItems = occurrences
    .filter(savedExcluded)
    .sort((a, b) => b.amountCents - a.amountCents);

  return (
    <Card className="p-5">
      <h3 className="mb-1 text-[15px] font-semibold">Fora do planejado</h3>
      <p className="mb-4 text-xs text-(--color-text-tertiary)">
        Gastos do mês que não são parcelas, fixos nem custos essenciais (imposto, supermercado, combustível e Wellhub) — o que você decidiu gastar no dia a dia.
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
          {top.map((c) => {
            const key = c.categoryId ?? NONE_KEY;
            const open = openKey === key;
            return (
              <li key={key} className="text-sm">
                <button
                  type="button"
                  aria-expanded={open}
                  onClick={() => setOpenKey((cur) => (cur === key ? null : key))}
                  className="-mx-2 block w-[calc(100%+1rem)] rounded-md px-2 py-1 text-left hover:bg-(--color-surface-secondary)"
                >
                  <div className="flex items-center justify-between">
                    <span className="flex items-center gap-1.5">
                      <ChevronDown
                        size={14}
                        className={cn("text-(--color-text-tertiary) transition-transform", !open && "-rotate-90")}
                      />
                      {c.categoryId ? categoriesById.get(c.categoryId) ?? "Categoria removida" : "Sem categoria"}
                    </span>
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
                </button>
                {open && (
                  <ul className="mt-1.5 divide-y divide-(--color-border) rounded-(--radius-md) bg-(--color-surface-secondary) px-3">
                    {occurrences
                      .filter((o) => !savedExcluded(o) && (o.categoryId ?? NONE_KEY) === key)
                      .sort((a, b) => b.amountCents - a.amountCents)
                      .map(renderItem)}
                  </ul>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {excludedItems.length > 0 && (
        <div className="mt-4 border-t border-(--color-border) pt-3">
          <button
            type="button"
            aria-expanded={showExcluded}
            onClick={() => setShowExcluded((v) => !v)}
            className="flex items-center gap-1.5 text-xs font-medium text-(--color-text-secondary) hover:text-(--color-text-primary)"
          >
            <ChevronDown size={14} className={cn("transition-transform", !showExcluded && "-rotate-90")} />
            Marcados como planejados ({excludedItems.length})
          </button>
          {showExcluded && (
            <ul className="mt-1.5 divide-y divide-(--color-border) rounded-(--radius-md) bg-(--color-surface-secondary) px-3">
              {excludedItems.map(renderItem)}
            </ul>
          )}
        </div>
      )}

      {dirtyIds.length > 0 && (
        <div className="mt-4 rounded-(--radius-md) border border-(--color-border) bg-(--color-primary-soft)/50 p-3">
          <p className="text-xs text-(--color-text-secondary)">
            {dirtyIds.length} {dirtyIds.length === 1 ? "alteração não salva" : "alterações não salvas"} · novo total do mês:{" "}
            <b className="tabular-nums text-(--color-text-primary)">
              {formatCurrencyBRL(current.unplannedCents + pendingDeltaCents)}
            </b>
          </p>
          {error && <p className="mt-1 text-xs text-(--color-negative)">{error}</p>}
          <div className="mt-2 flex justify-end gap-2">
            <Button variant="secondary" size="sm" onClick={() => setMarks({})} disabled={isSaving} type="button">
              Descartar
            </Button>
            <Button size="sm" onClick={save} disabled={isSaving} type="button">
              {isSaving ? "Salvando..." : "Salvar"}
            </Button>
          </div>
        </div>
      )}
    </Card>
  );
}
