"use client";

import { useMemo, useState } from "react";
import { Transaction } from "@/types/domain";
import { Person, Category, TransactionType } from "@/types/db";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { formatCurrencyBRL, formatDateBR, formatReferenceMonthShort } from "@/lib/utils/format";

interface ColumnFilters {
  personId: string;
  direction: string;
  fixedVariable: string;
  typeId: string;
  categoryId: string;
  considered: string;
  description: string;
  minAmount: string;
  maxAmount: string;
}

const EMPTY_FILTERS: ColumnFilters = {
  personId: "",
  direction: "",
  fixedVariable: "",
  typeId: "",
  categoryId: "",
  considered: "",
  description: "",
  minAmount: "",
  maxAmount: "",
};

export function AnaliseTransactionsTable({
  transactions,
  people,
  categories,
  types,
}: {
  transactions: Transaction[];
  people: Person[];
  categories: Category[];
  types: TransactionType[];
}) {
  const [filters, setFilters] = useState<ColumnFilters>(EMPTY_FILTERS);

  const peopleById = useMemo(() => new Map(people.map((p) => [p.id, p])), [people]);
  const categoriesById = useMemo(() => new Map(categories.map((c) => [c.id, c])), [categories]);
  const typesById = useMemo(() => new Map(types.map((t) => [t.id, t])), [types]);

  function setFilter<K extends keyof ColumnFilters>(key: K, value: string) {
    setFilters((prev) => ({ ...prev, [key]: value }));
  }

  const filtered = useMemo(() => {
    const minCents = filters.minAmount ? Math.round(Number(filters.minAmount) * 100) : null;
    const maxCents = filters.maxAmount ? Math.round(Number(filters.maxAmount) * 100) : null;
    const descQuery = filters.description.trim().toLowerCase();

    return transactions.filter((t) => {
      if (filters.personId && t.personId !== filters.personId) return false;
      if (filters.direction && t.direction !== filters.direction) return false;
      if (filters.fixedVariable && t.fixedVariable !== filters.fixedVariable) return false;
      if (filters.typeId && t.typeId !== filters.typeId) return false;
      if (filters.categoryId && t.categoryId !== filters.categoryId) return false;
      if (filters.considered && t.considered !== (filters.considered === "true")) return false;
      if (descQuery && !(t.description ?? "").toLowerCase().includes(descQuery)) return false;
      if (minCents !== null && t.amountCents < minCents) return false;
      if (maxCents !== null && t.amountCents > maxCents) return false;
      return true;
    });
  }, [transactions, filters]);

  const selectClass =
    "h-8 w-full rounded-(--radius-sm) border border-(--color-border) bg-(--color-surface) px-1.5 text-xs";
  const inputClass = selectClass;

  return (
    <Card className="min-w-0 p-5">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-[15px] font-semibold">Todas as movimentações do mês</h3>
        <span className="text-xs text-(--color-text-tertiary)">
          {filtered.length} de {transactions.length}
        </span>
      </div>

      <div className="min-w-0 overflow-x-auto">
        <table className="w-full min-w-[900px] text-sm">
          <thead>
            <tr className="border-b border-(--color-border) text-left text-xs text-(--color-text-tertiary)">
              <th className="px-3 py-2 font-medium">Data cadastro</th>
              <th className="px-3 py-2 font-medium">Origem</th>
              <th className="px-3 py-2 font-medium">Direção</th>
              <th className="px-3 py-2 font-medium">Fixo/Variável</th>
              <th className="px-3 py-2 font-medium">Tipo</th>
              <th className="px-3 py-2 font-medium">Categoria</th>
              <th className="px-3 py-2 font-medium">Descrição</th>
              <th className="px-3 py-2 font-medium">Parcela</th>
              <th className="px-3 py-2 text-right font-medium">Valor</th>
              <th className="px-3 py-2 text-center font-medium">Considerado</th>
            </tr>
            <tr className="border-b border-(--color-border) bg-(--color-surface-secondary)">
              <th className="px-3 py-2" />
              <th className="px-3 py-2">
                <select
                  className={selectClass}
                  value={filters.personId}
                  onChange={(e) => setFilter("personId", e.target.value)}
                >
                  <option value="">Todas</option>
                  {people.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </th>
              <th className="px-3 py-2">
                <select
                  className={selectClass}
                  value={filters.direction}
                  onChange={(e) => setFilter("direction", e.target.value)}
                >
                  <option value="">Todas</option>
                  <option value="income">Entrada</option>
                  <option value="expense">Saída</option>
                </select>
              </th>
              <th className="px-3 py-2">
                <select
                  className={selectClass}
                  value={filters.fixedVariable}
                  onChange={(e) => setFilter("fixedVariable", e.target.value)}
                >
                  <option value="">Todos</option>
                  <option value="fixed">Fixo</option>
                  <option value="variable">Variável</option>
                </select>
              </th>
              <th className="px-3 py-2">
                <select
                  className={selectClass}
                  value={filters.typeId}
                  onChange={(e) => setFilter("typeId", e.target.value)}
                >
                  <option value="">Todos</option>
                  {types.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </select>
              </th>
              <th className="px-3 py-2">
                <select
                  className={selectClass}
                  value={filters.categoryId}
                  onChange={(e) => setFilter("categoryId", e.target.value)}
                >
                  <option value="">Todas</option>
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </th>
              <th className="px-3 py-2">
                <input
                  type="text"
                  placeholder="Buscar..."
                  className={inputClass}
                  value={filters.description}
                  onChange={(e) => setFilter("description", e.target.value)}
                />
              </th>
              <th className="px-3 py-2" />
              <th className="px-3 py-2">
                <div className="flex gap-1">
                  <input
                    type="number"
                    placeholder="mín"
                    className={inputClass}
                    value={filters.minAmount}
                    onChange={(e) => setFilter("minAmount", e.target.value)}
                  />
                  <input
                    type="number"
                    placeholder="máx"
                    className={inputClass}
                    value={filters.maxAmount}
                    onChange={(e) => setFilter("maxAmount", e.target.value)}
                  />
                </div>
              </th>
              <th className="px-3 py-2">
                <select
                  className={selectClass}
                  value={filters.considered}
                  onChange={(e) => setFilter("considered", e.target.value)}
                >
                  <option value="">Todos</option>
                  <option value="true">Sim</option>
                  <option value="false">Não</option>
                </select>
              </th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((t) => {
              const person = peopleById.get(t.personId);
              const category = t.categoryId ? categoriesById.get(t.categoryId) : undefined;
              const type = t.typeId ? typesById.get(t.typeId) : undefined;
              return (
                <tr key={t.id} className="border-b border-(--color-border) last:border-0">
                  <td className="px-3 py-2 whitespace-nowrap">
                    {formatDateBR(t.registrationDate)}
                    <span className="ml-1 text-(--color-text-tertiary)">
                      ({formatReferenceMonthShort(t.referenceMonth)})
                    </span>
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap">
                    <span className="inline-flex items-center gap-1.5">
                      <span
                        className="h-2 w-2 rounded-full"
                        style={{ backgroundColor: person?.color ?? "#8e8e93" }}
                      />
                      {person?.name ?? "—"}
                    </span>
                  </td>
                  <td className="px-3 py-2">
                    <Badge tone={t.direction === "income" ? "positive" : "neutral"}>
                      {t.direction === "income" ? "Entrada" : "Saída"}
                    </Badge>
                  </td>
                  <td className="px-3 py-2 text-(--color-text-secondary)">
                    {t.fixedVariable === "fixed" ? "Fixo" : "Variável"}
                  </td>
                  <td className="px-3 py-2 text-(--color-text-secondary)">{type?.name ?? "—"}</td>
                  <td className="px-3 py-2 text-(--color-text-secondary)">{category?.name ?? "—"}</td>
                  <td className="max-w-[220px] truncate px-3 py-2 text-(--color-text-secondary)" title={t.description ?? ""}>
                    {t.description ?? "—"}
                  </td>
                  <td className="px-3 py-2 text-(--color-text-secondary)">
                    {t.installmentCurrent}/{t.installmentTotal}
                  </td>
                  <td className="px-3 py-2 text-right font-medium tabular-nums">
                    <span className={t.direction === "income" ? "text-(--color-positive)" : "text-(--color-text-primary)"}>
                      {formatCurrencyBRL(t.amountCents)}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-center">
                    {t.considered ? (
                      <span className="text-(--color-positive)">Sim</span>
                    ) : (
                      <span className="text-(--color-text-tertiary)">Não</span>
                    )}
                  </td>
                </tr>
              );
            })}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={10} className="px-3 py-8 text-center text-(--color-text-tertiary)">
                  Nenhuma movimentação encontrada com esses filtros.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
