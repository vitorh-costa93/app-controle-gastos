"use client";

import { useState, useTransition } from "react";
import { Person, Category, TransactionType, ExtractedTransactionData, FieldConfidence } from "@/types/db";
import { IngestResultRow, confirmExtractedRows, IngestMethod } from "@/lib/data/ingest";
import { Toggle } from "@/components/ui/Toggle";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Select, Input } from "@/components/ui/Field";
import { CurrencyInput } from "@/components/ui/CurrencyInput";
import { AlertTriangle } from "lucide-react";
import { toReferenceMonth } from "@/lib/utils/format";

const MONTH_NAMES = [
  "Janeiro",
  "Fevereiro",
  "Março",
  "Abril",
  "Maio",
  "Junho",
  "Julho",
  "Agosto",
  "Setembro",
  "Outubro",
  "Novembro",
  "Dezembro",
];

const CONFIDENCE_TONE: Record<FieldConfidence, "positive" | "warning" | "negative"> = {
  alta: "positive",
  media: "warning",
  baixa: "negative",
};

export function AIReviewTable({
  jobId,
  initialRows,
  people,
  categories,
  types,
  source,
  onDone,
}: {
  jobId: string;
  initialRows: IngestResultRow[];
  people: Person[];
  categories: Category[];
  types: TransactionType[];
  source: IngestMethod;
  onDone: () => void;
}) {
  const initialBatchMonth =
    initialRows.find((r) => r.data.reference_month)?.data.reference_month ?? toReferenceMonth(new Date());
  // O mês do lote já é aplicado a TODAS as linhas desde a montagem — antes, se o valor
  // inicial já "parecesse certo" (batia com a 1ª linha), o seletor nunca disparava
  // onChange e as outras linhas ficavam com o mês extraído por elas mesmas (a data),
  // não com o mês do lote. Agora todas partem já normalizadas pro mesmo mês.
  const [rows, setRows] = useState<IngestResultRow[]>(() =>
    initialRows.map((r) => ({ ...r, data: { ...r.data, reference_month: initialBatchMonth } }))
  );
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [confirmedCount, setConfirmedCount] = useState<number | null>(null);
  const [batchMonth, setBatchMonth] = useState(initialBatchMonth);

  function updateRow(id: string, patch: Partial<ExtractedTransactionData>) {
    setRows((prev) =>
      prev.map((r) => (r.id === id ? { ...r, data: { ...r.data, ...patch } } : r))
    );
  }

  function applyBatchMonth(month: string) {
    setBatchMonth(month);
    setRows((prev) => prev.map((r) => ({ ...r, data: { ...r.data, reference_month: month } })));
  }

  const [batchYear, batchMonthNum] = batchMonth.split("-").map(Number);

  function applyBatchYearMonth(year: number, monthNum: number) {
    applyBatchMonth(`${year}-${String(monthNum).padStart(2, "0")}`);
  }

  function toggleIncluded(id: string, included: boolean) {
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, included } : r)));
  }

  function removeRow(id: string) {
    setRows((prev) => prev.filter((r) => r.id !== id));
  }

  const includedCount = rows.filter((r) => r.included).length;
  const duplicateCount = rows.filter((r) => r.duplicateWarning).length;

  function handleConfirm() {
    setError(null);
    startTransition(async () => {
      const result = await confirmExtractedRows(
        jobId,
        rows.map((r) => ({ id: r.id, included: r.included, data: r.data })),
        people[0]?.id,
        source
      );
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setConfirmedCount(result.count);
      setTimeout(onDone, 900);
    });
  }

  if (confirmedCount !== null) {
    return (
      <div className="flex flex-col items-center gap-2 py-10 text-center">
        <p className="text-sm font-medium text-(--color-positive)">
          {confirmedCount} lançamento{confirmedCount === 1 ? "" : "s"} adicionado{confirmedCount === 1 ? "" : "s"} com sucesso.
        </p>
      </div>
    );
  }

  return (
    <div>
      <p className="mb-3 text-xs text-(--color-text-secondary)">
        Revise cada lançamento antes de confirmar. Desligue, edite ou remova o que não estiver certo.
        {duplicateCount > 0 && (
          <>
            {" "}
            <span className="font-medium text-(--color-warning)">
              {duplicateCount} {duplicateCount === 1 ? "linha parece" : "linhas parecem"} duplicata de algo já cadastrado e{" "}
              {duplicateCount === 1 ? "foi desmarcada" : "foram desmarcadas"} automaticamente.
            </span>
          </>
        )}
      </p>

      <div className="mb-4 flex flex-wrap items-center gap-2 rounded-(--radius-lg) border border-(--color-border) bg-(--color-surface-secondary) p-3">
        <span className="text-xs font-medium text-(--color-text-secondary)">
          Mês de referência para todos os lançamentos
        </span>
        <select
          aria-label="Mês"
          value={batchMonthNum}
          onChange={(e) => applyBatchYearMonth(batchYear, Number(e.target.value))}
          className="rounded-(--radius-md) border border-(--color-border) bg-(--color-surface) px-2 py-1.5 text-sm"
        >
          {MONTH_NAMES.map((name, i) => (
            <option key={name} value={i + 1}>
              {name}
            </option>
          ))}
        </select>
        <select
          aria-label="Ano"
          value={batchYear}
          onChange={(e) => applyBatchYearMonth(Number(e.target.value), batchMonthNum)}
          className="rounded-(--radius-md) border border-(--color-border) bg-(--color-surface) px-2 py-1.5 text-sm"
        >
          {Array.from({ length: 5 }, (_, i) => new Date().getFullYear() - 1 + i).map((year) => (
            <option key={year} value={year}>
              {year}
            </option>
          ))}
        </select>
      </div>

      <div className="flex flex-col gap-3">
        {rows.map((row) => (
          <ReviewRow
            key={row.id}
            row={row}
            people={people}
            categories={categories}
            types={types}
            onUpdate={(patch) => updateRow(row.id, patch)}
            onToggle={(included) => toggleIncluded(row.id, included)}
            onRemove={() => removeRow(row.id)}
          />
        ))}
      </div>

      {error && <p className="mt-3 text-sm text-(--color-negative)">{error}</p>}

      <div className="mt-5 flex items-center justify-between border-t border-(--color-border) pt-4">
        <span className="text-xs text-(--color-text-secondary)">
          {includedCount} de {rows.length} selecionados
        </span>
        <div className="flex gap-2">
          <Button variant="secondary" onClick={onDone} type="button">
            Cancelar
          </Button>
          <Button onClick={handleConfirm} disabled={includedCount === 0 || isPending} type="button">
            Adicionar lançamentos
          </Button>
        </div>
      </div>
    </div>
  );
}

function ReviewRow({
  row,
  people,
  categories,
  types,
  onUpdate,
  onToggle,
  onRemove,
}: {
  row: IngestResultRow;
  people: Person[];
  categories: Category[];
  types: TransactionType[];
  onUpdate: (patch: Partial<ExtractedTransactionData>) => void;
  onToggle: (included: boolean) => void;
  onRemove: () => void;
}) {
  const { data, confidence } = row;

  return (
    <div
      className={
        "rounded-(--radius-lg) border p-3 " +
        (row.duplicateWarning ? "border-(--color-warning)/40 bg-(--color-warning-soft)/40" : "border-(--color-border)")
      }
    >
      <div className="mb-2 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Toggle checked={row.included} onChange={onToggle} ariaLabel="Considerar" />
          <span className="text-sm font-medium">{data.description || "Lançamento sem descrição"}</span>
        </div>
        <button onClick={onRemove} className="text-xs text-(--color-text-tertiary) hover:text-(--color-negative)">
          Remover
        </button>
      </div>

      {row.duplicateWarning && (
        <div className="mb-2 flex items-start gap-1.5 text-xs text-(--color-warning)">
          <AlertTriangle size={14} className="mt-0.5 shrink-0" />
          <span>{row.duplicateWarning}</span>
        </div>
      )}

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <LabeledField label="Data" confidence={confidence.date}>
          <Input
            type="date"
            value={data.registration_date ?? ""}
            onChange={(e) =>
              onUpdate({
                registration_date: e.target.value,
                reference_month: e.target.value ? e.target.value.slice(0, 7) : null,
              })
            }
          />
        </LabeledField>

        <LabeledField label="Origem" confidence={confidence.origin}>
          <Select
            value={data.person_id ?? ""}
            onChange={(e) => onUpdate({ person_id: e.target.value || null })}
          >
            <option value="">Não identificado</option>
            {people.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </Select>
        </LabeledField>

        <LabeledField label="Fixo/Variável">
          <Select
            value={data.fixed_variable ?? "variable"}
            onChange={(e) => onUpdate({ fixed_variable: e.target.value as "fixed" | "variable" })}
          >
            <option value="variable">Variável</option>
            <option value="fixed">Fixo</option>
          </Select>
        </LabeledField>

        <LabeledField label="Tipo">
          <Select value={data.type_id ?? ""} onChange={(e) => onUpdate({ type_id: e.target.value || null })}>
            <option value="">Não identificado</option>
            {types.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </Select>
        </LabeledField>

        <LabeledField label="Categoria" confidence={confidence.category}>
          <Select
            value={data.category_id ?? ""}
            onChange={(e) => onUpdate({ category_id: e.target.value || null })}
          >
            <option value="">Não identificado</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </Select>
        </LabeledField>

        <LabeledField label="Parcela">
          <div className="flex items-center gap-1">
            <Input
              type="number"
              min={1}
              value={data.installment_current}
              onChange={(e) => onUpdate({ installment_current: Number(e.target.value) || 1 })}
            />
            <span className="text-(--color-text-tertiary)">/</span>
            <Input
              type="number"
              min={1}
              value={data.installment_total}
              onChange={(e) => onUpdate({ installment_total: Number(e.target.value) || 1 })}
            />
          </div>
        </LabeledField>

        <LabeledField label="Valor" confidence={confidence.amount}>
          <CurrencyInput
            valueCents={Math.round((data.amount ?? 0) * 100)}
            onChange={(cents) => onUpdate({ amount: cents / 100 })}
          />
        </LabeledField>

        <LabeledField label="Entrada/Saída">
          <Select
            value={data.direction ?? "expense"}
            onChange={(e) => onUpdate({ direction: e.target.value as "income" | "expense" })}
          >
            <option value="expense">Saída</option>
            <option value="income">Entrada</option>
          </Select>
        </LabeledField>

        <div className="col-span-2 sm:col-span-4">
          <LabeledField label="Descrição">
            <Input
              value={data.description ?? ""}
              onChange={(e) => onUpdate({ description: e.target.value || null })}
              placeholder="Ex.: Compras supermercado Carrefour"
            />
          </LabeledField>
        </div>
      </div>
    </div>
  );
}

function LabeledField({
  label,
  confidence,
  children,
}: {
  label: string;
  confidence?: FieldConfidence;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="mb-1 flex items-center gap-1.5">
        <span className="text-[11px] font-medium text-(--color-text-tertiary)">{label}</span>
        {confidence && confidence !== "alta" && (
          <Badge tone={CONFIDENCE_TONE[confidence]} className="px-1.5 py-0 text-[10px]">
            {confidence === "media" ? "revisar" : "confirmar"}
          </Badge>
        )}
      </div>
      {children}
    </div>
  );
}
