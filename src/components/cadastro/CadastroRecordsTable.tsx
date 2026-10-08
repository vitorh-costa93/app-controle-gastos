"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArrowDown, ArrowUp, ArrowUpDown, Pencil, Trash2 } from "lucide-react";
import { MonthRow } from "@/lib/domain/month-rows";
import { Person, Category, TransactionType } from "@/types/db";
import { formatCurrencyBRL, formatDateTimeBR, formatReferenceMonthShort } from "@/lib/utils/format";
import { setTransactionConsidered } from "@/lib/data/transactions";
import { cn } from "@/lib/utils/cn";
import { Button } from "@/components/ui/Button";
import { Toggle } from "@/components/ui/Toggle";
import { FilterButton, RangeFilter, RangeFilterPanel, TextFilter, ValuesFilter } from "@/components/analise/filter-popup";
import { DeleteRecordDialog, DeleteTarget, deleteTargetFor } from "./DeleteRecordDialog";
import { BulkEditDialog } from "./BulkEditDialog";

const COLUMNS = [
  ["date", "Data"], ["created", "Criado em"], ["month", "Mês ref."],
  ["person", "Origem"], ["direction", "Direção"], ["fixed", "Fixo / variável"],
  ["type", "Tipo"], ["bank", "Banco"], ["category", "Categoria"],
  ["description", "Descrição"], ["kind", "Natureza"], ["installment", "Parcela"],
  ["amount", "Valor"], ["considered", "Considerado"],
] as const;
type Column = typeof COLUMNS[number][0];
type Values = Record<Column, string>;
/** Larguras proporcionais (somam 100%) para a tabela caber no container sem rolagem horizontal. */
const COLUMN_WIDTHS: Record<Column, string> = {
  date: "6.5%", created: "6.5%", month: "5%", person: "6%", direction: "5.5%", fixed: "6%", type: "6.5%",
  bank: "6%", category: "7.5%", description: "10.5%", kind: "7%", installment: "5%", amount: "7%", considered: "6.5%",
};
const selectable = (row: MonthRow) => row.occurrence.origin === "real" || Boolean(row.occurrence.recurrenceRuleId);
const controlClass = "h-9 w-full rounded-(--radius-md) border border-(--color-border) bg-(--color-surface) px-2 text-sm";
const RIGHT_ALIGNED: readonly Column[] = ["description", "kind", "installment", "amount", "considered"];

export function CadastroRecordsTable({ rows, people, categories, types, onEdit }: {
  rows: MonthRow[];
  people: Person[];
  categories: Category[];
  types: TransactionType[];
  onEdit: (row: MonthRow) => void;
}) {
  const router = useRouter();
  // Mesma semântica da Análise: OR dentro da coluna (valores marcados), AND entre colunas.
  const [valueFilters, setValueFilters] = useState<Partial<Record<Column, Set<string>>>>({});
  const [description, setDescription] = useState("");
  const [range, setRange] = useState<RangeFilter>({ min: "", max: "" });
  const [openFilter, setOpenFilter] = useState<Column | null>(null);
  const [sort, setSort] = useState<{ column: Column; ascending: boolean } | null>({ column: "created", ascending: false });
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkOpen, setBulkOpen] = useState(false);
  const [consideredOverrides, setConsideredOverrides] = useState<Record<string, { value: boolean; updatedAt?: string }>>({});
  const entries = useMemo(() => {
    const peopleNames = new Map(people.map((p) => [p.id, p.name]));
    const categoryNames = new Map(categories.map((c) => [c.id, c.name]));
    const typeNames = new Map(types.map((t) => [t.id, t.name]));
    return rows.map((sourceRow) => {
      const override = consideredOverrides[sourceRow.key];
      const row = !override || override.updatedAt !== sourceRow.transaction?.updatedAt ? sourceRow : { ...sourceRow, occurrence: { ...sourceRow.occurrence, considered: override.value } };
      const o = row.occurrence;
      const values: Values = {
        date: o.registrationDate.split("-").reverse().join("/"),
        created: row.transaction ? formatDateTimeBR(row.transaction.createdAt) : "—",
        month: formatReferenceMonthShort(o.referenceMonth),
        person: peopleNames.get(o.personId) ?? "—",
        direction: o.direction === "income" ? "Entrada" : "Saída",
        fixed: o.fixedVariable === "fixed" ? "Fixo" : "Variável",
        type: o.typeId ? typeNames.get(o.typeId) ?? "—" : "—",
        bank: o.bank === "picpay" ? "PicPay" : o.bank === "nubank" ? "Nubank" : "Não informado",
        category: o.categoryId ? categoryNames.get(o.categoryId) ?? "—" : "—",
        description: o.description ?? "—",
        kind: row.kind === "pontual" ? "Pontual" : row.kind === "parcelado" ? "Parcelado" : "Recorrente",
        installment: `${o.installmentCurrent}/${o.installmentTotal}`,
        amount: formatCurrencyBRL(o.amountCents),
        considered: o.considered ? "Sim" : "Não",
      };
      // "Criado em" filtra pela data (sem a hora) para não gerar uma opção por minuto.
      const filterValues: Values = { ...values, created: values.created.split(" ")[0] };
      return { row, values, filterValues };
    });
  }, [rows, people, categories, types, consideredOverrides]);
  const optionsByColumn = useMemo(() => {
    const result: Partial<Record<Column, string[]>> = {};
    for (const [column] of COLUMNS) {
      if (column === "description" || column === "amount") continue;
      const set = new Set<string>();
      for (const entry of entries) set.add(entry.filterValues[column]);
      result[column] = Array.from(set).sort((a, b) => a.localeCompare(b, "pt-BR", { numeric: true }));
    }
    return result;
  }, [entries]);
  const filtered = useMemo(() => {
    const minCents = range.min ? Math.round(Number(range.min) * 100) : null;
    const maxCents = range.max ? Math.round(Number(range.max) * 100) : null;
    const descQuery = description.trim().toLowerCase();
    const result = entries.filter(({ row, filterValues }) => {
      for (const [column, chosen] of Object.entries(valueFilters)) {
        if (chosen && chosen.size > 0 && !chosen.has(filterValues[column as Column])) return false;
      }
      if (descQuery && !(row.occurrence.description ?? "").toLowerCase().includes(descQuery)) return false;
      if (minCents !== null && row.occurrence.amountCents < minCents) return false;
      if (maxCents !== null && row.occurrence.amountCents > maxCents) return false;
      return true;
    });
    if (!sort) return result;
    return [...result].sort((a, b) => {
      const column = sort.column;
      const value = (entry: typeof a): string | number => {
        const o = entry.row.occurrence;
        if (column === "amount") return o.amountCents;
        if (column === "date") return o.registrationDate;
        if (column === "created") return entry.row.transaction?.createdAt ?? "";
        if (column === "month") return o.referenceMonth;
        if (column === "installment") return o.installmentCurrent;
        return entry.values[column];
      };
      const av = value(a), bv = value(b);
      const comparison = typeof av === "number" && typeof bv === "number" ? av - bv : String(av).localeCompare(String(bv), "pt-BR", { numeric: true });
      return (sort.ascending ? comparison : -comparison) || a.row.key.localeCompare(b.row.key);
    });
  }, [entries, valueFilters, description, range, sort]);
  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const visible = filtered.slice((currentPage - 1) * pageSize, currentPage * pageSize);
  const eligible = filtered.filter(({ row }) => selectable(row));
  const allSelected = eligible.length > 0 && eligible.every(({ row }) => selected.has(row.key));
  const selectedRows = entries.filter(({ row }) => selected.has(row.key) && selectable(row));

  function toggleValue(column: Column, value: string) {
    setPage(1);
    setValueFilters((previous) => {
      const next = new Set(previous[column] ?? []);
      if (next.has(value)) next.delete(value); else next.add(value);
      return { ...previous, [column]: next };
    });
  }
  function clearColumn(column: Column) {
    setPage(1);
    if (column === "description") setDescription("");
    else if (column === "amount") setRange({ min: "", max: "" });
    else setValueFilters((previous) => ({ ...previous, [column]: new Set() }));
  }
  function isActive(column: Column): boolean {
    if (column === "description") return description.trim() !== "";
    if (column === "amount") return range.min !== "" || range.max !== "";
    return (valueFilters[column]?.size ?? 0) > 0;
  }
  const hasAnyFilter = COLUMNS.some(([column]) => isActive(column));
  function clearAllFilters() {
    setPage(1);
    setValueFilters({});
    setDescription("");
    setRange({ min: "", max: "" });
  }
  // Três estados, como na Análise: crescente → decrescente → sem ordenação.
  function changeSort(column: Column) {
    setPage(1);
    setSort((previous) => {
      if (!previous || previous.column !== column) return { column, ascending: true };
      if (previous.ascending) return { column, ascending: false };
      return null;
    });
  }
  function toggleSelection(key: string) {
    setSelected((previous) => {
      const next = new Set(previous);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  }
  function filterControl(column: Column, align: "left" | "right") {
    return <FilterButton
      active={isActive(column)}
      open={openFilter === column}
      onToggle={() => setOpenFilter((current) => (current === column ? null : column))}
      onClose={() => setOpenFilter(null)}
      align={align}
    >
      {column === "description" ? <TextFilter value={description} onChange={(value) => { setPage(1); setDescription(value); }} onClear={() => clearColumn(column)} />
        : column === "amount" ? <RangeFilterPanel value={range} onChange={(value) => { setPage(1); setRange(value); }} onClear={() => clearColumn(column)} />
        : <ValuesFilter options={optionsByColumn[column] ?? []} selected={valueFilters[column] ?? new Set()} onToggle={(value) => toggleValue(column, value)} onClear={() => clearColumn(column)} />}
    </FilterButton>;
  }
  const consideredChanged = (row: MonthRow) => (value: boolean) => setConsideredOverrides((previous) => ({ ...previous, [row.key]: { value, updatedAt: row.transaction?.updatedAt } }));

  return <div className="space-y-3">
    <div className="flex flex-wrap items-center gap-2 text-sm">
      <label className="flex items-center gap-2"><input type="checkbox" checked={allSelected} disabled={!eligible.length} onChange={() => setSelected((previous) => {
        const next = new Set(previous);
        for (const { row } of eligible) { if (allSelected) next.delete(row.key); else next.add(row.key); }
        return next;
      })} />Selecionar todos os resultados ({eligible.length})</label>
      <Button size="sm" disabled={!selectedRows.length} onClick={() => setBulkOpen(true)}>Editar em lote ({selectedRows.length})</Button>
      {selected.size > 0 && <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())}>Limpar seleção</Button>}
      {hasAnyFilter && <Button size="sm" variant="ghost" onClick={clearAllFilters}>Limpar filtros</Button>}
      <span className="ml-auto text-xs text-(--color-text-tertiary)">{filtered.length} de {entries.length}</span>
    </div>
    <p className="text-xs text-(--color-text-secondary)">A edição em lote altera somente os registros e meses selecionados; outros meses são preservados. Projeções recorrentes podem ser selecionadas. Cálculos sem lançamento ou regra não podem.</p>
    <details className="rounded-(--radius-md) border border-(--color-border) p-3 md:hidden">
      <summary className="cursor-pointer text-sm font-medium">Filtros e ordenação de todas as colunas</summary>
      <div className="mt-3 grid grid-cols-2 gap-3">
        {COLUMNS.map(([column, label], index) => <div key={column} className="flex items-center justify-between rounded-(--radius-md) border border-(--color-border) px-2 py-1 text-xs">
          <span>{label}</span>{filterControl(column, index % 2 === 0 ? "left" : "right")}
        </div>)}
        <label className="text-xs">Ordenar por<select className={controlClass} value={sort?.column ?? ""} onChange={(event) => { setSort(event.target.value ? { column: event.target.value as Column, ascending: sort?.ascending ?? true } : null); setPage(1); }}><option value="">Sem ordenação</option>{COLUMNS.map(([column, label]) => <option key={column} value={column}>{label}</option>)}</select></label>
        <Button size="sm" variant="secondary" disabled={!sort} onClick={() => sort && changeSort(sort.column)}>{!sort ? "Sem ordenação" : sort.ascending ? "Crescente ↑" : "Decrescente ↓"}</Button>
      </div>
    </details>
    <div className="overflow-hidden rounded-(--radius-lg) border border-(--color-border) bg-(--color-surface)">
      <div className="hidden md:block">
        <table className="w-full table-fixed text-xs">
          <colgroup>
            <col style={{ width: "2.5%" }} />
            {COLUMNS.map(([column]) => <col key={column} style={{ width: COLUMN_WIDTHS[column] }} />)}
            <col style={{ width: "6%" }} />
          </colgroup>
          <thead><tr className="border-b border-(--color-border) text-left text-(--color-text-tertiary)">
            <th className="px-1.5 py-2"><span className="sr-only">Selecionar</span></th>
            {COLUMNS.map(([column, label]) => {
              const sortedHere = sort?.column === column;
              const SortIcon = !sortedHere ? ArrowUpDown : sort.ascending ? ArrowUp : ArrowDown;
              return <th key={column} className="px-1.5 py-2 align-top font-medium" aria-sort={sortedHere ? sort.ascending ? "ascending" : "descending" : "none"}>
                <div className="flex flex-wrap items-center gap-0.5">
                  <button type="button" onClick={() => changeSort(column)} className={cn("inline-flex items-center gap-0.5 text-left hover:text-(--color-text-primary)", sortedHere && "text-(--color-text-primary)")}>
                    {label}
                    <SortIcon size={11} className={sortedHere ? "" : "opacity-40"} />
                  </button>
                  {filterControl(column, RIGHT_ALIGNED.includes(column) ? "right" : "left")}
                </div>
              </th>;
            })}
            <th className="px-1.5 py-2 font-medium">Ações</th>
          </tr></thead>
          <tbody>{visible.map(({ row, values }) => <tr key={row.key} className="border-t border-(--color-border)">
            <td className="px-1.5 py-2"><input type="checkbox" aria-label={`Selecionar ${row.occurrence.description ?? "lançamento"}`} disabled={!selectable(row)} checked={selected.has(row.key)} onChange={() => toggleSelection(row.key)} /></td>
            {COLUMNS.map(([column]) => <td key={column} className={cn("px-1.5 py-2 align-top", column === "description" || column === "category" || column === "type" ? "break-words" : "")} title={values[column]}>{column === "considered" ? <RecordConsidered row={row} onChanged={consideredChanged(row)} /> : values[column]}</td>)}
            <td className="px-1.5 py-2"><RecordActions row={row} onEdit={() => onEdit(row)} /></td>
          </tr>)}</tbody>
        </table>
      </div>
      <div className="divide-y divide-(--color-border) md:hidden">{visible.map(({ row, values }) => <article key={row.key} className="space-y-2 p-3">
        <label className="flex items-center gap-2 font-medium"><input type="checkbox" aria-label={`Selecionar ${values.description}`} disabled={!selectable(row)} checked={selected.has(row.key)} onChange={() => toggleSelection(row.key)} />{values.description}</label>
        <dl className="grid grid-cols-2 gap-2 text-xs">{COLUMNS.filter(([column]) => column !== "description").map(([column, label]) => <div key={column}><dt className="text-(--color-text-secondary)">{label}</dt><dd>{column === "considered" ? <RecordConsidered row={row} onChanged={consideredChanged(row)} /> : values[column]}</dd></div>)}</dl>
        <RecordActions row={row} onEdit={() => onEdit(row)} />
      </article>)}</div>
      {!filtered.length && <p className="p-6 text-center text-sm">Nenhum lançamento encontrado com esses filtros.</p>}
    </div>
    {filtered.length > 0 && <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-(--color-text-secondary)">
      <span>{(currentPage - 1) * pageSize + 1}–{Math.min(currentPage * pageSize, filtered.length)} de {filtered.length}</span>
      <div className="flex items-center gap-3">
        <label className="flex items-center gap-1.5">Linhas por página
          <select className="h-7 rounded-(--radius-sm) border border-(--color-border) bg-(--color-surface) px-1.5 text-xs" value={pageSize} onChange={(event) => { setPageSize(Number(event.target.value)); setPage(1); }}>
            {[10, 25, 50, 100].map((n) => <option key={n} value={n}>{n}</option>)}
          </select>
        </label>
        <button type="button" disabled={currentPage <= 1} onClick={() => setPage(currentPage - 1)} className="h-7 rounded-(--radius-sm) border border-(--color-border) px-2.5 hover:bg-(--color-surface-secondary) disabled:opacity-40">Anterior</button>
        <span className="tabular-nums">Página {currentPage} de {totalPages}</span>
        <button type="button" disabled={currentPage >= totalPages} onClick={() => setPage(currentPage + 1)} className="h-7 rounded-(--radius-sm) border border-(--color-border) px-2.5 hover:bg-(--color-surface-secondary) disabled:opacity-40">Próxima</button>
      </div>
    </div>}
    {bulkOpen && <BulkEditDialog occurrences={selectedRows.map(({ row }) => row.occurrence)} people={people} categories={categories} types={types} onClose={() => setBulkOpen(false)} onSaved={() => { setBulkOpen(false); setSelected(new Set()); setConsideredOverrides({}); router.refresh(); }} />}
  </div>;
}

function RecordConsidered({ row, onChanged }: { row: MonthRow; onChanged: (value: boolean) => void }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  if (!row.transaction) return <span>{row.occurrence.considered ? "Sim" : "Não"} (projeção)</span>;
  return <><Toggle checked={row.occurrence.considered} disabled={pending} ariaLabel="Considerar lançamento" onChange={(value) => {
    setError(null);
    startTransition(async () => {
      try {
        const result = await setTransactionConsidered(row.transaction!.id, value);
        if (result.ok) onChanged(value); else setError("Não foi possível salvar.");
      } catch { setError("Não foi possível salvar."); }
    });
  }} />{error && <span role="alert" className="text-xs text-(--color-negative)">{error}</span>}</>;
}

function RecordActions({ row, onEdit }: { row: MonthRow; onEdit: () => void }) {
  const [target, setTarget] = useState<DeleteTarget | null>(null);
  const deleteTarget = deleteTargetFor(row.occurrence, row.transaction);
  return <div className="flex items-center gap-0.5">
    <button className="rounded-full p-1.5 hover:bg-black/5" aria-label="Editar lançamento" onClick={onEdit}><Pencil size={15} /></button>
    {deleteTarget && <button className="rounded-full p-1.5 hover:bg-black/5" aria-label="Excluir lançamento" onClick={() => setTarget(deleteTarget)}><Trash2 size={15} /></button>}
    <DeleteRecordDialog target={target} onClose={() => setTarget(null)} />
  </div>;
}
