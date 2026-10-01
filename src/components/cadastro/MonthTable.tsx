"use client";

import { useState, useTransition } from "react";
import { Pencil, Trash2 } from "lucide-react";
import { Person, Category, TransactionType } from "@/types/db";
import { MonthRow, MonthRowKind } from "@/lib/domain/month-rows";
import { Toggle } from "@/components/ui/Toggle";
import { Badge } from "@/components/ui/Badge";
import { formatCurrencyBRL, formatDateTimeBR, formatReferenceMonthShort } from "@/lib/utils/format";
import { setTransactionConsidered, deleteTransaction } from "@/lib/data/transactions";

const KIND_LABEL: Record<MonthRowKind, string> = {
  pontual: "Pontual",
  recorrente: "Recorrente",
  parcelado: "Parcelado",
};

/** Todas as entradas e saídas de um mês — inclusive recorrentes e parcelas cadastradas em outros meses. */
export function MonthTable({
  rows,
  people,
  categories,
  types,
  onEdit,
}: {
  rows: MonthRow[];
  people: Person[];
  categories: Category[];
  types: TransactionType[];
  onEdit: (row: MonthRow) => void;
}) {
  const peopleById = new Map(people.map((p) => [p.id, p]));
  const categoriesById = new Map(categories.map((c) => [c.id, c]));
  const typesById = new Map(types.map((t) => [t.id, t]));

  return (
    <div className="overflow-hidden rounded-(--radius-lg) border border-(--color-border) bg-(--color-surface)">
      <div className="hidden overflow-x-auto md:block">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-(--color-border) text-left text-xs text-(--color-text-tertiary)">
              <th className="px-4 py-3 font-medium">Criado em</th>
              <th className="px-4 py-3 font-medium">Mês ref.</th>
              <th className="px-4 py-3 font-medium">Origem</th>
              <th className="px-4 py-3 font-medium">Descrição</th>
              <th className="px-4 py-3 font-medium">Categoria</th>
              <th className="px-4 py-3 font-medium">Natureza</th>
              <th className="px-4 py-3 font-medium">Parcela</th>
              <th className="px-4 py-3 text-right font-medium">Valor</th>
              <th className="px-4 py-3 text-center font-medium">Considerar</th>
              <th className="w-20 px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <MonthRowItem
                key={row.key}
                row={row}
                person={peopleById.get(row.occurrence.personId)}
                categoryName={row.occurrence.categoryId ? categoriesById.get(row.occurrence.categoryId)?.name : undefined}
                typeName={row.occurrence.typeId ? typesById.get(row.occurrence.typeId)?.name : undefined}
                onEdit={() => onEdit(row)}
              />
            ))}
          </tbody>
        </table>
      </div>

      <div className="divide-y divide-(--color-border) md:hidden">
        {rows.map((row) => {
          const o = row.occurrence;
          return (
            <div key={row.key} className="flex items-center justify-between gap-2 px-4 py-3">
              <div className="flex min-w-0 flex-col gap-0.5">
                <span className="truncate text-sm font-medium">
                  {o.description ?? (o.categoryId ? categoriesById.get(o.categoryId)?.name : null) ?? "—"}
                </span>
                <span className="text-xs text-(--color-text-tertiary)">
                  {KIND_LABEL[row.kind]} · {peopleById.get(o.personId)?.name ?? "—"}
                  {o.installmentTotal > 1 ? ` · ${o.installmentCurrent}/${o.installmentTotal}` : ""}
                </span>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <span
                  className={
                    "text-sm font-semibold tabular-nums " +
                    (o.direction === "income" ? "text-(--color-positive)" : "text-(--color-text-primary)")
                  }
                >
                  {formatCurrencyBRL(o.amountCents)}
                </span>
                <button
                  className="rounded-full p-1.5 text-(--color-text-secondary) hover:bg-black/5"
                  aria-label="Editar lançamento"
                  onClick={() => onEdit(row)}
                >
                  <Pencil size={16} />
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function MonthRowItem({
  row,
  person,
  categoryName,
  typeName,
  onEdit,
}: {
  row: MonthRow;
  person?: Person;
  categoryName?: string;
  typeName?: string;
  onEdit: () => void;
}) {
  const { transaction, occurrence: o } = row;
  const [considered, setConsidered] = useState(o.considered);
  const [isPending, startTransition] = useTransition();

  return (
    <tr className="group border-b border-(--color-border) last:border-0 hover:bg-black/[0.015]">
      <td className="px-4 py-3 whitespace-nowrap text-(--color-text-primary)">
        {transaction ? formatDateTimeBR(transaction.createdAt) : <span className="text-(--color-text-tertiary)">—</span>}
      </td>
      <td className="px-4 py-3 text-(--color-text-secondary)">{formatReferenceMonthShort(o.referenceMonth)}</td>
      <td className="px-4 py-3">
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full" style={{ backgroundColor: person?.color ?? "#8e8e93" }} />
          {person?.name ?? "—"}
        </span>
      </td>
      <td className="max-w-56 truncate px-4 py-3" title={typeName ? `${o.description ?? ""} · ${typeName}` : undefined}>
        {o.description ?? "—"}
      </td>
      <td className="px-4 py-3 text-(--color-text-secondary)">{categoryName ?? "—"}</td>
      <td className="px-4 py-3">
        <Badge tone={row.kind === "pontual" ? "neutral" : "info"}>{KIND_LABEL[row.kind]}</Badge>
      </td>
      <td className="px-4 py-3 text-(--color-text-secondary)">
        {o.installmentCurrent}/{o.installmentTotal}
      </td>
      <td className="px-4 py-3 text-right font-medium tabular-nums">
        <span className={o.direction === "income" ? "text-(--color-positive)" : "text-(--color-text-primary)"}>
          {formatCurrencyBRL(o.amountCents)}
        </span>
      </td>
      <td className="px-4 py-3 text-center">
        {transaction ? (
          <Toggle
            checked={considered}
            disabled={isPending}
            ariaLabel="Considerar lançamento"
            onChange={(value) => {
              setConsidered(value);
              startTransition(async () => {
                const result = await setTransactionConsidered(transaction.id, value);
                if (!result.ok) setConsidered(!value);
              });
            }}
          />
        ) : (
          <span className="text-(--color-text-tertiary)">—</span>
        )}
      </td>
      <td className="px-2 py-3">
        <div className="flex items-center justify-end gap-1">
          <button
            className="rounded-full p-1.5 text-(--color-text-secondary) hover:bg-black/5"
            aria-label="Editar lançamento"
            title="Editar"
            onClick={onEdit}
          >
            <Pencil size={15} />
          </button>
          {transaction && row.kind !== "recorrente" && (
            <button
              className="rounded-full p-1.5 text-(--color-text-tertiary) opacity-0 hover:bg-(--color-negative-soft) hover:text-(--color-negative) group-hover:opacity-100 focus-visible:opacity-100"
              aria-label="Excluir lançamento"
              title="Excluir"
              disabled={isPending}
              onClick={() => {
                if (!window.confirm(`Excluir "${o.description ?? "este lançamento"}"?`)) return;
                startTransition(async () => {
                  await deleteTransaction(transaction.id);
                });
              }}
            >
              <Trash2 size={15} />
            </button>
          )}
        </div>
      </td>
    </tr>
  );
}
