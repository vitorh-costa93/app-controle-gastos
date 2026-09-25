"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowDown, ArrowUp, ArrowUpDown, ListFilter } from "lucide-react";
import { MonthlyOccurrence } from "@/types/domain";
import { Person, Category, TransactionType } from "@/types/db";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { formatCurrencyBRL, formatDateBR, formatReferenceMonthShort } from "@/lib/utils/format";
import { cn } from "@/lib/utils/cn";

type ColumnKey =
  | "date"
  | "person"
  | "direction"
  | "fixedVariable"
  | "type"
  | "category"
  | "description"
  | "installment"
  | "amount"
  | "considered";

type FilterKind = "values" | "text" | "range" | null;

interface ColumnDef {
  key: ColumnKey;
  label: string;
  filter: FilterKind;
  align?: "left" | "right" | "center";
}

const COLUMNS: ColumnDef[] = [
  { key: "date", label: "Data cadastro", filter: null },
  { key: "person", label: "Origem", filter: "values" },
  { key: "direction", label: "Direção", filter: "values" },
  { key: "fixedVariable", label: "Fixo/Variável", filter: "values" },
  { key: "type", label: "Tipo", filter: "values" },
  { key: "category", label: "Categoria", filter: "values" },
  { key: "description", label: "Descrição", filter: "text" },
  { key: "installment", label: "Parcela", filter: null },
  { key: "amount", label: "Valor", filter: "range", align: "right" },
  { key: "considered", label: "Considerado", filter: "values", align: "center" },
];

interface Sort {
  key: ColumnKey;
  dir: "asc" | "desc";
}

interface RangeFilter {
  min: string;
  max: string;
}

export function AnaliseTransactionsTable({
  transactions,
  people,
  categories,
  types,
}: {
  transactions: MonthlyOccurrence[];
  people: Person[];
  categories: Category[];
  types: TransactionType[];
}) {
  // Filtros de valores: coluna → conjunto de valores marcados (vazio = sem filtro naquela coluna).
  const [valueFilters, setValueFilters] = useState<Partial<Record<ColumnKey, Set<string>>>>({});
  const [description, setDescription] = useState("");
  const [range, setRange] = useState<RangeFilter>({ min: "", max: "" });
  const [sort, setSort] = useState<Sort | null>(null);
  const [openFilter, setOpenFilter] = useState<ColumnKey | null>(null);

  const peopleById = useMemo(() => new Map(people.map((p) => [p.id, p])), [people]);
  const categoriesById = useMemo(() => new Map(categories.map((c) => [c.id, c])), [categories]);
  const typesById = useMemo(() => new Map(types.map((t) => [t.id, t])), [types]);

  /** Texto exibido (e usado como valor de filtro/ordenação) de cada coluna de dimensão. */
  function labelOf(key: ColumnKey, t: MonthlyOccurrence): string {
    switch (key) {
      case "person":
        return peopleById.get(t.personId)?.name ?? "—";
      case "direction":
        return t.direction === "income" ? "Entrada" : "Saída";
      case "fixedVariable":
        return t.fixedVariable === "fixed" ? "Fixo" : "Variável";
      case "type":
        return (t.typeId && typesById.get(t.typeId)?.name) || "—";
      case "category":
        return (t.categoryId && categoriesById.get(t.categoryId)?.name) || "—";
      case "considered":
        return t.considered ? "Sim" : "Não";
      case "description":
        return t.description ?? "";
      default:
        return "";
    }
  }

  const optionsByColumn = useMemo(() => {
    const result: Partial<Record<ColumnKey, string[]>> = {};
    for (const col of COLUMNS) {
      if (col.filter !== "values") continue;
      const set = new Set<string>();
      for (const t of transactions) set.add(labelOf(col.key, t));
      result[col.key] = Array.from(set).sort((a, b) => a.localeCompare(b, "pt-BR"));
    }
    return result;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [transactions, peopleById, categoriesById, typesById]);

  const filtered = useMemo(() => {
    const minCents = range.min ? Math.round(Number(range.min) * 100) : null;
    const maxCents = range.max ? Math.round(Number(range.max) * 100) : null;
    const descQuery = description.trim().toLowerCase();

    const rows = transactions.filter((t) => {
      for (const [key, selected] of Object.entries(valueFilters)) {
        if (selected && selected.size > 0 && !selected.has(labelOf(key as ColumnKey, t))) return false;
      }
      if (descQuery && !(t.description ?? "").toLowerCase().includes(descQuery)) return false;
      if (minCents !== null && t.amountCents < minCents) return false;
      if (maxCents !== null && t.amountCents > maxCents) return false;
      return true;
    });

    if (!sort) return rows;
    const factor = sort.dir === "asc" ? 1 : -1;
    return [...rows].sort((a, b) => factor * compare(sort.key, a, b));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [transactions, valueFilters, description, range, sort, peopleById, categoriesById, typesById]);

  function compare(key: ColumnKey, a: MonthlyOccurrence, b: MonthlyOccurrence): number {
    switch (key) {
      case "date":
        return a.registrationDate.localeCompare(b.registrationDate);
      case "amount":
        return a.amountCents - b.amountCents;
      case "installment":
        return a.installmentCurrent - b.installmentCurrent || a.installmentTotal - b.installmentTotal;
      default:
        return labelOf(key, a).localeCompare(labelOf(key, b), "pt-BR", { sensitivity: "base" });
    }
  }

  function toggleSort(key: ColumnKey) {
    setSort((prev) => {
      if (!prev || prev.key !== key) return { key, dir: "asc" };
      if (prev.dir === "asc") return { key, dir: "desc" };
      return null;
    });
  }

  function toggleValue(key: ColumnKey, value: string) {
    setValueFilters((prev) => {
      const next = new Set(prev[key] ?? []);
      if (next.has(value)) next.delete(value);
      else next.add(value);
      return { ...prev, [key]: next };
    });
  }

  function clearColumn(key: ColumnKey) {
    if (key === "description") setDescription("");
    else if (key === "amount") setRange({ min: "", max: "" });
    else setValueFilters((prev) => ({ ...prev, [key]: new Set() }));
  }

  function isActive(key: ColumnKey): boolean {
    if (key === "description") return description.trim() !== "";
    if (key === "amount") return range.min !== "" || range.max !== "";
    return (valueFilters[key]?.size ?? 0) > 0;
  }

  const hasAnyFilter = COLUMNS.some((c) => c.filter && isActive(c.key));

  return (
    <Card className="min-w-0 p-5">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-[15px] font-semibold">Todas as movimentações do mês</h3>
        <div className="flex items-center gap-3">
          {hasAnyFilter && (
            <button
              type="button"
              onClick={() => {
                setValueFilters({});
                setDescription("");
                setRange({ min: "", max: "" });
              }}
              className="text-xs text-(--color-primary) hover:underline"
            >
              Limpar filtros
            </button>
          )}
          <span className="text-xs text-(--color-text-tertiary)">
            {filtered.length} de {transactions.length}
          </span>
        </div>
      </div>

      <div className="min-w-0 overflow-x-auto">
        <table className="w-full min-w-[900px] text-sm">
          <thead>
            <tr className="border-b border-(--color-border) text-left text-xs text-(--color-text-tertiary)">
              {COLUMNS.map((col) => {
                const sortedHere = sort?.key === col.key;
                const SortIcon = !sortedHere ? ArrowUpDown : sort.dir === "asc" ? ArrowUp : ArrowDown;
                return (
                  <th
                    key={col.key}
                    aria-sort={sortedHere ? (sort.dir === "asc" ? "ascending" : "descending") : "none"}
                    className={cn(
                      "px-3 py-2 font-medium",
                      col.align === "right" && "text-right",
                      col.align === "center" && "text-center"
                    )}
                  >
                    <div
                      className={cn(
                        "relative inline-flex items-center gap-1",
                        col.align === "right" && "flex-row-reverse"
                      )}
                    >
                      <button
                        type="button"
                        onClick={() => toggleSort(col.key)}
                        className={cn(
                          "inline-flex items-center gap-1 hover:text-(--color-text-primary)",
                          sortedHere && "text-(--color-text-primary)"
                        )}
                      >
                        {col.label}
                        <SortIcon size={12} className={sortedHere ? "" : "opacity-40"} />
                      </button>
                      {col.filter && (
                        <FilterButton
                          active={isActive(col.key)}
                          open={openFilter === col.key}
                          onToggle={() => setOpenFilter((cur) => (cur === col.key ? null : col.key))}
                          onClose={() => setOpenFilter(null)}
                          align={col.align === "right" || col.key === "considered" ? "right" : "left"}
                        >
                          {col.filter === "values" && (
                            <ValuesFilter
                              options={optionsByColumn[col.key] ?? []}
                              selected={valueFilters[col.key] ?? new Set()}
                              onToggle={(v) => toggleValue(col.key, v)}
                              onClear={() => clearColumn(col.key)}
                            />
                          )}
                          {col.filter === "text" && (
                            <TextFilter value={description} onChange={setDescription} onClear={() => clearColumn(col.key)} />
                          )}
                          {col.filter === "range" && (
                            <RangeFilterPanel value={range} onChange={setRange} onClear={() => clearColumn(col.key)} />
                          )}
                        </FilterButton>
                      )}
                    </div>
                  </th>
                );
              })}
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
                    {t.origin === "projected" && (
                      <span className="ml-1.5 text-[11px] text-(--color-text-tertiary)">· recorrente</span>
                    )}
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
                <td colSpan={COLUMNS.length} className="px-3 py-8 text-center text-(--color-text-tertiary)">
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

/** Ícone de filtro que abre um popup ancorado na coluna; fecha ao clicar fora ou apertar Esc. */
function FilterButton({
  active,
  open,
  onToggle,
  onClose,
  align,
  children,
}: {
  active: boolean;
  open: boolean;
  onToggle: () => void;
  onClose: () => void;
  align: "left" | "right";
  children: React.ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number }>({ top: 0, left: 0 });

  // O popup usa position: fixed (calculada a partir do botão) porque a tabela fica dentro de um
  // contêiner com overflow-x: auto, que cortaria um popup absoluto quando houver poucas linhas.
  useEffect(() => {
    if (!open || !buttonRef.current) return;
    const rect = buttonRef.current.getBoundingClientRect();
    const width = 224;
    const left = align === "right" ? rect.right - width : rect.left;
    setPos({ top: rect.bottom + 4, left: Math.max(8, Math.min(left, window.innerWidth - width - 8)) });
  }, [open, align]);

  useEffect(() => {
    if (!open) return;
    // Rolagem dentro do próprio popup (lista longa) não deve fechá-lo.
    function onScroll(e: Event) {
      if (ref.current && e.target instanceof Node && ref.current.contains(e.target)) return;
      onClose();
    }
    window.addEventListener("resize", onClose);
    window.addEventListener("scroll", onScroll, true);
    return () => {
      window.removeEventListener("resize", onClose);
      window.removeEventListener("scroll", onScroll, true);
    };
  }, [open, onClose]);

  useEffect(() => {
    if (!open) return;
    function onPointerDown(e: PointerEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open, onClose]);

  return (
    <div ref={ref} className="relative">
      <button
        ref={buttonRef}
        type="button"
        aria-label="Filtrar coluna"
        aria-expanded={open}
        onClick={onToggle}
        className={cn(
          "grid h-6 w-6 place-items-center rounded-md hover:bg-(--color-surface-secondary)",
          active ? "text-(--color-primary)" : "text-(--color-text-tertiary)"
        )}
      >
        <ListFilter size={13} />
        {active && <span className="absolute right-0.5 top-0.5 h-1.5 w-1.5 rounded-full bg-(--color-primary)" />}
      </button>
      {open && (
        <div
          style={{ top: pos.top, left: pos.left }}
          className="fixed z-20 w-56 rounded-(--radius-lg) border border-(--color-border) bg-(--color-surface) p-2 text-left text-sm font-normal text-(--color-text-primary) shadow-(--shadow-md)"
        >
          {children}
        </div>
      )}
    </div>
  );
}

function ValuesFilter({
  options,
  selected,
  onToggle,
  onClear,
}: {
  options: string[];
  selected: Set<string>;
  onToggle: (value: string) => void;
  onClear: () => void;
}) {
  return (
    <div>
      <ul className="max-h-56 overflow-y-auto">
        {options.map((option) => (
          <li key={option}>
            <label className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-xs hover:bg-(--color-surface-secondary)">
              <input type="checkbox" checked={selected.has(option)} onChange={() => onToggle(option)} />
              <span className="truncate">{option}</span>
            </label>
          </li>
        ))}
      </ul>
      <ClearRow disabled={selected.size === 0} onClear={onClear} />
    </div>
  );
}

function TextFilter({
  value,
  onChange,
  onClear,
}: {
  value: string;
  onChange: (value: string) => void;
  onClear: () => void;
}) {
  return (
    <div>
      <input
        autoFocus
        type="text"
        placeholder="Buscar na descrição..."
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-8 w-full rounded-(--radius-sm) border border-(--color-border) bg-(--color-surface) px-2 text-xs"
      />
      <ClearRow disabled={value === ""} onClear={onClear} />
    </div>
  );
}

function RangeFilterPanel({
  value,
  onChange,
  onClear,
}: {
  value: RangeFilter;
  onChange: (value: RangeFilter) => void;
  onClear: () => void;
}) {
  const inputClass =
    "h-8 w-full rounded-(--radius-sm) border border-(--color-border) bg-(--color-surface) px-2 text-xs";
  return (
    <div>
      <div className="flex gap-1.5">
        <input
          autoFocus
          type="number"
          placeholder="mín"
          className={inputClass}
          value={value.min}
          onChange={(e) => onChange({ ...value, min: e.target.value })}
        />
        <input
          type="number"
          placeholder="máx"
          className={inputClass}
          value={value.max}
          onChange={(e) => onChange({ ...value, max: e.target.value })}
        />
      </div>
      <ClearRow disabled={value.min === "" && value.max === ""} onClear={onClear} />
    </div>
  );
}

function ClearRow({ disabled, onClear }: { disabled: boolean; onClear: () => void }) {
  return (
    <div className="mt-2 flex justify-end border-t border-(--color-border) pt-2">
      <button
        type="button"
        disabled={disabled}
        onClick={onClear}
        className="text-xs text-(--color-primary) hover:underline disabled:text-(--color-text-tertiary) disabled:no-underline"
      >
        Limpar
      </button>
    </div>
  );
}
