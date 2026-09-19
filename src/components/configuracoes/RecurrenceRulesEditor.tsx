"use client";

import { useState, useTransition } from "react";
import { X, Repeat } from "lucide-react";
import { RecurrenceRule } from "@/types/domain";
import { Person, Category, TransactionType } from "@/types/db";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { FieldGroup, Input, Select } from "@/components/ui/Field";
import { CurrencyInput } from "@/components/ui/CurrencyInput";
import { createRecurrenceRule, deactivateRecurrenceRule } from "@/lib/data/recurrence";
import { formatCurrencyBRL, formatDateBR, toISODate } from "@/lib/utils/format";

export function RecurrenceRulesEditor({
  rules,
  people,
  categories,
  types,
}: {
  rules: RecurrenceRule[];
  people: Person[];
  categories: Category[];
  types: TransactionType[];
}) {
  const [list, setList] = useState(rules);
  const [showForm, setShowForm] = useState(false);
  const [, startTransition] = useTransition();

  const peopleById = new Map(people.map((p) => [p.id, p.name]));

  return (
    <Card className="p-5">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-[15px] font-semibold">Recorrências fixas</h3>
        <Button size="sm" variant="secondary" onClick={() => setShowForm((v) => !v)}>
          {showForm ? "Fechar" : "Nova recorrência"}
        </Button>
      </div>

      <ul className="mb-3 space-y-2">
        {list.map((rule) => (
          <li
            key={rule.id}
            className="flex items-center justify-between rounded-(--radius-md) border border-(--color-border) px-3 py-2"
          >
            <div className="flex items-center gap-2">
              <Repeat size={14} className="text-(--color-primary)" />
              <div>
                <p className="text-sm font-medium">{rule.description}</p>
                <p className="text-xs text-(--color-text-tertiary)">
                  {peopleById.get(rule.personId) ?? "—"} · {formatCurrencyBRL(rule.amountCents)}/mês · desde{" "}
                  {formatDateBR(rule.startDate)}
                </p>
              </div>
            </div>
            <button
              className="rounded-full p-1 text-(--color-text-tertiary) hover:bg-black/5"
              onClick={() =>
                startTransition(async () => {
                  const result = await deactivateRecurrenceRule(rule.id);
                  if (result.ok) setList((prev) => prev.filter((r) => r.id !== rule.id));
                })
              }
              aria-label="Desativar recorrência"
            >
              <X size={14} />
            </button>
          </li>
        ))}
        {list.length === 0 && (
          <p className="text-sm text-(--color-text-tertiary)">Nenhuma recorrência fixa cadastrada.</p>
        )}
      </ul>

      {showForm && (
        <NewRecurrenceForm
          people={people}
          categories={categories}
          types={types}
          onCreated={(rule) => {
            setList((prev) => [...prev, rule]);
            setShowForm(false);
          }}
        />
      )}
    </Card>
  );
}

function NewRecurrenceForm({
  people,
  categories,
  types,
  onCreated,
}: {
  people: Person[];
  categories: Category[];
  types: TransactionType[];
  onCreated: (rule: RecurrenceRule) => void;
}) {
  const [description, setDescription] = useState("");
  const [personId, setPersonId] = useState(people[0]?.id ?? "");
  const [direction, setDirection] = useState<"income" | "expense">("expense");
  const [categoryId, setCategoryId] = useState("");
  const [typeId, setTypeId] = useState("");
  const [amountCents, setAmountCents] = useState(0);
  const [startDate, setStartDate] = useState(toISODate(new Date()));
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleSubmit() {
    setError(null);
    startTransition(async () => {
      const result = await createRecurrenceRule({
        description,
        personId,
        direction,
        typeId: typeId || null,
        categoryId: categoryId || null,
        amountCents,
        startDate,
        endDate: null,
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      onCreated({
        id: crypto.randomUUID(),
        description,
        personId,
        direction,
        typeId: typeId || null,
        categoryId: categoryId || null,
        amountCents,
        frequency: "monthly",
        startDate,
        endDate: null,
        active: true,
      });
    });
  }

  const canSave = description.trim() && amountCents > 0 && personId;

  return (
    <div className="grid grid-cols-1 gap-3 border-t border-(--color-border) pt-4 sm:grid-cols-2">
      <FieldGroup label="Descrição">
        <Input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Ex.: Internet" />
      </FieldGroup>
      <FieldGroup label="Valor mensal">
        <CurrencyInput valueCents={amountCents} onChange={setAmountCents} />
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
      <FieldGroup label="Entrada/Saída">
        <Select value={direction} onChange={(e) => setDirection(e.target.value as "income" | "expense")}>
          <option value="expense">Saída</option>
          <option value="income">Entrada</option>
        </Select>
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
      <FieldGroup label="Início">
        <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
      </FieldGroup>

      <div className="sm:col-span-2">
        {error && <p className="mb-2 text-xs text-(--color-negative)">{error}</p>}
        <Button onClick={handleSubmit} disabled={!canSave || isPending}>
          Salvar recorrência
        </Button>
      </div>
    </div>
  );
}
