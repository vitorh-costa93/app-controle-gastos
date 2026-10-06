"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/Button";
import { CurrencyInput } from "@/components/ui/CurrencyInput";
import { saveMovementAmount } from "@/lib/data/movement-edit";
import { Modal } from "@/components/ui/Modal";
import { Person, Category, TransactionType } from "@/types/db";
import { MonthlyOccurrence, RecurrenceRule } from "@/types/domain";
import { frequencyLabel } from "@/lib/domain/recurrence";
import { formatCurrencyBRL, formatDateBR, formatMonthLabel } from "@/lib/utils/format";
import { DeleteActions, deleteQuestion, deleteTargetFor } from "@/components/cadastro/DeleteRecordDialog";

/** Descreve a frequência do lançamento: pontual, recorrente (com ritmo e período), parcelado ou calculado. */
function frequencyText(o: MonthlyOccurrence, rule: RecurrenceRule | undefined): string {
  if (o.recurrenceRuleId) {
    if (!rule) return "Recorrente";
    const parts = [`Recorrente · ${frequencyLabel(rule.frequency)}`, `desde ${formatMonthLabel(rule.startDate.slice(0, 7))}`];
    parts.push(rule.endDate ? `até ${formatMonthLabel(rule.endDate.slice(0, 7))}` : "sem data de término");
    return parts.join(" · ");
  }
  if (o.installmentTotal > 1) return `Parcelado · parcela ${o.installmentCurrent} de ${o.installmentTotal}`;
  if (o.id.startsWith("estimate:")) return "Estimativa automática (média dos 2 últimos meses fechados)";
  if (o.origin === "projected") return "Calculado automaticamente";
  return "Pontual";
}

/** Popup de um lançamento da tabela "Todas as movimentações": informações, frequência e opções de exclusão. */
export function MovementDetailsDialog({
  occurrence: o,
  rule,
  people,
  categories,
  types,
  onClose,
  onChanged,
}: {
  occurrence: MonthlyOccurrence;
  rule?: RecurrenceRule;
  people: Person[];
  categories: Category[];
  types: TransactionType[];
  onClose: () => void;
  /** Chamado depois de salvar ou excluir, para recarregar a Análise. */
  onChanged: () => void;
}) {
  const person = people.find((p) => p.id === o.personId);
  const category = categories.find((c) => c.id === o.categoryId);
  const type = types.find((t) => t.id === o.typeId);
  const target = deleteTargetFor(o);
  const [amountCents, setAmountCents] = useState(o.amountCents);
  const [scope, setScope] = useState<"month" | "following">("month");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [isDeleting, setIsDeleting] = useState(false);
  const isBusy = isPending || isDeleting;
  const monthLabel = formatMonthLabel(o.referenceMonth);

  function save() {
    setError(null);
    startTransition(async () => {
      try {
        const result = await saveMovementAmount(o.id, o.recurrenceRuleId, o.referenceMonth, amountCents, scope);
        if (!result.ok) {
          setError(result.error);
          return;
        }
        onChanged();
        onClose();
      } catch {
        setError("Não foi possível salvar. Tente novamente.");
      }
    });
  }

  const details: [string, string][] = [
    ["Descrição", o.description ?? "—"],
    ["Valor", formatCurrencyBRL(o.amountCents)],
    ["Direção", o.direction === "income" ? "Entrada" : "Saída"],
    ["Origem", person?.name ?? "—"],
    ["Tipo", type?.name ?? "—"],
    ["Categoria", category?.name ?? "—"],
    ["Natureza", o.fixedVariable === "fixed" ? "Fixo" : "Variável"],
    ["Mês de referência", formatMonthLabel(o.referenceMonth)],
    ["Data de cadastro", formatDateBR(o.registrationDate)],
    ["Frequência", frequencyText(o, rule)],
    ["Considerado", o.considered ? "Sim" : "Não"],
  ];

  return (
    <Modal open onClose={() => { if (!isBusy) onClose(); }} title="Detalhes do lançamento" size="sm">
      <dl className="mb-5 grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
        {details.map(([label, value]) => (
          <div key={label} className="contents">
            <dt className="text-(--color-text-tertiary)">{label}</dt>
            <dd className="font-medium">{value}</dd>
          </div>
        ))}
      </dl>

      {target && (
        <section className="mb-5 border-t border-(--color-border) pt-4">
          <h3 className="mb-3 text-sm font-semibold">Editar valor</h3>
          <fieldset disabled={isBusy} className="space-y-3">
            <div>
              <label htmlFor="movement-amount" className="mb-1.5 block text-xs font-medium">Novo valor</label>
              <CurrencyInput id="movement-amount" valueCents={amountCents} onChange={setAmountCents} />
            </div>
            {o.recurrenceRuleId ? (
              <div className="space-y-2 text-sm">
                <label className="flex items-center gap-2">
                  <input type="radio" name="movement-scope" checked={scope === "month"} onChange={() => setScope("month")} />
                  Só em {monthLabel}
                </label>
                <label className="flex items-center gap-2">
                  <input type="radio" name="movement-scope" checked={scope === "following"} onChange={() => setScope("following")} />
                  De {monthLabel} em diante
                </label>
                <p className="text-xs text-(--color-text-secondary)">
                  {scope === "month"
                    ? "Os outros meses mantêm seus valores."
                    : "Atualiza este mês e todos os seguintes, inclusive valores já registrados e alterações futuras. Os meses anteriores são preservados."}
                </p>
              </div>
            ) : (
              <p className="text-xs text-(--color-text-secondary)">Altera somente este lançamento{ o.installmentTotal > 1 ? " (esta parcela)" : ""}.</p>
            )}
            <Button type="button" className="w-full" onClick={save} disabled={isBusy || amountCents <= 0}>
              {isPending ? "Salvando..." : "Salvar valor"}
            </Button>
          </fieldset>
          {error && <p role="alert" className="mt-2 text-xs text-(--color-negative)">{error}</p>}
        </section>
      )}

      <fieldset disabled={isPending} className="border-t border-(--color-border) pt-4">
        <h3 className="mb-1 text-sm font-semibold">Excluir</h3>
        {target ? (
          <>
            <p className="mb-3 text-xs text-(--color-text-secondary)">{deleteQuestion(target)}</p>
            <DeleteActions
              target={target}
              onBusyChange={setIsDeleting}
              onDone={() => {
                onChanged();
                onClose();
              }}
            />
          </>
        ) : (
          <p className="text-xs text-(--color-text-secondary)">
            {o.id.startsWith("estimate:")
              ? "Esta estimativa é calculada na hora. Para tirá-la, remova o item em Cadastro → Recorrências → Gastos estimados."
              : "Este valor é calculado automaticamente e não pode ser excluído por aqui."}
          </p>
        )}
      </fieldset>
    </Modal>
  );
}
