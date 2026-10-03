"use client";

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
  /** Chamado depois de excluir, para recarregar a Análise. */
  onChanged: () => void;
}) {
  const person = people.find((p) => p.id === o.personId);
  const category = categories.find((c) => c.id === o.categoryId);
  const type = types.find((t) => t.id === o.typeId);
  const target = deleteTargetFor(o);

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
    <Modal open onClose={onClose} title="Detalhes do lançamento" size="sm">
      <dl className="mb-5 grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
        {details.map(([label, value]) => (
          <div key={label} className="contents">
            <dt className="text-(--color-text-tertiary)">{label}</dt>
            <dd className="font-medium">{value}</dd>
          </div>
        ))}
      </dl>

      <div className="border-t border-(--color-border) pt-4">
        <h3 className="mb-1 text-sm font-semibold">Excluir</h3>
        {target ? (
          <>
            <p className="mb-3 text-xs text-(--color-text-secondary)">{deleteQuestion(target)}</p>
            <DeleteActions
              target={target}
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
      </div>
    </Modal>
  );
}
