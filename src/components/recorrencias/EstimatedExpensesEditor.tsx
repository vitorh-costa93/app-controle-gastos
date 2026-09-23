"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { Person, Category, TransactionType } from "@/types/db";
import { EstimatedExpense, setEstimatedExpenses } from "@/lib/data/estimates";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { FieldGroup, Input, Select } from "@/components/ui/Field";
import { CurrencyInput } from "@/components/ui/CurrencyInput";
import { addMonths, formatMonthLabel, toReferenceMonth } from "@/lib/utils/format";

export function EstimatedExpensesEditor({
  items: initialItems,
  people,
  categories,
  types,
}: {
  items: EstimatedExpense[];
  people: Person[];
  categories: Category[];
  types: TransactionType[];
}) {
  const [items, setItems] = useState(initialItems);
  const [isPending, startTransition] = useTransition();
  const [message, setMessage] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  const router = useRouter();

  const firstEstimatedMonth = addMonths(toReferenceMonth(new Date()), 2);

  function updateItem(id: string, patch: Partial<EstimatedExpense>) {
    setItems((prev) => prev.map((i) => (i.id === id ? { ...i, ...patch } : i)));
  }

  function addItem() {
    setItems((prev) => [
      ...prev,
      {
        id: crypto.randomUUID(),
        label: "",
        personId: people[0]?.id ?? "",
        categoryId: null,
        typeId: null,
        amountCents: 0,
      },
    ]);
  }

  function handleSave() {
    setMessage(null);
    const valid = items.filter((i) => i.label.trim() && i.personId && i.amountCents > 0);
    startTransition(async () => {
      const result = await setEstimatedExpenses(valid.map((i) => ({ ...i, label: i.label.trim() })));
      if (!result.ok) {
        setMessage({ tone: "error", text: result.error });
        return;
      }
      setItems(valid);
      setMessage({ tone: "ok", text: "Salvo. Os lançamentos estimados foram atualizados." });
      router.refresh();
    });
  }

  return (
    <Card className="p-5">
      <h3 className="mb-1 text-[15px] font-semibold">Gastos estimados</h3>
      <p className="mb-4 text-xs text-(--color-text-tertiary)">
        Viram lançamentos no Cadastro a partir de {formatMonthLabel(firstEstimatedMonth)} (dois meses à frente). O mês
        atual e o seguinte ficam só com os dados reais. Meses que já têm um lançamento dessa pessoa na mesma
        categoria não recebem estimativa, e lançamentos estimados que você editou nunca são sobrescritos.
      </p>

      <div className="space-y-3">
        {items.map((item) => (
          <div
            key={item.id}
            className="grid grid-cols-1 gap-3 rounded-(--radius-md) border border-(--color-border) p-3 sm:grid-cols-[1.2fr_1fr_1fr_1fr_1fr_auto]"
          >
            <FieldGroup label="Nome">
              <Input
                value={item.label}
                onChange={(e) => updateItem(item.id, { label: e.target.value })}
                placeholder="Ex.: Supermercado"
              />
            </FieldGroup>
            <FieldGroup label="Valor mensal">
              <CurrencyInput valueCents={item.amountCents} onChange={(c) => updateItem(item.id, { amountCents: c })} />
            </FieldGroup>
            <FieldGroup label="Origem">
              <Select value={item.personId} onChange={(e) => updateItem(item.id, { personId: e.target.value })}>
                {people.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </Select>
            </FieldGroup>
            <FieldGroup label="Categoria">
              <Select
                value={item.categoryId ?? ""}
                onChange={(e) => updateItem(item.id, { categoryId: e.target.value || null })}
              >
                <option value="">Não identificado</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </Select>
            </FieldGroup>
            <FieldGroup label="Tipo">
              <Select value={item.typeId ?? ""} onChange={(e) => updateItem(item.id, { typeId: e.target.value || null })}>
                <option value="">Não identificado</option>
                {types.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </Select>
            </FieldGroup>
            <div className="flex items-end">
              <button
                className="rounded-full p-2 text-(--color-text-tertiary) hover:bg-black/5"
                onClick={() => setItems((prev) => prev.filter((i) => i.id !== item.id))}
                aria-label="Remover gasto estimado"
              >
                <Trash2 size={16} />
              </button>
            </div>
          </div>
        ))}
        {items.length === 0 && <p className="text-sm text-(--color-text-tertiary)">Nenhum gasto estimado.</p>}
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <Button variant="secondary" size="sm" onClick={addItem}>
          Adicionar gasto estimado
        </Button>
        <Button size="sm" onClick={handleSave} disabled={isPending}>
          {isPending ? "Salvando..." : "Salvar estimativas"}
        </Button>
        {message && (
          <span
            className={
              "text-xs " + (message.tone === "ok" ? "text-(--color-positive)" : "text-(--color-negative)")
            }
          >
            {message.text}
          </span>
        )}
      </div>
    </Card>
  );
}
