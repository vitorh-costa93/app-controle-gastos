"use client";

import { useMemo, useState } from "react";
import { ChevronDown } from "lucide-react";
import { fetchPivotTransactions } from "@/lib/data/analysis";
import { Transaction } from "@/types/domain";
import { Person, Category, TransactionType } from "@/types/db";
import { Card } from "@/components/ui/Card";
import { formatCurrencyBRL } from "@/lib/utils/format";
import { cn } from "@/lib/utils/cn";

type DimensionKey = "person" | "category" | "type" | "fixedVariable" | "direction" | "considered";
type MeasureKey = "sum" | "count" | "avg";
type ZoneKey = "rows" | "columns" | "values";

interface FieldChip {
  kind: "dimension" | "measure";
  key: DimensionKey | MeasureKey;
  label: string;
}

const DIMENSION_FIELDS: FieldChip[] = [
  { kind: "dimension", key: "person", label: "Origem" },
  { kind: "dimension", key: "category", label: "Categoria" },
  { kind: "dimension", key: "type", label: "Tipo" },
  { kind: "dimension", key: "fixedVariable", label: "Fixo/Variável" },
  { kind: "dimension", key: "direction", label: "Direção" },
  { kind: "dimension", key: "considered", label: "Considerado" },
];

const MEASURE_FIELDS: FieldChip[] = [
  { kind: "measure", key: "sum", label: "Soma (R$)" },
  { kind: "measure", key: "count", label: "Quantidade" },
  { kind: "measure", key: "avg", label: "Média (R$)" },
];

const ALL_FIELDS: FieldChip[] = [...DIMENSION_FIELDS, ...MEASURE_FIELDS];

function findField(kind: string, key: string): FieldChip | undefined {
  return ALL_FIELDS.find((f) => f.kind === kind && f.key === key);
}

/**
 * Tabela dinâmica de uso pontual: independe do mês e da origem selecionados na página — trabalha
 * sempre sobre a base completa (todos os meses, todas as pessoas). Vem recolhida e só busca os
 * dados quando é aberta pela primeira vez.
 */
export function PivotTable({
  people,
  categories,
  types,
}: {
  people: Person[];
  categories: Category[];
  types: TransactionType[];
}) {
  const [rowsField, setRowsField] = useState<FieldChip | null>(DIMENSION_FIELDS[1]); // Categoria
  const [columnsField, setColumnsField] = useState<FieldChip | null>(null);
  const [valuesField, setValuesField] = useState<FieldChip>(MEASURE_FIELDS[0]); // Soma
  const [directionFilter, setDirectionFilter] = useState<"expense" | "income" | "all">("expense");
  const [dragOverZone, setDragOverZone] = useState<ZoneKey | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [transactions, setTransactions] = useState<Transaction[] | null>(null);
  const [loadError, setLoadError] = useState(false);

  function toggleExpanded() {
    const next = !expanded;
    setExpanded(next);
    if (next && transactions === null) {
      setLoadError(false);
      fetchPivotTransactions()
        .then(setTransactions)
        .catch(() => setLoadError(true));
    }
  }

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

  function aggregate(list: Transaction[], measure: MeasureKey): number {
    if (list.length === 0) return 0;
    const sum = list.reduce((s, t) => s + t.amountCents, 0);
    if (measure === "sum") return sum;
    if (measure === "count") return list.length;
    return Math.round(sum / list.length);
  }

  const filtered = useMemo(
    () => {
      const all = transactions ?? [];
      return directionFilter === "all" ? all : all.filter((t) => t.direction === directionFilter);
    },
    [transactions, directionFilter]
  );

  const pivot = useMemo(() => {
    if (!rowsField) return null;
    const rowDim = rowsField.key as DimensionKey;
    const colDim = columnsField ? (columnsField.key as DimensionKey) : null;
    const measure = valuesField.key as MeasureKey;

    const rowKeys = new Set<string>();
    const colKeys = new Set<string>();
    const groups = new Map<string, Transaction[]>();

    for (const t of filtered) {
      const rk = dimValue(rowDim, t);
      const ck = colDim ? dimValue(colDim, t) : "Total";
      rowKeys.add(rk);
      colKeys.add(ck);
      const key = `${rk}||${ck}`;
      const arr = groups.get(key);
      if (arr) arr.push(t);
      else groups.set(key, [t]);
    }

    const rowsArr = Array.from(rowKeys).sort();
    const colsArr = colDim ? Array.from(colKeys).sort() : ["Total"];

    const matrix = new Map<string, number>();
    for (const rk of rowsArr) {
      for (const ck of colsArr) {
        matrix.set(`${rk}||${ck}`, aggregate(groups.get(`${rk}||${ck}`) ?? [], measure));
      }
    }

    const rowTotals = new Map<string, number>();
    for (const rk of rowsArr) {
      rowTotals.set(rk, aggregate(filtered.filter((t) => dimValue(rowDim, t) === rk), measure));
    }

    const colTotals = new Map<string, number>();
    for (const ck of colsArr) {
      colTotals.set(ck, colDim ? aggregate(filtered.filter((t) => dimValue(colDim, t) === ck), measure) : aggregate(filtered, measure));
    }

    return { rowDim, rows: rowsArr, cols: colsArr, matrix, rowTotals, colTotals, grandTotal: aggregate(filtered, measure) };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtered, rowsField, columnsField, valuesField]);

  function formatValue(v: number): string {
    return valuesField.key === "count" ? String(v) : formatCurrencyBRL(v);
  }

  function handleDrop(zone: ZoneKey, e: React.DragEvent) {
    e.preventDefault();
    setDragOverZone(null);
    const kind = e.dataTransfer.getData("kind");
    const key = e.dataTransfer.getData("key");
    const field = findField(kind, key);
    if (!field) return;

    if (zone === "values") {
      if (field.kind === "measure") setValuesField(field);
      return;
    }
    if (field.kind !== "dimension") return;
    if (zone === "rows") setRowsField(field);
    else setColumnsField(field);
  }

  function handleDragStart(field: FieldChip, e: React.DragEvent) {
    e.dataTransfer.setData("kind", field.kind);
    e.dataTransfer.setData("key", field.key);
    e.dataTransfer.effectAllowed = "copy";
  }

  return (
    <Card className="min-w-0 p-5">
      <button
        type="button"
        onClick={toggleExpanded}
        aria-expanded={expanded}
        className="flex w-full items-center justify-between text-left"
      >
        <span>
          <span className="block text-[15px] font-semibold">Tabela dinâmica</span>
          <span className="block text-xs text-(--color-text-tertiary)">
            Base completa — todos os meses e origens, sem os filtros da página.
          </span>
        </span>
        <ChevronDown
          size={18}
          className={cn("shrink-0 text-(--color-text-tertiary) transition-transform", expanded && "rotate-180")}
        />
      </button>

      {expanded && transactions === null && (
        <p className="py-8 text-center text-xs text-(--color-text-tertiary)">
          {loadError ? "Não foi possível carregar os lançamentos. Recolha e abra de novo." : "Carregando..."}
        </p>
      )}

      {expanded && transactions !== null && (
        <div className="mt-4">
      <p className="mb-4 text-xs text-(--color-text-tertiary)">
        Arraste os campos abaixo para Linhas, Colunas ou Valores pra montar sua própria agregação.
      </p>

      <div className="mb-4 flex flex-wrap gap-2">
        {ALL_FIELDS.map((field) => (
          <div
            key={`${field.kind}-${field.key}`}
            draggable
            onDragStart={(e) => handleDragStart(field, e)}
            className={cn(
              "cursor-grab select-none rounded-full border px-3 py-1.5 text-xs font-medium active:cursor-grabbing",
              field.kind === "measure"
                ? "border-(--color-primary)/30 bg-(--color-primary-soft) text-(--color-primary)"
                : "border-(--color-border) bg-(--color-surface-secondary) text-(--color-text-secondary)"
            )}
          >
            {field.label}
          </div>
        ))}
      </div>

      <div className="mb-5 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <DropZone
          label="Linhas"
          field={rowsField}
          isOver={dragOverZone === "rows"}
          onDragOver={() => setDragOverZone("rows")}
          onDragLeave={() => setDragOverZone(null)}
          onDrop={(e) => handleDrop("rows", e)}
          onClear={() => setRowsField(null)}
        />
        <DropZone
          label="Colunas (opcional)"
          field={columnsField}
          isOver={dragOverZone === "columns"}
          onDragOver={() => setDragOverZone("columns")}
          onDragLeave={() => setDragOverZone(null)}
          onDrop={(e) => handleDrop("columns", e)}
          onClear={() => setColumnsField(null)}
        />
        <DropZone
          label="Valores"
          field={valuesField}
          isOver={dragOverZone === "values"}
          onDragOver={() => setDragOverZone("values")}
          onDragLeave={() => setDragOverZone(null)}
          onDrop={(e) => handleDrop("values", e)}
        />
      </div>

      <div className="mb-4">
        <label className="mr-2 text-xs font-medium text-(--color-text-secondary)">Direção</label>
        <select
          value={directionFilter}
          onChange={(e) => setDirectionFilter(e.target.value as "expense" | "income" | "all")}
          className="h-8 rounded-(--radius-md) border border-(--color-border) bg-(--color-surface) px-2 text-xs"
        >
          <option value="expense">Saídas</option>
          <option value="income">Entradas</option>
          <option value="all">Entradas e saídas</option>
        </select>
      </div>

      {!pivot ? (
        <p className="py-8 text-center text-xs text-(--color-text-tertiary)">
          Arraste um campo para &quot;Linhas&quot; pra começar.
        </p>
      ) : (
        <div className="min-w-0 overflow-x-auto">
          <table className="w-full min-w-[480px] text-sm">
            <thead>
              <tr className="border-b border-(--color-border) text-left text-xs text-(--color-text-tertiary)">
                <th className="px-3 py-2 font-medium">{rowsField?.label}</th>
                {pivot.cols.map((c) => (
                  <th key={c} className="px-3 py-2 text-right font-medium">
                    {c}
                  </th>
                ))}
                <th className="px-3 py-2 text-right font-medium">Total</th>
              </tr>
            </thead>
            <tbody>
              {pivot.rows.map((r) => (
                <tr key={r} className="border-b border-(--color-border) last:border-0">
                  <td className="px-3 py-2">{r}</td>
                  {pivot.cols.map((c) => (
                    <td key={c} className="px-3 py-2 text-right tabular-nums text-(--color-text-secondary)">
                      {formatValue(pivot.matrix.get(`${r}||${c}`) ?? 0)}
                    </td>
                  ))}
                  <td className="px-3 py-2 text-right font-medium tabular-nums">
                    {formatValue(pivot.rowTotals.get(r) ?? 0)}
                  </td>
                </tr>
              ))}
              {pivot.rows.length === 0 && (
                <tr>
                  <td colSpan={pivot.cols.length + 2} className="px-3 py-8 text-center text-(--color-text-tertiary)">
                    Nenhuma movimentação encontrada com esses filtros.
                  </td>
                </tr>
              )}
            </tbody>
            {pivot.rows.length > 0 && (
              <tfoot>
                <tr className="border-t-2 border-(--color-border) font-medium">
                  <td className="px-3 py-2">Total</td>
                  {pivot.cols.map((c) => (
                    <td key={c} className="px-3 py-2 text-right tabular-nums">
                      {formatValue(pivot.colTotals.get(c) ?? 0)}
                    </td>
                  ))}
                  <td className="px-3 py-2 text-right tabular-nums">{formatValue(pivot.grandTotal)}</td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      )}
        </div>
      )}
    </Card>
  );
}

function DropZone({
  label,
  field,
  isOver,
  onDragOver,
  onDragLeave,
  onDrop,
  onClear,
}: {
  label: string;
  field: FieldChip | null;
  isOver: boolean;
  onDragOver: () => void;
  onDragLeave: () => void;
  onDrop: (e: React.DragEvent) => void;
  onClear?: () => void;
}) {
  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        onDragOver();
      }}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      className={cn(
        "flex min-h-16 flex-col gap-1 rounded-(--radius-lg) border-2 border-dashed p-3 transition-colors",
        isOver ? "border-(--color-primary) bg-(--color-primary-soft)/40" : "border-(--color-border)"
      )}
    >
      <span className="text-[11px] font-medium text-(--color-text-tertiary)">{label}</span>
      {field ? (
        <div className="flex items-center justify-between">
          <span
            className={cn(
              "rounded-full px-2.5 py-1 text-xs font-medium",
              field.kind === "measure"
                ? "bg-(--color-primary-soft) text-(--color-primary)"
                : "bg-(--color-surface-secondary) text-(--color-text-secondary)"
            )}
          >
            {field.label}
          </span>
          {onClear && (
            <button
              onClick={onClear}
              className="text-xs text-(--color-text-tertiary) hover:text-(--color-negative)"
              type="button"
            >
              remover
            </button>
          )}
        </div>
      ) : (
        <span className="text-xs text-(--color-text-tertiary)">Solte um campo aqui</span>
      )}
    </div>
  );
}
