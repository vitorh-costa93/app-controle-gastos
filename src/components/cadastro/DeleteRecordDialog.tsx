"use client";

import { useState, useTransition } from "react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { deleteTransaction } from "@/lib/data/transactions";
import { deleteRecurringOccurrence } from "@/lib/data/recurrence";
import { cancelInstallmentGroup } from "@/lib/data/installments";
import { formatMonthLabel } from "@/lib/utils/format";
import { Transaction, MonthlyOccurrence } from "@/types/domain";

/** O que está sendo excluído: define as opções que o diálogo oferece. */
export type DeleteTarget =
  | { kind: "simple"; transactionId: string; label: string }
  | { kind: "recurring"; ruleId: string; month: string; label: string }
  | { kind: "installment"; groupId: string; transactionId: string; month: string; current: number; total: number; label: string };

/**
 * Escolhe o tipo de exclusão pelo registro: recorrente (real ou projetado), parcela de compra parcelada ou pontual.
 * null quando não dá para excluir (valores calculados, como a estimativa e o salário projetado).
 */
export function deleteTargetFor(occurrence: MonthlyOccurrence, transaction?: Transaction | null): DeleteTarget | null {
  const label = occurrence.description ?? "este lançamento";
  if (occurrence.recurrenceRuleId) {
    return { kind: "recurring", ruleId: occurrence.recurrenceRuleId, month: occurrence.referenceMonth, label };
  }
  const transactionId = transaction?.id ?? (occurrence.origin === "real" ? occurrence.id : null);
  if (!transactionId) return null;
  const groupId = transaction?.installmentGroupId ?? occurrence.installmentGroupId ?? null;
  if (groupId && occurrence.installmentTotal > 1) {
    return {
      kind: "installment",
      groupId,
      transactionId,
      month: occurrence.referenceMonth,
      current: occurrence.installmentCurrent,
      total: occurrence.installmentTotal,
      label,
    };
  }
  return { kind: "simple", transactionId, label };
}

/** Texto que explica o que será excluído. */
export function deleteQuestion(target: DeleteTarget): string {
  if (target.kind === "recurring") return `${target.label} é recorrente. O que você quer excluir?`;
  if (target.kind === "installment") {
    return `${target.label} é a parcela ${target.current}/${target.total} de uma compra parcelada. O que você quer excluir?`;
  }
  return `${target.label} será excluído.`;
}

/** Os botões de exclusão de cada tipo de registro (só este mês / este e os seguintes, etc.). */
export function DeleteActions({
  target,
  onDone,
  onCancel,
  onBusyChange,
}: {
  target: DeleteTarget;
  onDone: () => void;
  onCancel?: () => void;
  onBusyChange?: (busy: boolean) => void;
}) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function run(action: () => Promise<{ ok: boolean; error?: string }>) {
    setError(null);
    onBusyChange?.(true);
    startTransition(async () => {
      try {
        const result = await action();
        if (!result.ok) {
          setError(result.error ?? "Não foi possível excluir.");
          return;
        }
        onDone();
      } catch {
        setError("Não foi possível excluir. Tente novamente.");
      } finally {
        onBusyChange?.(false);
      }
    });
  }

  const t = target;
  const monthLabel = t.kind === "simple" ? "" : formatMonthLabel(t.month);

  return (
    <div className="flex flex-col gap-2">
      {error && <p className="text-sm text-(--color-negative)">{error}</p>}
      {t.kind === "recurring" && (
        <>
          <Button
            variant="secondary"
            disabled={isPending}
            onClick={() => run(() => deleteRecurringOccurrence(t.ruleId, t.month, "month"))}
          >
            Excluir só em {monthLabel}
          </Button>
          <Button
            variant="danger"
            disabled={isPending}
            onClick={() => run(() => deleteRecurringOccurrence(t.ruleId, t.month, "following"))}
          >
            Excluir de {monthLabel} em diante
          </Button>
        </>
      )}
      {t.kind === "installment" && (
        <>
          <Button variant="secondary" disabled={isPending} onClick={() => run(() => deleteTransaction(t.transactionId))}>
            Excluir só esta parcela ({t.current}/{t.total})
          </Button>
          <Button variant="danger" disabled={isPending} onClick={() => run(() => cancelInstallmentGroup(t.groupId, t.month))}>
            Excluir esta e as seguintes
          </Button>
        </>
      )}
      {t.kind === "simple" && (
        <Button variant="danger" disabled={isPending} onClick={() => run(() => deleteTransaction(t.transactionId))}>
          Excluir
        </Button>
      )}
      {onCancel && (
        <Button variant="ghost" disabled={isPending} onClick={onCancel}>
          Cancelar
        </Button>
      )}
    </div>
  );
}

export function DeleteRecordDialog({
  target,
  onClose,
  onDeleted,
}: {
  target: DeleteTarget | null;
  onClose: () => void;
  /** Chamado depois de excluir (ex.: para recarregar a tela). */
  onDeleted?: () => void;
}) {
  if (!target) return null;
  return (
    <Modal open onClose={onClose} title="Excluir registro" size="sm">
      <p className="mb-4 text-sm text-(--color-text-secondary)">{deleteQuestion(target)}</p>
      <DeleteActions
        target={target}
        onCancel={onClose}
        onDone={() => {
          onDeleted?.();
          onClose();
        }}
      />
    </Modal>
  );
}
