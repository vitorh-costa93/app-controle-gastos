"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CreditCard, X } from "lucide-react";
import { Person, Category, TransactionType } from "@/types/db";
import { InstallmentGroup, cancelInstallmentGroup } from "@/lib/data/installments";
import { createTransaction } from "@/lib/data/transactions";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { FieldGroup, Input, Select } from "@/components/ui/Field";
import { CurrencyInput } from "@/components/ui/CurrencyInput";
import { formatCurrencyBRL, formatReferenceMonthShort, toISODate, toReferenceMonth } from "@/lib/utils/format";

export function InstallmentGroupsEditor({
  groups,
  people,
  categories,
  types,
}: {
  groups: InstallmentGroup[];
  people: Person[];
  categories: Category[];
  types: TransactionType[];
}) {
  const [showForm, setShowForm] = useState(false);
  const [pendingGroupId, setPendingGroupId] = useState<string | null>(null);
  const [, startTransition] = useTransition();
  const router = useRouter();
  const peopleById = new Map(people.map((p) => [p.id, p.name]));

  function handleCancel(group: InstallmentGroup) {
    const confirmed = window.confirm(
      `Encerrar "${group.description ?? "compra parcelada"}"? As ${group.remainingCount} parcela(s) a partir deste mês serão apagadas; as já pagas continuam.`
    );
    if (!confirmed) return;
    setPendingGroupId(group.groupId);
    startTransition(async () => {
      await cancelInstallmentGroup(group.groupId, toReferenceMonth(new Date()));
      setPendingGroupId(null);
      router.refresh();
    });
  }

  return (
    <Card className="p-5">
      <div className="mb-1 flex items-center justify-between">
        <h3 className="text-[15px] font-semibold">Recorrências variáveis (compras parceladas)</h3>
        <Button size="sm" variant="secondary" onClick={() => setShowForm((v) => !v)}>
          {showForm ? "Fechar" : "Nova compra parcelada"}
        </Button>
      </div>
      <p className="mb-3 text-xs text-(--color-text-tertiary)">
        Cada parcela vira um lançamento no mês certo. Quando a fatura trouxer a mesma parcela, ela substitui a gerada
        automaticamente em vez de duplicar.
      </p>

      <ul className="mb-3 space-y-2">
        {groups.map((group) => (
          <li
            key={group.groupId}
            className="flex items-center justify-between gap-3 rounded-(--radius-md) border border-(--color-border) px-3 py-2"
          >
            <div className="flex min-w-0 items-center gap-2">
              <CreditCard size={14} className="shrink-0 text-(--color-primary)" />
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{group.description ?? "Compra parcelada"}</p>
                <p className="text-xs text-(--color-text-tertiary)">
                  {peopleById.get(group.personId) ?? "—"} · {group.installmentTotal}x de{" "}
                  {formatCurrencyBRL(group.amountCents)} · {formatReferenceMonthShort(group.firstMonth)} a{" "}
                  {formatReferenceMonthShort(group.lastMonth)} · faltam {group.remainingCount} (
                  {formatCurrencyBRL(group.remainingCents)})
                </p>
              </div>
            </div>
            <button
              className="rounded-full p-1.5 text-(--color-text-tertiary) hover:bg-black/5 disabled:opacity-40"
              onClick={() => handleCancel(group)}
              disabled={pendingGroupId === group.groupId}
              aria-label="Encerrar compra parcelada"
            >
              <X size={14} />
            </button>
          </li>
        ))}
        {groups.length === 0 && (
          <p className="text-sm text-(--color-text-tertiary)">Nenhuma compra parcelada em andamento.</p>
        )}
      </ul>

      {showForm && (
        <NewInstallmentForm
          people={people}
          categories={categories}
          types={types}
          onCreated={() => {
            setShowForm(false);
            router.refresh();
          }}
        />
      )}
    </Card>
  );
}

function NewInstallmentForm({
  people,
  categories,
  types,
  onCreated,
}: {
  people: Person[];
  categories: Category[];
  types: TransactionType[];
  onCreated: () => void;
}) {
  const [description, setDescription] = useState("");
  const [personId, setPersonId] = useState(people[0]?.id ?? "");
  const [categoryId, setCategoryId] = useState("");
  const [typeId, setTypeId] = useState("");
  const [installmentCents, setInstallmentCents] = useState(0);
  const [installments, setInstallments] = useState(2);
  const [firstDate, setFirstDate] = useState(toISODate(new Date()));
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleSubmit() {
    setError(null);
    startTransition(async () => {
      const result = await createTransaction({
        registrationDate: firstDate,
        referenceMonth: firstDate.slice(0, 7),
        personId,
        direction: "expense",
        fixedVariable: "variable",
        typeId: typeId || null,
        categoryId: categoryId || null,
        installmentCurrent: 1,
        installmentTotal: installments,
        amountCents: installmentCents,
        description: description.trim() || null,
        considered: true,
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      onCreated();
    });
  }

  const canSave = description.trim() && installmentCents > 0 && installments >= 2 && personId && firstDate;

  return (
    <div className="grid grid-cols-1 gap-3 border-t border-(--color-border) pt-4 sm:grid-cols-2">
      <FieldGroup label="Descrição">
        <Input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Ex.: Geladeira" />
      </FieldGroup>
      <FieldGroup label="Origem">
        <Select value={personId} onChange={(e) => setPersonId(e.target.value)}>
          {people.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </Select>
      </FieldGroup>
      <FieldGroup label="Valor da parcela">
        <CurrencyInput valueCents={installmentCents} onChange={setInstallmentCents} />
      </FieldGroup>
      <FieldGroup label="Número de parcelas">
        <Input
          type="number"
          min={2}
          max={120}
          value={installments}
          onChange={(e) => setInstallments(Math.max(1, Math.min(120, Number(e.target.value) || 1)))}
        />
      </FieldGroup>
      <FieldGroup label="Data da 1ª parcela">
        <Input type="date" value={firstDate} onChange={(e) => setFirstDate(e.target.value)} />
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
      <div className="flex items-end text-xs text-(--color-text-tertiary)">
        {installmentCents > 0 && installments >= 2 && (
          <span>Total da compra: {formatCurrencyBRL(installmentCents * installments)}</span>
        )}
      </div>

      <div className="sm:col-span-2">
        {error && <p className="mb-2 text-xs text-(--color-negative)">{error}</p>}
        <Button onClick={handleSubmit} disabled={!canSave || isPending}>
          Salvar compra parcelada
        </Button>
      </div>
    </div>
  );
}
