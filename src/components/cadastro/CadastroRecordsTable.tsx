"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Pencil, Trash2 } from "lucide-react";
import { MonthRow } from "@/lib/domain/month-rows";
import { Person, Category, TransactionType } from "@/types/db";
import { formatCurrencyBRL, formatDateTimeBR, formatReferenceMonthShort } from "@/lib/utils/format";
import { setTransactionConsidered } from "@/lib/data/transactions";
import { Button } from "@/components/ui/Button";
import { Toggle } from "@/components/ui/Toggle";
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
const normalize = (value: string) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("pt-BR");
const selectable = (row: MonthRow) => row.occurrence.origin === "real" || Boolean(row.occurrence.recurrenceRuleId);
const controlClass = "h-9 w-full rounded-(--radius-md) border border-(--color-border) bg-(--color-surface) px-2 text-sm";

export function CadastroRecordsTable({ rows, people, categories, types, onEdit }: {
  rows: MonthRow[];
  people: Person[];
  categories: Category[];
  types: TransactionType[];
  onEdit: (row: MonthRow) => void;
}) {
  const router = useRouter();
  const [filters, setFilters] = useState<Partial<Values>>({});
  const [sort, setSort] = useState<{ column: Column; ascending: boolean }>({ column: "created", ascending: false });
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkOpen, setBulkOpen] = useState(false);
  const [consideredOverrides, setConsideredOverrides] = useState<Record<string, { value: boolean; updatedAt?: string }>>({});
  const pageSize = 20;
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
      return { row, values };
    });
  }, [rows, people, categories, types, consideredOverrides]);
  const filtered = entries.filter(({ row, values }) => COLUMNS.every(([column]) => {
    const query = normalize(filters[column]?.trim() ?? "");
    const extra = column === "date" ? row.occurrence.registrationDate : column === "month" ? row.occurrence.referenceMonth : column === "created" ? row.transaction?.createdAt ?? "" : "";
    return !query || normalize(`${values[column]} ${extra}`).includes(query);
  })).sort((a, b) => {
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
  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const visible = filtered.slice((currentPage - 1) * pageSize, currentPage * pageSize);
  const eligible = filtered.filter(({ row }) => selectable(row));
  const allSelected = eligible.length > 0 && eligible.every(({ row }) => selected.has(row.key));
  const selectedRows = entries.filter(({ row }) => selected.has(row.key) && selectable(row));

  function changeFilter(column: Column, value: string) {
    setFilters((previous) => ({ ...previous, [column]: value }));
    setPage(1);
  }
  function changeSort(column: Column) {
    setSort((previous) => ({ column, ascending: previous.column === column ? !previous.ascending : true }));
    setPage(1);
  }
  function toggleSelection(key: string) {
    setSelected((previous) => {
      const next = new Set(previous);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  }
  function filterInput(column: Column, label: string) {
    return <input className={controlClass} aria-label={`Filtrar ${label}`} placeholder={`Filtrar ${label}`} value={filters[column] ?? ""} onChange={(event) => changeFilter(column, event.target.value)} />;
  }

  return <div className="space-y-3">
    <div className="flex flex-wrap items-center gap-2 text-sm">
      <label className="flex items-center gap-2"><input type="checkbox" checked={allSelected} disabled={!eligible.length} onChange={() => setSelected((previous) => {
        const next = new Set(previous);
        for (const { row } of eligible) { if (allSelected) next.delete(row.key); else next.add(row.key); }
        return next;
      })} />Selecionar todos os resultados ({eligible.length})</label>
      <Button size="sm" disabled={!selectedRows.length} onClick={() => setBulkOpen(true)}>Editar em lote ({selectedRows.length})</Button>
      {selected.size > 0 && <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())}>Limpar seleção</Button>}
      <Button size="sm" variant="ghost" onClick={() => { setFilters({}); setPage(1); }}>Limpar filtros da tabela</Button>
    </div>
    <p className="text-xs text-(--color-text-secondary)">A edição em lote altera somente os registros e meses selecionados; outros meses são preservados. Projeções recorrentes podem ser selecionadas. Cálculos sem lançamento ou regra não podem.</p>
    <details className="rounded-(--radius-md) border border-(--color-border) p-3 md:hidden">
      <summary className="cursor-pointer text-sm font-medium">Filtros e ordenação de todas as colunas</summary>
      <div className="mt-3 grid grid-cols-2 gap-3">
        {COLUMNS.map(([column, label]) => <label key={column} className="text-xs">{label}{filterInput(column, label)}</label>)}
        <label className="text-xs">Ordenar por<select className={controlClass} value={sort.column} onChange={(event) => { setSort({ column: event.target.value as Column, ascending: sort.ascending }); setPage(1); }}>{COLUMNS.map(([column, label]) => <option key={column} value={column}>{label}</option>)}</select></label>
        <Button size="sm" variant="secondary" onClick={() => changeSort(sort.column)}>{sort.ascending ? "Crescente ↑" : "Decrescente ↓"}</Button>
      </div>
    </details>
    <div className="overflow-hidden rounded-(--radius-lg) border border-(--color-border) bg-(--color-surface)">
      <div className="hidden overflow-x-auto md:block">
        <table className="w-full text-sm"><thead><tr>
          <th className="p-3"><span className="sr-only">Selecionar</span></th>
          {COLUMNS.map(([column, label]) => <th key={column} className="min-w-36 p-3 text-left align-top font-medium" aria-sort={sort.column === column ? sort.ascending ? "ascending" : "descending" : "none"}>
            <button className="mb-2 flex w-full items-center gap-1 whitespace-nowrap" onClick={() => changeSort(column)}>{label} {sort.column === column ? sort.ascending ? "↑" : "↓" : "↕"}</button>
            {filterInput(column, label)}
          </th>)}<th className="p-3">Ações</th>
        </tr></thead><tbody>{visible.map(({ row, values }) => <tr key={row.key} className="border-t border-(--color-border)">
          <td className="p-3"><input type="checkbox" aria-label={`Selecionar ${row.occurrence.description ?? "lançamento"}`} disabled={!selectable(row)} checked={selected.has(row.key)} onChange={() => toggleSelection(row.key)} /></td>
          {COLUMNS.map(([column]) => <td key={column} className="max-w-64 px-3 py-3" title={values[column]}>{column === "considered" ? <RecordConsidered row={row} onChanged={(value) => setConsideredOverrides((previous) => ({ ...previous, [row.key]: { value, updatedAt: row.transaction?.updatedAt } }))} /> : values[column]}</td>)}
          <td className="p-3"><RecordActions row={row} onEdit={() => onEdit(row)} /></td>
        </tr>)}</tbody></table>
      </div>
      <div className="divide-y divide-(--color-border) md:hidden">{visible.map(({ row, values }) => <article key={row.key} className="space-y-2 p-3">
        <label className="flex items-center gap-2 font-medium"><input type="checkbox" aria-label={`Selecionar ${values.description}`} disabled={!selectable(row)} checked={selected.has(row.key)} onChange={() => toggleSelection(row.key)} />{values.description}</label>
        <dl className="grid grid-cols-2 gap-2 text-xs">{COLUMNS.filter(([column]) => column !== "description").map(([column, label]) => <div key={column}><dt className="text-(--color-text-secondary)">{label}</dt><dd>{column === "considered" ? <RecordConsidered row={row} onChanged={(value) => setConsideredOverrides((previous) => ({ ...previous, [row.key]: { value, updatedAt: row.transaction?.updatedAt } }))} /> : values[column]}</dd></div>)}</dl>
        <RecordActions row={row} onEdit={() => onEdit(row)} />
      </article>)}</div>
      {!filtered.length && <p className="p-6 text-center text-sm">Nenhum lançamento encontrado com esses filtros.</p>}
    </div>
    <div className="flex items-center justify-between gap-2 text-sm">
      <span>{filtered.length ? `${(currentPage - 1) * pageSize + 1}–${Math.min(currentPage * pageSize, filtered.length)} de ${filtered.length} registros` : "0 registros"}</span>
      <div className="flex items-center gap-2"><Button size="sm" variant="secondary" disabled={currentPage <= 1} onClick={() => setPage(currentPage - 1)} aria-label="Página anterior">‹</Button><span>{currentPage}/{totalPages}</span><Button size="sm" variant="secondary" disabled={currentPage >= totalPages} onClick={() => setPage(currentPage + 1)} aria-label="Próxima página">›</Button></div>
    </div>
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
  return <div className="flex items-center gap-1">
    <button className="rounded-full p-2 hover:bg-black/5" aria-label="Editar lançamento" onClick={onEdit}><Pencil size={16} /></button>
    {deleteTarget && <button className="rounded-full p-2 hover:bg-black/5" aria-label="Excluir lançamento" onClick={() => setTarget(deleteTarget)}><Trash2 size={16} /></button>}
    <DeleteRecordDialog target={target} onClose={() => setTarget(null)} />
  </div>;
}
