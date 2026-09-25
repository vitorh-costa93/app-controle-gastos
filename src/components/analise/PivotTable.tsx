"use client";

import { Fragment, useMemo, useState } from "react";
import { ChevronDown } from "lucide-react";
import { fetchPivotTransactions } from "@/lib/data/analysis";
import { Transaction } from "@/types/domain";
import { Person, Category, TransactionType } from "@/types/db";
import { Card } from "@/components/ui/Card";
import { formatCurrencyBRL, formatReferenceMonthShort } from "@/lib/utils/format";
import { cn } from "@/lib/utils/cn";

type DimensionKey = "month" | "person" | "category" | "type" | "fixedVariable" | "direction" | "considered";
type MeasureKey = "sum" | "count" | "avg";
type ZoneKey = "rows" | "columns" | "values";
type TotalsMode = "none" | "row" | "column" | "both";

const DIMENSIONS: { key: DimensionKey; label: string }[] = [
  { key: "month", label: "Mês" },
  { key: "person", label: "Origem" },
  { key: "category", label: "Categoria" },
  { key: "type", label: "Tipo" },
  { key: "fixedVariable", label: "Fixo/Variável" },
  { key: "direction", label: "Direção" },
  { key: "considered", label: "Considerado" },
];

const MEASURES: { key: MeasureKey; label: string }[] = [
  { key: "sum", label: "Soma (R$)" },
  { key: "count", label: "Quantidade" },
  { key: "avg", label: "Média (R$)" },
];

const dimensionLabel = (key: DimensionKey) => DIMENSIONS.find((d) => d.key === key)?.label ?? key;
const measureLabel = (key: MeasureKey) => MEASURES.find((m) => m.key === key)?.label ?? key;

interface PivotNode {
  path: string;
  label: string;
  level: number;
  items: Transaction[];
  children: PivotNode[];
}

// Cores do tema "tabela dinâmica" (cinza-esverdeado), usadas em cabeçalho, chips e totais.
const TONE = {
  header: "bg-[#e3ebe9]",
  border: "border-[#cbd8d5]",
  chip: "bg-[#e3ebe9] border-[#cbd8d5]",
  active: "bg-[#dbe7e4]",
};

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
  const [expanded, setExpanded] = useState(false);
  const [transactions, setTransactions] = useState<Transaction[] | null>(null);
  const [loadError, setLoadError] = useState(false);

  const [rowDims, setRowDims] = useState<DimensionKey[]>(["category"]);
  const [colDims, setColDims] = useState<DimensionKey[]>([]);
  const [measures, setMeasures] = useState<MeasureKey[]>(["sum"]);
  const [descDims, setDescDims] = useState<DimensionKey[]>([]);
  const [expandTo, setExpandTo] = useState<number | null>(null);
  const [toggled, setToggled] = useState<Set<string>>(new Set());
  const [totals, setTotals] = useState<TotalsMode>("both");
  const [directionFilter, setDirectionFilter] = useState<"expense" | "income" | "all">("expense");
  const [dragOverZone, setDragOverZone] = useState<ZoneKey | null>(null);

  const peopleById = useMemo(() => new Map(people.map((p) => [p.id, p.name])), [people]);
  const categoriesById = useMemo(() => new Map(categories.map((c) => [c.id, c.name])), [categories]);
  const typesById = useMemo(() => new Map(types.map((t) => [t.id, t.name])), [types]);

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

  function dimValue(dim: DimensionKey, t: Transaction): string {
    switch (dim) {
      case "month":
        return formatReferenceMonthShort(t.referenceMonth);
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

  /** Chave de ordenação: meses seguem o calendário, o resto segue o texto. */
  function dimSortKey(dim: DimensionKey, t: Transaction): string {
    return dim === "month" ? t.referenceMonth : dimValue(dim, t);
  }

  function aggregate(list: Transaction[], measure: MeasureKey): number {
    if (list.length === 0) return 0;
    const sum = list.reduce((s, t) => s + t.amountCents, 0);
    if (measure === "sum") return sum;
    if (measure === "count") return list.length;
    return Math.round(sum / list.length);
  }

  function formatValue(measure: MeasureKey, v: number): string {
    return measure === "count" ? String(v) : formatCurrencyBRL(v);
  }

  const filtered = useMemo(() => {
    const all = transactions ?? [];
    return directionFilter === "all" ? all : all.filter((t) => t.direction === directionFilter);
  }, [transactions, directionFilter]);

  const tree = useMemo<PivotNode[]>(() => {
    if (rowDims.length === 0) return [{ path: "/total", label: "Total", level: 0, items: filtered, children: [] }];

    function build(items: Transaction[], level: number, parentPath: string): PivotNode[] {
      if (level >= rowDims.length) return [];
      const dim = rowDims[level];
      const groups = new Map<string, { sortKey: string; items: Transaction[] }>();
      for (const t of items) {
        const label = dimValue(dim, t);
        const group = groups.get(label);
        if (group) group.items.push(t);
        else groups.set(label, { sortKey: dimSortKey(dim, t), items: [t] });
      }
      const direction = descDims.includes(dim) ? -1 : 1;
      return [...groups.entries()]
        .sort(([, a], [, b]) => direction * a.sortKey.localeCompare(b.sortKey, "pt-BR"))
        .map(([label, group]) => {
          const path = `${parentPath}/${label}`;
          return { path, label, level, items: group.items, children: build(group.items, level + 1, path) };
        });
    }
    return build(filtered, 0, "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtered, rowDims, descDims, peopleById, categoriesById, typesById]);

  const columnLabels = useMemo(() => {
    if (colDims.length === 0) return [""];
    const seen = new Map<string, string>();
    for (const t of filtered) {
      const label = colDims.map((d) => dimValue(d, t)).join(" › ");
      if (!seen.has(label)) seen.set(label, colDims.map((d) => dimSortKey(d, t)).join("|"));
    }
    const direction = descDims.includes(colDims[0]) ? -1 : 1;
    return [...seen.entries()].sort(([, a], [, b]) => direction * a.localeCompare(b, "pt-BR")).map(([label]) => label);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtered, colDims, descDims, peopleById, categoriesById, typesById]);

  const hasCols = colDims.length > 0;
  const levelsShown = Math.max(1, Math.min(expandTo ?? rowDims.length, Math.max(rowDims.length, 1)));
  const showTotalRow = (totals === "row" || totals === "both") && rowDims.length > 0;
  const showTotalColumn = (totals === "column" || totals === "both") && hasCols;

  function isExpanded(node: PivotNode): boolean {
    const byDefault = node.level < levelsShown - 1;
    return toggled.has(node.path) ? !byDefault : byDefault;
  }

  const visibleRows = useMemo(() => {
    const out: PivotNode[] = [];
    function walk(nodes: PivotNode[]) {
      for (const node of nodes) {
        out.push(node);
        if (node.children.length > 0 && isExpanded(node)) walk(node.children);
      }
    }
    walk(tree);
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tree, levelsShown, toggled]);

  /** Transações de uma linha separadas por coluna, mais o total da linha. */
  function cellsFor(items: Transaction[]): { perColumn: Transaction[][]; all: Transaction[] } {
    if (!hasCols) return { perColumn: [items], all: items };
    const buckets = new Map<string, Transaction[]>();
    for (const t of items) {
      const label = colDims.map((d) => dimValue(d, t)).join(" › ");
      const arr = buckets.get(label);
      if (arr) arr.push(t);
      else buckets.set(label, [t]);
    }
    return { perColumn: columnLabels.map((c) => buckets.get(c) ?? []), all: items };
  }

  const valueColumnCount = columnLabels.length * measures.length + (showTotalColumn ? measures.length : 0);

  // ---- Edição dos shelves (arrastar, clicar na lista ou remover pelo ×) ----

  function resetRowState(next: DimensionKey[]) {
    setRowDims(next);
    setExpandTo(null);
    setToggled(new Set());
  }

  function addDimension(zone: "rows" | "columns", dim: DimensionKey) {
    const nextRows = rowDims.filter((d) => d !== dim);
    const nextCols = colDims.filter((d) => d !== dim);
    if (zone === "rows") nextRows.push(dim);
    else nextCols.push(dim);
    resetRowState(nextRows);
    setColDims(nextCols);
  }

  function removeDimension(dim: DimensionKey) {
    resetRowState(rowDims.filter((d) => d !== dim));
    setColDims(colDims.filter((d) => d !== dim));
  }

  function addMeasure(measure: MeasureKey) {
    setMeasures((prev) => (prev.includes(measure) ? prev : [...prev, measure]));
  }

  function toggleSortDirection(dim: DimensionKey) {
    setDescDims((prev) => (prev.includes(dim) ? prev.filter((d) => d !== dim) : [...prev, dim]));
  }

  function toggleFromList(kind: "dimension" | "measure", key: string) {
    if (kind === "measure") {
      const measure = key as MeasureKey;
      setMeasures((prev) => (prev.includes(measure) ? prev.filter((m) => m !== measure) : [...prev, measure]));
      return;
    }
    const dim = key as DimensionKey;
    if (rowDims.includes(dim) || colDims.includes(dim)) removeDimension(dim);
    else addDimension("rows", dim);
  }

  function handleDrop(zone: ZoneKey, e: React.DragEvent) {
    e.preventDefault();
    setDragOverZone(null);
    const kind = e.dataTransfer.getData("kind");
    const key = e.dataTransfer.getData("key");
    if (zone === "values") {
      if (kind === "measure") addMeasure(key as MeasureKey);
      return;
    }
    if (kind === "dimension") addDimension(zone, key as DimensionKey);
  }

  function handleDragStart(kind: "dimension" | "measure", key: string, e: React.DragEvent) {
    e.dataTransfer.setData("kind", kind);
    e.dataTransfer.setData("key", key);
    e.dataTransfer.effectAllowed = "copy";
  }

  const usedDimensions = new Set<DimensionKey>([...rowDims, ...colDims]);
  const rowHeaderLabel = rowDims.length > 0 ? rowDims.map(dimensionLabel).join(" › ") : "Total";
  const controlClass =
    "h-8 rounded-(--radius-md) border border-[#cbd8d5] bg-(--color-surface) px-2 text-xs text-(--color-text-primary)";

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
        <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-[220px_minmax(0,1fr)]">
          {/* Lista de campos */}
          <aside className={cn("h-fit rounded-(--radius-lg) border p-3", TONE.border)}>
            <p className="mb-2 text-[11px] font-semibold tracking-wider text-(--color-text-secondary)">DIMENSÕES</p>
            <ul className="mb-4 space-y-1">
              {DIMENSIONS.map((d) => (
                <li key={d.key}>
                  <button
                    type="button"
                    draggable
                    onDragStart={(e) => handleDragStart("dimension", d.key, e)}
                    onClick={() => toggleFromList("dimension", d.key)}
                    className={cn(
                      "flex w-full cursor-grab items-center justify-between rounded-md border px-2.5 py-1.5 text-left text-sm active:cursor-grabbing",
                      usedDimensions.has(d.key)
                        ? cn(TONE.active, TONE.border)
                        : "border-(--color-border) bg-(--color-surface) hover:bg-(--color-surface-secondary)"
                    )}
                  >
                    {d.label}
                    {usedDimensions.has(d.key) && (
                      <span className="text-[11px] font-semibold text-(--color-text-secondary)">
                        {rowDims.includes(d.key) ? "L" : "C"}
                      </span>
                    )}
                  </button>
                </li>
              ))}
            </ul>
            <p className="mb-2 text-[11px] font-semibold tracking-wider text-(--color-text-secondary)">MEDIDAS</p>
            <ul className="space-y-1">
              {MEASURES.map((m) => (
                <li key={m.key}>
                  <button
                    type="button"
                    draggable
                    onDragStart={(e) => handleDragStart("measure", m.key, e)}
                    onClick={() => toggleFromList("measure", m.key)}
                    className={cn(
                      "flex w-full cursor-grab items-center rounded-md border px-2.5 py-1.5 text-left text-sm active:cursor-grabbing",
                      measures.includes(m.key)
                        ? cn(TONE.active, TONE.border, "font-semibold")
                        : "border-(--color-border) bg-(--color-surface) hover:bg-(--color-surface-secondary)"
                    )}
                  >
                    {m.label}
                  </button>
                </li>
              ))}
            </ul>
          </aside>

          <div className="min-w-0">
            {/* Shelves lado a lado */}
            <div className="mb-3 grid grid-cols-1 gap-3 md:grid-cols-3">
              <Shelf
                label="LINHAS"
                isOver={dragOverZone === "rows"}
                onDragOver={() => setDragOverZone("rows")}
                onDragLeave={() => setDragOverZone(null)}
                onDrop={(e) => handleDrop("rows", e)}
                isEmpty={rowDims.length === 0}
              >
                {rowDims.map((d) => (
                  <ShelfChip
                    key={d}
                    label={dimensionLabel(d)}
                    arrow={descDims.includes(d) ? "←" : "→"}
                    onArrow={() => toggleSortDirection(d)}
                    onRemove={() => removeDimension(d)}
                  />
                ))}
              </Shelf>
              <Shelf
                label="COLUNAS"
                isOver={dragOverZone === "columns"}
                onDragOver={() => setDragOverZone("columns")}
                onDragLeave={() => setDragOverZone(null)}
                onDrop={(e) => handleDrop("columns", e)}
                isEmpty={colDims.length === 0}
              >
                {colDims.map((d) => (
                  <ShelfChip
                    key={d}
                    label={dimensionLabel(d)}
                    arrow={descDims.includes(d) ? "←" : "→"}
                    onArrow={() => toggleSortDirection(d)}
                    onRemove={() => removeDimension(d)}
                  />
                ))}
              </Shelf>
              <Shelf
                label="VALORES"
                isOver={dragOverZone === "values"}
                onDragOver={() => setDragOverZone("values")}
                onDragLeave={() => setDragOverZone(null)}
                onDrop={(e) => handleDrop("values", e)}
                isEmpty={measures.length === 0}
              >
                {measures.map((m) => (
                  <ShelfChip
                    key={m}
                    label={measureLabel(m)}
                    onRemove={() => setMeasures((prev) => prev.filter((x) => x !== m))}
                  />
                ))}
              </Shelf>
            </div>

            {/* Controles */}
            <div className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-(--color-text-secondary)">
              <label className="flex items-center gap-2">
                Expandir até
                <select
                  className={controlClass}
                  value={levelsShown}
                  disabled={rowDims.length < 2}
                  onChange={(e) => {
                    setExpandTo(Number(e.target.value));
                    setToggled(new Set());
                  }}
                >
                  {(rowDims.length > 0 ? rowDims : (["category"] as DimensionKey[])).map((d, i) => (
                    <option key={d} value={i + 1}>
                      {dimensionLabel(d)}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex items-center gap-2">
                Totais
                <select className={controlClass} value={totals} onChange={(e) => setTotals(e.target.value as TotalsMode)}>
                  <option value="both">Ambos</option>
                  <option value="row">Só linha total</option>
                  <option value="column">Só coluna total</option>
                  <option value="none">Nenhum</option>
                </select>
              </label>
              <label className="flex items-center gap-2">
                Direção
                <select
                  className={controlClass}
                  value={directionFilter}
                  onChange={(e) => setDirectionFilter(e.target.value as "expense" | "income" | "all")}
                >
                  <option value="expense">Saídas</option>
                  <option value="income">Entradas</option>
                  <option value="all">Entradas e saídas</option>
                </select>
              </label>
              <span className="text-(--color-text-tertiary)">
                {visibleRows.length} linhas · {valueColumnCount} colunas de valor
              </span>
            </div>

            {/* Tabela */}
            {measures.length === 0 ? (
              <p className="py-8 text-center text-xs text-(--color-text-tertiary)">
                Arraste (ou clique em) uma medida para começar.
              </p>
            ) : (
              <div className={cn("min-w-0 overflow-x-auto rounded-md border", TONE.border)}>
                <table className="w-full border-collapse text-sm">
                  <thead>
                    {hasCols ? (
                      <>
                        <tr>
                          <th
                            rowSpan={2}
                            className={cn("border px-3 py-2 text-left align-bottom font-semibold", TONE.header, TONE.border)}
                          >
                            {rowHeaderLabel}
                          </th>
                          {columnLabels.map((c) => (
                            <th
                              key={c}
                              colSpan={measures.length}
                              className={cn("border px-3 py-2 text-center font-semibold", TONE.header, TONE.border)}
                            >
                              {c}
                            </th>
                          ))}
                          {showTotalColumn && (
                            <th
                              colSpan={measures.length}
                              className={cn("border px-3 py-2 text-center font-semibold", TONE.header, TONE.border)}
                            >
                              Total
                            </th>
                          )}
                        </tr>
                        <tr>
                          {[...columnLabels, ...(showTotalColumn ? ["__total__"] : [])].map((c) =>
                            measures.map((m) => (
                              <th
                                key={`${c}-${m}`}
                                className={cn(
                                  "border px-3 py-1.5 text-right font-mono text-xs font-semibold",
                                  TONE.header,
                                  TONE.border
                                )}
                              >
                                {measureLabel(m)}
                              </th>
                            ))
                          )}
                        </tr>
                      </>
                    ) : (
                      <tr>
                        <th className={cn("border px-3 py-2 text-left font-semibold", TONE.header, TONE.border)}>
                          {rowHeaderLabel}
                        </th>
                        {measures.map((m) => (
                          <th
                            key={m}
                            className={cn("border px-3 py-2 text-right font-mono text-xs font-semibold", TONE.header, TONE.border)}
                          >
                            {measureLabel(m)}
                          </th>
                        ))}
                      </tr>
                    )}
                  </thead>
                  <tbody>
                    {visibleRows.map((node) => {
                      const { perColumn, all } = cellsFor(node.items);
                      const canToggle = node.children.length > 0;
                      const open = canToggle && isExpanded(node);
                      return (
                        <tr key={node.path} className={cn(canToggle && "font-medium")}>
                          <td className={cn("border px-3 py-1.5", TONE.border)} style={{ paddingLeft: 12 + node.level * 18 }}>
                            {canToggle ? (
                              <button
                                type="button"
                                aria-label={open ? "Recolher" : "Expandir"}
                                aria-expanded={open}
                                onClick={() =>
                                  setToggled((prev) => {
                                    const next = new Set(prev);
                                    if (next.has(node.path)) next.delete(node.path);
                                    else next.add(node.path);
                                    return next;
                                  })
                                }
                                className="mr-1.5 inline-block w-3 text-[10px] text-(--color-text-tertiary)"
                              >
                                {open ? "▾" : "▸"}
                              </button>
                            ) : (
                              <span className="mr-1.5 inline-block w-3" />
                            )}
                            {node.label}
                          </td>
                          {perColumn.map((bucket, ci) =>
                            measures.map((m) => (
                              <td
                                key={`${ci}-${m}`}
                                className={cn("border px-3 py-1.5 text-right font-mono tabular-nums", TONE.border)}
                              >
                                {formatValue(m, aggregate(bucket, m))}
                              </td>
                            ))
                          )}
                          {showTotalColumn &&
                            measures.map((m) => (
                              <td
                                key={`t-${m}`}
                                className={cn(
                                  "border px-3 py-1.5 text-right font-mono font-semibold tabular-nums",
                                  TONE.header,
                                  TONE.border
                                )}
                              >
                                {formatValue(m, aggregate(all, m))}
                              </td>
                            ))}
                        </tr>
                      );
                    })}
                    {filtered.length === 0 && (
                      <tr>
                        <td colSpan={valueColumnCount + 1} className="px-3 py-8 text-center text-(--color-text-tertiary)">
                          Nenhuma movimentação encontrada.
                        </td>
                      </tr>
                    )}
                  </tbody>
                  {showTotalRow && filtered.length > 0 && (
                    <tfoot>
                      <tr className="font-semibold">
                        <td className={cn("border px-3 py-2", TONE.header, TONE.border)}>Total geral</td>
                        {(() => {
                          const { perColumn, all } = cellsFor(filtered);
                          return (
                            <Fragment>
                              {perColumn.map((bucket, ci) =>
                                measures.map((m) => (
                                  <td
                                    key={`${ci}-${m}`}
                                    className={cn("border px-3 py-2 text-right font-mono tabular-nums", TONE.header, TONE.border)}
                                  >
                                    {formatValue(m, aggregate(bucket, m))}
                                  </td>
                                ))
                              )}
                              {showTotalColumn &&
                                measures.map((m) => (
                                  <td
                                    key={`t-${m}`}
                                    className={cn("border px-3 py-2 text-right font-mono tabular-nums", TONE.header, TONE.border)}
                                  >
                                    {formatValue(m, aggregate(all, m))}
                                  </td>
                                ))}
                            </Fragment>
                          );
                        })()}
                      </tr>
                    </tfoot>
                  )}
                </table>
              </div>
            )}
          </div>
        </div>
      )}
    </Card>
  );
}

function Shelf({
  label,
  isOver,
  isEmpty,
  onDragOver,
  onDragLeave,
  onDrop,
  children,
}: {
  label: string;
  isOver: boolean;
  isEmpty: boolean;
  onDragOver: () => void;
  onDragLeave: () => void;
  onDrop: (e: React.DragEvent) => void;
  children: React.ReactNode;
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
        "flex min-h-14 flex-col gap-1.5 rounded-(--radius-lg) border p-2.5 transition-colors",
        isOver ? "border-(--color-primary) bg-(--color-primary-soft)/40" : cn("border-dashed", TONE.border)
      )}
    >
      <span className="text-[11px] font-semibold tracking-wider text-(--color-text-secondary)">{label}</span>
      <div className="flex flex-wrap gap-1.5">
        {children}
        {isEmpty && <span className="text-xs text-(--color-text-tertiary)">Solte um campo aqui</span>}
      </div>
    </div>
  );
}

function ShelfChip({
  label,
  arrow,
  onArrow,
  onRemove,
}: {
  label: string;
  arrow?: string;
  onArrow?: () => void;
  onRemove: () => void;
}) {
  return (
    <span className={cn("inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium", TONE.chip)}>
      {label}
      {arrow && (
        <button
          type="button"
          onClick={onArrow}
          aria-label={arrow === "→" ? "Ordem crescente (clique para inverter)" : "Ordem decrescente (clique para inverter)"}
          title={arrow === "→" ? "Ordem crescente" : "Ordem decrescente"}
          className="text-(--color-text-secondary) hover:text-(--color-text-primary)"
        >
          {arrow}
        </button>
      )}
      <button
        type="button"
        onClick={onRemove}
        aria-label={`Remover ${label}`}
        className="text-(--color-text-tertiary) hover:text-(--color-negative)"
      >
        ×
      </button>
    </span>
  );
}
