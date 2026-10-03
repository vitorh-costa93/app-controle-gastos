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

/** Escolhe o tipo de exclusão pelo registro: recorrente (real ou projetado), parcela de compra parcelada ou pontual. */
export function deleteTargetFor(occurrence: MonthlyOccurrence, transaction: Transaction | null): DeleteTarget | null {
  const label = occurrence.description ?? "este lançamento";
  if (occurrence.recurrenceRuleId) {
    return { kind: "recurring", ruleId: occurrence.recurrenceRuleId, month: occurrence.referenceMonth, label };
  }
  if (!transaction) return null;
  if (transaction.installmentGroupId && transaction.installmentTotal > 1) {
    return {
      kind: "installment",
      groupId: transaction.installmentGroupId,
      transactionId: transaction.id,
      month: transaction.referenceMonth,
      current: transaction.installmentCurrent,
      total: transaction.installmentTotal,
      label,
    };
  }
  return { kind: "simple", transactionId: transaction.id, label };
}

export function DeleteRecordDialog({ target, onClose }: { target: DeleteTarget | null; onClose: () => void }) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  if (!target) return null;

  function run(action: () => Promise<{ ok: boolean; error?: string }>) {
    setError(null);
    startTransition(async () => {
      const result = await action();
      if (!result.ok) {
        setError(result.error ?? "Não foi possível excluir.");
        return;
      }
      onClose();
    });
  }

  const t = target;
  const monthLabel = t.kind === "simple" ? "" : formatMonthLabel(t.month);

  return (
    <Modal open onClose={onClose} title="Excluir registro" size="sm">
      <p className="mb-4 text-sm text-(--color-text-secondary)">
        <span className="font-medium text-(--color-text-primary)">{t.label}</span>
        {t.kind === "recurring" && " é recorrente. O que você quer excluir?"}
        {t.kind === "installment" && ` é a parcela ${t.current}/${t.total} de uma compra parcelada. O que você quer excluir?`}
        {t.kind === "simple" && " será excluído."}
      </p>
      {error && <p className="mb-3 text-sm text-(--color-negative)">{error}</p>}
      <div className="flex flex-col gap-2">
        {t.kind === "recurring" && (
          <>
            <Button
              variant="secondary"
              disabled={isPending}
              onClick={() => run(() => deleteRecurringOccurrence(t.ruleId, t.month, "month"))}
            >
              Só {monthLabel}
            </Button>
            <Button
              variant="danger"
              disabled={isPending}
              onClick={() => run(() => deleteRecurringOccurrence(t.ruleId, t.month, "following"))}
            >
              {monthLabel} e todos os seguintes
            </Button>
          </>
        )}
        {t.kind === "installment" && (
          <>
            <Button variant="secondary" disabled={isPending} onClick={() => run(() => deleteTransaction(t.transactionId))}>
              Só esta parcela ({t.current}/{t.total})
            </Button>
            <Button variant="danger" disabled={isPending} onClick={() => run(() => cancelInstallmentGroup(t.groupId, t.month))}>
              Esta e as seguintes
            </Button>
          </>
        )}
        {t.kind === "simple" && (
          <Button variant="danger" disabled={isPending} onClick={() => run(() => deleteTransaction(t.transactionId))}>
            Excluir
          </Button>
        )}
        <Button variant="ghost" disabled={isPending} onClick={onClose}>
          Cancelar
        </Button>
      </div>
    </Modal>
  );
}
