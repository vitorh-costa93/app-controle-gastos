"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Transaction } from "@/types/domain";
import { Category, TransactionType } from "@/types/db";
import { updateInstallmentGroupWithScope, deleteInstallmentGroupWithScope } from "@/lib/data/installments";
import { defaultOrganization, type PaymentOrganization } from "@/lib/domain/payments";
import { getPaymentOrganization, savePaymentOrganization } from "@/lib/data/payments";
import { PaymentOrganizationFields } from "@/components/payments/PaymentOrganizationFields";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { FieldGroup, Input, Select } from "@/components/ui/Field";
import { CurrencyInput } from "@/components/ui/CurrencyInput";
import { formatReferenceMonthShort } from "@/lib/utils/format";
import { ScopeConfirmModal } from "./ScopeConfirmModal";
import type { EditScope } from "@/lib/data/transactions";

/** Edita uma compra parcelada (pop-up com organização de pagamento e confirmação de escopo). */
export function InstallmentEditModal({
  transaction,
  categories,
  types,
  onClose,
  onSaved,
  onEditSingle,
}: {
  transaction: Transaction;
  categories: Category[];
  types: TransactionType[];
  onClose: () => void;
  onSaved: () => void;
  onEditSingle: () => void;
}) {
  const router = useRouter();
  const [description, setDescription] = useState(transaction.description ?? "");
  const [amountCents, setAmountCents] = useState(transaction.amountCents);
  const [categoryId, setCategoryId] = useState(transaction.categoryId ?? "");
  const [typeId, setTypeId] = useState(transaction.typeId ?? "");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [confirmMode, setConfirmMode] = useState<"save" | "delete" | null>(null);

  const isExpense = transaction.direction === "expense";
  const [payment, setPayment] = useState<PaymentOrganization>(() =>
    defaultOrganization({
      bank: transaction.bank ?? null,
      description: transaction.description ?? null,
      categoryName: categories.find((c) => c.id === transaction.categoryId)?.name,
    })
  );
  const [paymentDirty, setPaymentDirty] = useState(false);
  const [paymentLoading, setPaymentLoading] = useState(isExpense);

  useEffect(() => {
    if (!isExpense) return;
    let active = true;
    void getPaymentOrganization({ kind: "transaction", id: transaction.id, month: transaction.referenceMonth })
      .then((res) => {
        if (!active) return;
        if (res.ok) setPayment(res.settings);
      })
      .finally(() => {
        if (active) setPaymentLoading(false);
      });
    return () => { active = false; };
  }, [isExpense, transaction.id, transaction.referenceMonth]);

  function executeConfirm(scope: EditScope) {
    if (!transaction.installmentGroupId) return;
    setError(null);
    startTransition(async () => {
      if (confirmMode === "delete") {
        const res = await deleteInstallmentGroupWithScope(
          transaction.installmentGroupId as string,
          transaction.id,
          transaction.referenceMonth,
          scope
        );
        if (!res.ok) {
          setError(res.error);
          setConfirmMode(null);
          return;
        }
        setConfirmMode(null);
        router.refresh();
        onSaved();
        return;
      }

      const result = await updateInstallmentGroupWithScope(
        transaction.installmentGroupId as string,
        transaction.id,
        transaction.referenceMonth,
        {
          description: description.trim() || null,
          amountCents,
          categoryId: categoryId || null,
          typeId: typeId || null,
        },
        scope
      );
      if (!result.ok) {
        setError(result.error);
        setConfirmMode(null);
        return;
      }

      if (isExpense && paymentDirty) {
        const payRes = await savePaymentOrganization({
          targets: [{ kind: "transaction", id: transaction.id, month: transaction.referenceMonth }],
          settings: payment,
          scope,
        });
        if (!payRes.ok) {
          setError(payRes.error);
          setConfirmMode(null);
          return;
        }
      }

      setConfirmMode(null);
      router.refresh();
      onSaved();
    });
  }

  return (
    <Modal open onClose={onClose} title="Editar compra parcelada" size="lg">
      <p className="mb-4 text-sm text-(--color-text-secondary)">
        Parcela {transaction.installmentCurrent}/{transaction.installmentTotal} ({formatReferenceMonthShort(transaction.referenceMonth)}).
      </p>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <FieldGroup label="Descrição">
            <Input value={description} onChange={(e) => setDescription(e.target.value)} />
          </FieldGroup>
        </div>
        <FieldGroup label="Valor da parcela">
          <CurrencyInput valueCents={amountCents} onChange={setAmountCents} />
        </FieldGroup>
        <FieldGroup label="Categoria">
          <Select value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
            <option value="">Não identificado</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </Select>
        </FieldGroup>
        <FieldGroup label="Tipo">
          <Select value={typeId} onChange={(e) => setTypeId(e.target.value)}>
            <option value="">Não identificado</option>
            {types.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </Select>
        </FieldGroup>
      </div>

      {isExpense && (
        <div className="mt-5">
          <h3 className="modern-editor-section-title">Organização do pagamento</h3>
          {paymentLoading ? (
            <p className="text-sm text-(--color-text-tertiary)">Carregando organização de pagamento...</p>
          ) : (
            <PaymentOrganizationFields
              value={payment}
              onChange={(value) => { setPayment(value); setPaymentDirty(true); }}
              disabled={isPending}
            />
          )}
        </div>
      )}

      {error && <p className="mt-3 text-sm text-(--color-negative)">{error}</p>}
      <div className="mt-5 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Button variant="ghost" onClick={onEditSingle} type="button" disabled={isPending}>
            Editar todos os campos
          </Button>
          <Button
            variant="ghost"
            type="button"
            disabled={isPending}
            className="text-(--color-negative) hover:bg-(--color-negative-soft)"
            onClick={() => setConfirmMode("delete")}
          >
            Excluir
          </Button>
        </div>
        <div className="flex gap-2">
          <Button variant="secondary" onClick={onClose} type="button" disabled={isPending}>
            Cancelar
          </Button>
          <Button
            onClick={() => setConfirmMode("save")}
            disabled={isPending || amountCents <= 0 || paymentLoading}
            type="button"
          >
            Salvar
          </Button>
        </div>
      </div>

      {confirmMode && (
        <ScopeConfirmModal
          open
          mode={confirmMode}
          allowMultiMonth
          busy={isPending}
          onClose={() => setConfirmMode(null)}
          onConfirm={executeConfirm}
        />
      )}
    </Modal>
  );
}
