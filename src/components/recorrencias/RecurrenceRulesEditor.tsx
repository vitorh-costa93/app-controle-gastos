"use client";

import { DescriptionIcon } from "@/components/ui/DescriptionIcon";

import { useEffect, useMemo, useState, useTransition } from "react";
import { RecurrenceFrequency } from "@/types/domain";
import { RECURRENCE_FREQUENCIES, frequencyLabel } from "@/lib/domain/recurrence";
import { useRouter } from "next/navigation";
import { ChevronDown, ChevronRight, X, Pencil } from "lucide-react";
import { RecurrenceRule } from "@/types/domain";
import { Person, Category, TransactionType } from "@/types/db";
import { CategoryIcon } from "@/components/ui/CategoryIcon";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { FieldGroup, Input, Select } from "@/components/ui/Field";
import { CurrencyInput } from "@/components/ui/CurrencyInput";
import { createRecurrenceRule, deactivateRecurrenceRule } from "@/lib/data/recurrence";
import { RecurrenceRuleEditModal } from "./RecurrenceRuleEditModal";
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
  const [editingRule, setEditingRule] = useState<RecurrenceRule | null>(null);
  const [, startTransition] = useTransition();
  const router = useRouter();

  useEffect(() => {
    setList(rules);
  }, [rules]);

  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());
  const peopleById = new Map(people.map((p) => [p.id, p.name]));

  const groupedRules = useMemo(() => {
    const categoriesById = new Map(categories.map((c) => [c.id, c.name]));
    const groups = new Map<string, { key: string; name: string; totalCents: number; items: RecurrenceRule[] }>();
    for (const rule of list) {
      const catName =
        (rule.categoryId ? categoriesById.get(rule.categoryId) : null) ??
        (rule.direction === "income" ? "Entradas" : "Sem categoria");
      const key = rule.categoryId ?? (rule.direction === "income" ? "__income__" : "__none__");
      const existing = groups.get(key) ?? { key, name: catName, totalCents: 0, items: [] };
      existing.totalCents += rule.amountCents;
      existing.items.push(rule);
      groups.set(key, existing);
    }
    const sorted = Array.from(groups.values()).sort((a, b) => {
      if (a.key === "__income__" && b.key !== "__income__") return -1;
      if (b.key === "__income__" && a.key !== "__income__") return 1;
      if (a.key === "__none__" && b.key !== "__none__") return 1;
      if (b.key === "__none__" && a.key !== "__none__") return -1;
      return a.name.localeCompare(b.name, "pt-BR");
    });
    for (const g of sorted) {
      g.items.sort((a, b) => b.amountCents - a.amountCents);
    }
    return sorted;
  }, [list, categories]);

  return (
    <Card className="p-5">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-[15px] font-semibold">Recorrências fixas</h3>
        <Button size="sm" variant="secondary" onClick={() => setShowForm((v) => !v)}>
          {showForm ? "Fechar" : "Nova recorrência"}
        </Button>
      </div>

      <div className="mb-3 space-y-3">
        {groupedRules.map((group) => {
          const isCollapsed = collapsedGroups.has(group.key);
          return (
            <div key={group.key} className="rounded-(--radius-md) border border-(--color-border)">
              <button
                type="button"
                onClick={() =>
                  setCollapsedGroups((prev) => {
                    const next = new Set(prev);
                    if (next.has(group.key)) next.delete(group.key);
                    else next.add(group.key);
                    return next;
                  })
                }
                className="flex w-full items-center justify-between gap-2 bg-black/[0.02] px-3 py-2 text-left transition-colors hover:bg-black/[0.04]"
              >
                <div className="flex items-center gap-2">
                  <CategoryIcon name={group.name} size={15} />
                  <span className="text-xs font-semibold text-(--color-text-primary)">{group.name}</span>
                  <span className="rounded-full bg-black/[0.06] px-2 py-0.5 text-[11px] font-medium text-(--color-text-secondary)">
                    {group.items.length}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-semibold tabular-nums text-(--color-text-secondary)">
                    {formatCurrencyBRL(group.totalCents)}
                  </span>
                  {isCollapsed ? <ChevronRight size={14} /> : <ChevronDown size={14} />}
                </div>
              </button>

              {!isCollapsed && (
                <ul className="divide-y divide-(--color-border)">
                  {group.items.map((rule) => (
                    <li key={rule.id} className="flex items-center justify-between px-3 py-2">
                      <div className="flex items-center gap-2">
                        <DescriptionIcon description={rule.description} categoryName={group.name} />
                        <div>
                          <p className="text-sm font-medium">{rule.description}</p>
                          <p className="text-xs text-(--color-text-tertiary)">
                            {peopleById.get(rule.personId) ?? "—"} · {formatCurrencyBRL(rule.amountCents)} ·{" "}
                            {frequencyLabel(rule.frequency)} · desde {formatDateBR(rule.startDate)}
                            {rule.endDate && <> · até {formatDateBR(rule.endDate)}</>}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-1">
                        <button
                          className="rounded-full p-1.5 text-(--color-text-tertiary) hover:bg-black/5"
                          onClick={() => setEditingRule(rule)}
                          aria-label="Editar recorrência"
                        >
                          <Pencil size={14} />
                        </button>
                        <button
                          className="rounded-full p-1.5 text-(--color-text-tertiary) hover:bg-black/5"
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
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          );
        })}
        {list.length === 0 && (
          <p className="text-sm text-(--color-text-tertiary)">Nenhuma recorrência fixa cadastrada.</p>
        )}
      </div>

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

      {editingRule && (
        <RecurrenceRuleEditModal
          key={editingRule.id}
          rule={editingRule}
          onClose={() => setEditingRule(null)}
          onChanged={() => router.refresh()}
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
  const [endMonth, setEndMonth] = useState("");
  const [frequency, setFrequency] = useState<RecurrenceFrequency>("monthly");
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleSubmit() {
    setError(null);
    const endDate = endMonth ? `${endMonth}-01` : null;
    startTransition(async () => {
      const result = await createRecurrenceRule({
        description,
        personId,
        direction,
        typeId: typeId || null,
        categoryId: categoryId || null,
        amountCents,
        startDate,
        endDate,
        frequency,
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      onCreated({
        bank: null,
        id: crypto.randomUUID(),
        description,
        personId,
        direction,
        typeId: typeId || null,
        categoryId: categoryId || null,
        amountCents,
        frequency,
        startDate,
        endDate,
        active: true,
        amountHistory: [],
      });
    });
  }

  const canSave = description.trim() && amountCents > 0 && personId;

  return (
    <div className="grid grid-cols-1 gap-3 border-t border-(--color-border) pt-4 sm:grid-cols-2">
      <FieldGroup label="Descrição">
        <Input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Ex.: Internet" />
      </FieldGroup>
      <FieldGroup label="Frequência">
        <Select value={frequency} onChange={(e) => setFrequency(e.target.value as RecurrenceFrequency)}>
          {RECURRENCE_FREQUENCIES.map((f) => (
            <option key={f.value} value={f.value}>
              {f.label}
            </option>
          ))}
        </Select>
      </FieldGroup>
      <FieldGroup label="Valor">
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
      <FieldGroup label="Fim (opcional)">
        <Input type="month" value={endMonth} onChange={(e) => setEndMonth(e.target.value)} />
      </FieldGroup>
      <p className="text-xs text-(--color-text-tertiary) sm:col-span-2">
        Deixe vazio para reproduzir indefinidamente. Se preencher, o custo/entrada some a partir do mês seguinte ao
        escolhido.
      </p>

      <div className="sm:col-span-2">
        {error && <p className="mb-2 text-xs text-(--color-negative)">{error}</p>}
        <Button onClick={handleSubmit} disabled={!canSave || isPending}>
          Salvar recorrência
        </Button>
      </div>
    </div>
  );
}
