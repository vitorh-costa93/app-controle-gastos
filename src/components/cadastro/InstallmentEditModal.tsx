"use client";

import { useState, useTransition } from "react";
import { Transaction } from "@/types/domain";
import { Category, TransactionType } from "@/types/db";
import { updateInstallmentGroupFrom } from "@/lib/data/installments";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { FieldGroup, Input, Select } from "@/components/ui/Field";
import { CurrencyInput } from "@/components/ui/CurrencyInput";
import { formatReferenceMonthShort } from "@/lib/utils/format";

/** Edita uma compra parcelada a partir da parcela clicada — as parcelas seguintes acompanham a mudança. */
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
  const [description, setDescription] = useState(transaction.description ?? "");
  const [amountCents, setAmountCents] = useState(transaction.amountCents);
  const [categoryId, setCategoryId] = useState(transaction.categoryId ?? "");
  const [typeId, setTypeId] = useState(transaction.typeId ?? "");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const remaining = transaction.installmentTotal - transaction.installmentCurrent;

  function handleSave() {
    if (!transaction.installmentGroupId) return;
    setError(null);
    startTransition(async () => {
      const result = await updateInstallmentGroupFrom(transaction.installmentGroupId as string, transaction.referenceMonth, {
        description: description.trim() || null,
        amountCents,
        categoryId: categoryId || null,
        typeId: typeId || null,
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      onSaved();
    });
  }

  return (
    <Modal open onClose={onClose} title="Editar compra parcelada">
      <p className="mb-4 text-sm text-(--color-text-secondary)">
        Parcela {transaction.installmentCurrent}/{transaction.installmentTotal} ({formatReferenceMonthShort(transaction.referenceMonth)}).
        A mudança vale para esta parcela e para as {remaining} seguinte{remaining === 1 ? "" : "s"}; as anteriores
        continuam como estão.
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
      {error && <p className="mt-3 text-sm text-(--color-negative)">{error}</p>}
      <div className="mt-5 flex flex-wrap items-center justify-between gap-2">
        <Button variant="ghost" onClick={onEditSingle} type="button">
          Editar só esta parcela
        </Button>
        <div className="flex gap-2">
          <Button variant="secondary" onClick={onClose} type="button">
            Cancelar
          </Button>
          <Button onClick={handleSave} disabled={isPending || amountCents <= 0} type="button">
            Salvar
          </Button>
        </div>
      </div>
    </Modal>
  );
}
