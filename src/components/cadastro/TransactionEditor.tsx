"use client";

import { useState, useTransition } from "react";
import { Person, Category, TransactionType } from "@/types/db";
import { Transaction } from "@/types/domain";
import { createTransaction, updateTransaction, deleteTransaction, TransactionInput } from "@/lib/data/transactions";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { FieldGroup, Input, Select } from "@/components/ui/Field";
import { CurrencyInput } from "@/components/ui/CurrencyInput";
import { toISODate, toReferenceMonth } from "@/lib/utils/format";

type SaveState = "idle" | "saving" | "saved" | "error";

export function TransactionEditor({
  open,
  onClose,
  people,
  categories,
  types,
  transaction,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  people: Person[];
  categories: Category[];
  types: TransactionType[];
  transaction?: Transaction | null;
  onSaved?: (t: Transaction) => void;
}) {
  const today = new Date();
  const [form, setForm] = useState(() => buildInitialForm(transaction, today, people));
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [isDeleting, startDeleteTransition] = useTransition();

  function update<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
    setForm((f) => ({ ...f, [key]: value }));
    setSaveState("idle");
  }

  function handleSave() {
    setSaveState("saving");
    setErrorMessage(null);

    const input: TransactionInput = {
      registrationDate: form.registrationDate,
      referenceMonth: form.referenceMonth,
      personId: form.personId,
      direction: form.direction,
      fixedVariable: form.fixedVariable,
      typeId: form.typeId || null,
      categoryId: form.categoryId || null,
      installmentCurrent: form.installmentCurrent,
      installmentTotal: form.installmentTotal,
      amountCents: form.amountCents,
      description: form.description || null,
      considered: form.considered,
    };

    startTransition(async () => {
      const result = transaction
        ? await updateTransaction(transaction.id, input)
        : await createTransaction(input);

      if (!result.ok) {
        setSaveState("error");
        setErrorMessage(result.error);
        return;
      }
      setSaveState("saved");
      onSaved?.(result.data);
      setTimeout(onClose, 500);
    });
  }

  function handleDelete() {
    if (!transaction) return;
    startDeleteTransition(async () => {
      const result = await deleteTransaction(transaction.id);
      if (!result.ok) {
        setErrorMessage(result.error);
        return;
      }
      onClose();
    });
  }

  const missingFields = [
    form.amountCents <= 0 && "valor",
    !form.personId && "origem",
    !form.registrationDate && "data de cadastro",
    form.description.trim().length === 0 && "descrição",
  ].filter((f): f is string => Boolean(f));
  const canSave = missingFields.length === 0;

  return (
    <Modal open={open} onClose={onClose} title={transaction ? "Editar lançamento" : "Novo lançamento"}>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <FieldGroup label="Data de cadastro">
          <Input
            type="date"
            value={form.registrationDate}
            onChange={(e) => {
              const value = e.target.value;
              update("registrationDate", value);
              if (!transaction) {
                update("referenceMonth", value.slice(0, 7));
              }
            }}
          />
        </FieldGroup>

        <FieldGroup label="Mês de referência">
          <Input
            type="month"
            value={form.referenceMonth}
            onChange={(e) => update("referenceMonth", e.target.value)}
          />
        </FieldGroup>

        <FieldGroup label="Origem">
          <Select value={form.personId} onChange={(e) => update("personId", e.target.value)}>
            {people.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </Select>
        </FieldGroup>

        <FieldGroup label="Entrada / Saída">
          <Select
            value={form.direction}
            onChange={(e) => update("direction", e.target.value as "income" | "expense")}
          >
            <option value="expense">Saída</option>
            <option value="income">Entrada</option>
          </Select>
        </FieldGroup>

        <FieldGroup label="Fixo / Variável">
          <Select
            value={form.fixedVariable}
            onChange={(e) => update("fixedVariable", e.target.value as "fixed" | "variable")}
          >
            <option value="variable">Variável</option>
            <option value="fixed">Fixo</option>
          </Select>
        </FieldGroup>

        <FieldGroup label="Tipo">
          <Select value={form.typeId} onChange={(e) => update("typeId", e.target.value)}>
            <option value="">Não identificado</option>
            {types.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </Select>
        </FieldGroup>

        <FieldGroup label="Categoria">
          <Select value={form.categoryId} onChange={(e) => update("categoryId", e.target.value)}>
            <option value="">Não identificado</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </Select>
        </FieldGroup>

        <FieldGroup label="Parcela">
          <div className="flex items-center gap-2">
            <Input
              type="number"
              min={1}
              value={form.installmentCurrent}
              onChange={(e) => update("installmentCurrent", Number(e.target.value) || 1)}
            />
            <span className="text-(--color-text-tertiary)">/</span>
            <Input
              type="number"
              min={1}
              value={form.installmentTotal}
              onChange={(e) => update("installmentTotal", Number(e.target.value) || 1)}
            />
          </div>
        </FieldGroup>

        <FieldGroup label="Valor">
          <CurrencyInput valueCents={form.amountCents} onChange={(cents) => update("amountCents", cents)} />
        </FieldGroup>

        <div className="sm:col-span-2">
          <FieldGroup label="Descrição">
            <Input
              value={form.description}
              onChange={(e) => update("description", e.target.value)}
              placeholder="Ex.: Compras supermercado Carrefour"
            />
          </FieldGroup>
        </div>
      </div>

      <div className="mt-6 flex items-center justify-between gap-3">
        <div className="text-xs">
          {saveState === "saving" && <span className="text-(--color-text-tertiary)">Salvando...</span>}
          {saveState === "saved" && <span className="text-(--color-positive)">Salvo</span>}
          {saveState === "error" && (
            <span className="text-(--color-negative)">
              {errorMessage ?? "Não foi possível salvar. Tentar novamente."}
            </span>
          )}
          {saveState === "idle" && !confirmingDelete && missingFields.length > 0 && (
            <span className="text-(--color-text-tertiary)">
              Preencha: {missingFields.join(", ")}
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          {transaction && !confirmingDelete && (
            <Button
              variant="ghost"
              onClick={() => setConfirmingDelete(true)}
              disabled={isDeleting}
              type="button"
              className="text-(--color-negative) hover:bg-(--color-negative-soft)"
            >
              Excluir
            </Button>
          )}
          {transaction && confirmingDelete && (
            <>
              <span className="text-xs text-(--color-text-secondary)">Excluir mesmo?</span>
              <Button variant="ghost" onClick={() => setConfirmingDelete(false)} disabled={isDeleting} type="button">
                Não
              </Button>
              <Button variant="danger" onClick={handleDelete} disabled={isDeleting} type="button">
                Sim, excluir
              </Button>
            </>
          )}
          {!confirmingDelete && (
            <>
              <Button variant="secondary" onClick={onClose} type="button">
                Cancelar
              </Button>
              <Button onClick={handleSave} disabled={!canSave || isPending} type="button">
                Salvar
              </Button>
            </>
          )}
        </div>
      </div>
    </Modal>
  );
}

function buildInitialForm(
  transaction: Transaction | null | undefined,
  today: Date,
  people: Person[]
) {
  if (transaction) {
    return {
      registrationDate: transaction.registrationDate,
      referenceMonth: transaction.referenceMonth,
      personId: transaction.personId,
      direction: transaction.direction,
      fixedVariable: transaction.fixedVariable,
      typeId: transaction.typeId ?? "",
      categoryId: transaction.categoryId ?? "",
      installmentCurrent: transaction.installmentCurrent,
      installmentTotal: transaction.installmentTotal,
      amountCents: transaction.amountCents,
      description: transaction.description ?? "",
      considered: transaction.considered,
    };
  }

  return {
    registrationDate: toISODate(today),
    referenceMonth: toReferenceMonth(today),
    personId: people[0]?.id ?? "",
    direction: "expense" as const,
    fixedVariable: "variable" as const,
    typeId: "",
    categoryId: "",
    installmentCurrent: 1,
    installmentTotal: 1,
    amountCents: 0,
    description: "",
    considered: true,
  };
}
