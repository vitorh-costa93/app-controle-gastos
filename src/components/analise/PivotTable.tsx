"use client";

import { useMemo, useState } from "react";
import { Transaction } from "@/types/domain";
import { Person, Category, TransactionType } from "@/types/db";
import { Card } from "@/components/ui/Card";
import { formatCurrencyBRL } from "@/lib/utils/format";

type DimensionKey = "person" | "category" | "type" | "fixedVariable" | "direction" | "considered";
type RowDimensionKey = DimensionKey;
type ColDimensionKey = DimensionKey | "none";
type MeasureKey = "sum" | "count" | "avg";
type DirectionFilter = "all" | "income" | "expense";

const DIMENSION_LABELS: Record<DimensionKey, string> = {
  person: "Origem",
  category: "Categoria",
  type: "Tipo",
  fixedVariable: "Fixo/Variável",
  direction: "Direção",
  considered: "Considerado",
};

const DIMENSION_OPTIONS = Object.entries(DIMENSION_LABELS) as [DimensionKey, string][];

const MEASURE_LABELS: Record<MeasureKey, string> = {
  sum: "Soma (R$)",
  count: "Quantidade",
  avg: "Média (R$)",
};

export function PivotTable({
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
  const [rowDim, setRowDim] = useState<RowDimensionKey>("category");
  const [colDim, setColDim] = useState<ColDimensionKey>("none");
  const [measure, setMeasure] = useState<MeasureKey>("sum");
  const [directionFilter, setDirectionFilter] = useState<DirectionFilter>("expense");

  const peopleById = useMemo(() => new Map(people.map((p) => [p.id, p.name])), [people]);
  const categoriesById = useMemo(() => new Map(categories.map((c) => [c.id, c.name])), [categories]);
  const typesById = useMemo(() => new Map(types.map((t) => [t.id, t.name])), [types]);

  function dimValue(dim: DimensionKey, t: Transaction): string {
    switch (dim) {
      case "person":
        return peopleById.get(t.personId) ?? "—";
      case "category":
        return t.categoryId ? categoriesById.get(t.categoryId) ?? "—" : "Sem categoria";
      case "type":
        return t.typeId ? typesById.get(t.typeId) ?? "—" : "Sem tipo";
      case "fixedVariable":
        return t.fixedVariable === "fixed" ? "Fixo" : "Variável";
      case "direction":
        return t.direction === "income" ? "Entrada" : "Saída";
      case "considered":
        return t.considered ? "Sim" : "Não";
    }
  }

  function aggregate(list: Transaction[]): number {
    if (list.length === 0) return 0;
    const sum = list.reduce((s, t) => s + t.amountCents, 0);
    if (measure === "sum") return sum;
    if (measure === "count") return list.length;
    return Math.round(sum / list.length);
  }

  const filtered = useMemo(
    () => (directionFilter === "all" ? transactions : transactions.filter((t) => t.direction === directionFilter)),
    [transactions, directionFilter]
  );

  const { rows, cols, matrix, rowTotals, colTotals, grandTotal } = useMemo(() => {
    const rowKeys = new Set<string>();
    const colKeys = new Set<string>();
    const groups = new Map<string, Transaction[]>();

    for (const t of filtered) {
      const rk = dimValue(rowDim, t);
      const ck = colDim === "none" ? "Total" : dimValue(colDim, t);
      rowKeys.add(rk);
      colKeys.add(ck);
      const key = `${rk}||${ck}`;
      const arr = groups.get(key);
      if (arr) arr.push(t);
      else groups.set(key, [t]);
    }

    const rowsArr = Array.from(rowKeys).sort();
    const colsArr = colDim === "none" ? ["Total"] : Array.from(colKeys).sort();

    const matrix = new Map<string, number>();
    for (const rk of rowsArr) {
      for (const ck of colsArr) {
        matrix.set(`${rk}||${ck}`, aggregate(groups.get(`${rk}||${ck}`) ?? []));
      }
    }

    const rowTotals = new Map<string, number>();
    for (const rk of rowsArr) {
      rowTotals.set(rk, aggregate(filtered.filter((t) => dimValue(rowDim, t) === rk)));
    }

    const colTotals = new Map<string, number>();
    for (const ck of colsArr) {
      colTotals.set(ck, colDim === "none" ? aggregate(filtered) : aggregate(filtered.filter((t) => dimValue(colDim, t) === ck)));
    }

    return { rows: rowsArr, cols: colsArr, matrix, rowTotals, colTotals, grandTotal: aggregate(filtered) };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtered, rowDim, colDim, measure]);

  function formatValue(v: number): string {
    return measure === "count" ? String(v) : formatCurrencyBRL(v);
  }

  const selectClass =
    "h-9 rounded-(--radius-md) border border-(--color-border) bg-(--color-surface) px-2 text-sm";

  return (
    <Card className="min-w-0 p-5">
      <h3 className="mb-1 text-[15px] font-semibold">Tabela dinâmica</h3>
      <p className="mb-4 text-xs text-(--color-text-tertiary)">
        Monte suas próprias agregações escolhendo linhas, colunas e a medida.
      </p>

      <div className="mb-4 flex flex-wrap gap-3">
        <label className="flex flex-col gap-1 text-xs text-(--color-text-secondary)">
          Linhas
          <select
            className={selectClass}
            value={rowDim}
            onChange={(e) => setRowDim(e.target.value as RowDimensionKey)}
          >
            {DIMENSION_OPTIONS.map(([key, label]) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1 text-xs text-(--color-text-secondary)">
          Colunas
          <select
            className={selectClass}
            value={colDim}
            onChange={(e) => setColDim(e.target.value as ColDimensionKey)}
          >
            <option value="none">Nenhuma</option>
            {DIMENSION_OPTIONS.map(([key, label]) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1 text-xs text-(--color-text-secondary)">
          Valores
          <select
            className={selectClass}
            value={measure}
            onChange={(e) => setMeasure(e.target.value as MeasureKey)}
          >
            {(Object.entries(MEASURE_LABELS) as [MeasureKey, string][]).map(([key, label]) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1 text-xs text-(--color-text-secondary)">
          Direção
          <select
            className={selectClass}
            value={directionFilter}
            onChange={(e) => setDirectionFilter(e.target.value as DirectionFilter)}
          >
            <option value="expense">Saídas</option>
            <option value="income">Entradas</option>
            <option value="all">Entradas e saídas</option>
          </select>
        </label>
      </div>

      <div className="min-w-0 overflow-x-auto">
        <table className="w-full min-w-[480px] text-sm">
          <thead>
            <tr className="border-b border-(--color-border) text-left text-xs text-(--color-text-tertiary)">
              <th className="px-3 py-2 font-medium">{DIMENSION_LABELS[rowDim]}</th>
              {cols.map((c) => (
                <th key={c} className="px-3 py-2 text-right font-medium">
                  {c}
                </th>
              ))}
              <th className="px-3 py-2 text-right font-medium">Total</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r} className="border-b border-(--color-border) last:border-0">
                <td className="px-3 py-2">{r}</td>
                {cols.map((c) => (
                  <td key={c} className="px-3 py-2 text-right tabular-nums text-(--color-text-secondary)">
                    {formatValue(matrix.get(`${r}||${c}`) ?? 0)}
                  </td>
                ))}
                <td className="px-3 py-2 text-right font-medium tabular-nums">{formatValue(rowTotals.get(r) ?? 0)}</td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={cols.length + 2} className="px-3 py-8 text-center text-(--color-text-tertiary)">
                  Sem dados para essa combinação.
                </td>
              </tr>
            )}
          </tbody>
          {rows.length > 0 && (
            <tfoot>
              <tr className="border-t-2 border-(--color-border) font-medium">
                <td className="px-3 py-2">Total</td>
                {cols.map((c) => (
                  <td key={c} className="px-3 py-2 text-right tabular-nums">
                    {formatValue(colTotals.get(c) ?? 0)}
                  </td>
                ))}
                <td className="px-3 py-2 text-right tabular-nums">{formatValue(grandTotal)}</td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </Card>
  );
}
