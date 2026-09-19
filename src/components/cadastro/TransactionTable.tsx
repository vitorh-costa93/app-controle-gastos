"use client";

import { useState, useTransition } from "react";
import { MoreVertical, Trash2 } from "lucide-react";
import { Transaction } from "@/types/domain";
import { Person, Category, TransactionType } from "@/types/db";
import { Toggle } from "@/components/ui/Toggle";
import { Badge } from "@/components/ui/Badge";
import { formatCurrencyBRL, formatDateBR, formatReferenceMonthShort } from "@/lib/utils/format";
import { setTransactionConsidered, deleteTransaction } from "@/lib/data/transactions";

export function TransactionTable({
  transactions,
  people,
  categories,
  types,
  onEdit,
}: {
  transactions: Transaction[];
  people: Person[];
  categories: Category[];
  types: TransactionType[];
  onEdit: (t: Transaction) => void;
}) {
  const peopleById = new Map(people.map((p) => [p.id, p]));
  const categoriesById = new Map(categories.map((c) => [c.id, c]));
  const typesById = new Map(types.map((t) => [t.id, t]));

  return (
    <div className="overflow-hidden rounded-(--radius-lg) border border-(--color-border) bg-(--color-surface)">
      {/* Desktop table */}
      <div className="hidden overflow-x-auto md:block">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-(--color-border) text-left text-xs text-(--color-text-tertiary)">
              <th className="px-4 py-3 font-medium">Data cadastro</th>
              <th className="px-4 py-3 font-medium">Mês ref.</th>
              <th className="px-4 py-3 font-medium">Origem</th>
              <th className="px-4 py-3 font-medium">Tipo</th>
              <th className="px-4 py-3 font-medium">Categoria</th>
              <th className="px-4 py-3 font-medium">Parcela</th>
              <th className="px-4 py-3 text-right font-medium">Valor</th>
              <th className="px-4 py-3 text-center font-medium">Considerar</th>
              <th className="w-10 px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {transactions.map((t) => (
              <TransactionRow
                key={t.id}
                transaction={t}
                person={peopleById.get(t.personId)}
                category={t.categoryId ? categoriesById.get(t.categoryId) : undefined}
                type={t.typeId ? typesById.get(t.typeId) : undefined}
                onEdit={() => onEdit(t)}
              />
            ))}
          </tbody>
        </table>
      </div>

      {/* Mobile cards */}
      <div className="divide-y divide-(--color-border) md:hidden">
        {transactions.map((t) => (
          <MobileCard
            key={t.id}
            transaction={t}
            person={peopleById.get(t.personId)}
            category={t.categoryId ? categoriesById.get(t.categoryId) : undefined}
            onEdit={() => onEdit(t)}
          />
        ))}
      </div>
    </div>
  );
}

function TransactionRow({
  transaction,
  person,
  category,
  type,
  onEdit,
}: {
  transaction: Transaction;
  person?: Person;
  category?: Category;
  type?: TransactionType;
  onEdit: () => void;
}) {
  const [considered, setConsidered] = useState(transaction.considered);
  const [menuOpen, setMenuOpen] = useState(false);
  const [isPending, startTransition] = useTransition();

  return (
    <tr className="group border-b border-(--color-border) last:border-0 hover:bg-black/[0.015]">
      <td className="cursor-pointer px-4 py-3 text-(--color-text-primary)" onClick={onEdit}>
        {formatDateBR(transaction.registrationDate)}
      </td>
      <td className="cursor-pointer px-4 py-3 text-(--color-text-secondary)" onClick={onEdit}>
        {formatReferenceMonthShort(transaction.referenceMonth)}
      </td>
      <td className="cursor-pointer px-4 py-3" onClick={onEdit}>
        <span className="inline-flex items-center gap-1.5">
          <span
            className="h-2 w-2 rounded-full"
            style={{ backgroundColor: person?.color ?? "#8e8e93" }}
          />
          {person?.name ?? "—"}
        </span>
      </td>
      <td className="cursor-pointer px-4 py-3 text-(--color-text-secondary)" onClick={onEdit}>
        {type?.name ?? "—"}
      </td>
      <td className="cursor-pointer px-4 py-3 text-(--color-text-secondary)" onClick={onEdit}>
        {category?.name ?? "—"}
      </td>
      <td className="cursor-pointer px-4 py-3 text-(--color-text-secondary)" onClick={onEdit}>
        {transaction.installmentCurrent}/{transaction.installmentTotal}
      </td>
      <td
        className="cursor-pointer px-4 py-3 text-right font-medium tabular-nums"
        onClick={onEdit}
      >
        <span
          className={
            transaction.direction === "income" ? "text-(--color-positive)" : "text-(--color-text-primary)"
          }
        >
          {formatCurrencyBRL(transaction.amountCents)}
        </span>
      </td>
      <td className="px-4 py-3 text-center">
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
      </td>
      <td className="relative px-2 py-3">
        <button
          className="rounded-full p-1.5 text-(--color-text-tertiary) opacity-0 hover:bg-black/5 group-hover:opacity-100"
          onClick={() => setMenuOpen((v) => !v)}
          aria-label="Mais opções"
        >
          <MoreVertical size={16} />
        </button>
        {menuOpen && (
          <div className="absolute right-2 top-10 z-10 w-40 rounded-(--radius-md) border border-(--color-border) bg-(--color-surface) py-1 shadow-(--shadow-md)">
            <button
              className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-(--color-negative) hover:bg-(--color-negative-soft)"
              onClick={() => {
                setMenuOpen(false);
                startTransition(async () => {
                  await deleteTransaction(transaction.id);
                });
              }}
            >
              <Trash2 size={14} /> Excluir
            </button>
          </div>
        )}
      </td>
    </tr>
  );
}

function MobileCard({
  transaction,
  person,
  category,
  onEdit,
}: {
  transaction: Transaction;
  person?: Person;
  category?: Category;
  onEdit: () => void;
}) {
  return (
    <button onClick={onEdit} className="flex w-full items-center justify-between px-4 py-3 text-left">
      <div className="flex flex-col gap-0.5">
        <span className="text-sm font-medium">{category?.name ?? transaction.description ?? "—"}</span>
        <span className="text-xs text-(--color-text-tertiary)">
          {formatDateBR(transaction.registrationDate)} · {person?.name ?? "—"}
        </span>
      </div>
      <div className="flex items-center gap-2">
        {!transaction.considered && <Badge tone="neutral">Não considerado</Badge>}
        <span
          className={
            "text-sm font-semibold tabular-nums " +
            (transaction.direction === "income" ? "text-(--color-positive)" : "text-(--color-text-primary)")
          }
        >
          {formatCurrencyBRL(transaction.amountCents)}
        </span>
      </div>
    </button>
  );
}
