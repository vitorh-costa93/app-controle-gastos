"use client";

import { useState, useTransition } from "react";
import { Modal } from "@/components/ui/Modal";
import { getPlanning, saveCategoryLimit, saveReserveConfig } from "@/lib/data/planning";
import { type PlanningData } from "@/lib/planning";
import { CurrencyInput } from "@/components/ui/CurrencyInput";
import type { Category, Person } from "@/types/db";
import "./planning-editor.css";

type Props = { data: PlanningData; people: Person[]; categories: Category[]; month: string; personId: string; onSaved: (data: PlanningData) => void; onClose: () => void; mode: "limits" | "reserve" };
function parseAmount(value: string): number | null {
  const normalized = value.trim().replace(",", ".");
  if (!/^\d+(\.\d{1,2})?$/.test(normalized)) return null;
  const [whole, fraction = ""] = normalized.split(".");
  const cents = Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
  return Number.isSafeInteger(cents) && cents > 0 ? cents : null;
}
function amountText(cents: number) { return (cents / 100).toFixed(2).replace(".", ","); }

export function PlanningEditor({ data, people, categories, month, personId, onSaved, onClose, mode }: Props) {
  const [current, setCurrent] = useState(data);
  const [person, setPerson] = useState(people.some((p) => p.id === personId) ? personId : people[0]?.id ?? "");
  const [amounts, setAmounts] = useState<Record<string, string>>({});
  const [goalMode, setGoalMode] = useState<"amount" | "months">(data.reserveConfig.targetAmountCents ? "amount" : data.reserveConfig.essentialCategoryIds.length ? "months" : "amount");
  const [targetAmount, setTargetAmount] = useState(data.reserveConfig.targetAmountCents ?? 0);
  const [essentials, setEssentials] = useState(data.reserveConfig.essentialCategoryIds);
  const [targetMonths, setTargetMonths] = useState(String(data.reserveConfig.targetMonths));
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();
  function run(action: () => Promise<{ ok: true } | { ok: false; error: string }>, after?: () => void) {
    setError("");
    startTransition(async () => {
      try {
        const result = await action();
        if (!result.ok) { setError(result.error); return; }
        const refreshed = await getPlanning();
        setCurrent(refreshed); onSaved(refreshed); after?.();
      } catch { setError("Não foi possível atualizar o planejamento. Recarregue a página para conferir o resultado."); }
    });
  }
  return <Modal open onClose={() => { if (!pending) onClose(); }} title={mode === "limits" ? "Limites por categoria" : "Reserva de emergência"} size="lg">
    <div className="planning-editor">
      {error && <p role="alert" className="planning-error">{error}</p>}
      <fieldset disabled={pending}>
        {mode === "limits" ? <>
          <p>Os limites são opcionais e valem para uma pessoa e um mês. Deixe o campo vazio e salve para remover o limite.</p>
          <label>Pessoa <select value={person} onChange={(e) => { setPerson(e.target.value); setAmounts({}); }}>{people.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
          <p>Mês: {month}</p>
          <div className="planning-list">{categories.map((category) => {
            const saved = current.limits.find((limit) => limit.personId === person && limit.categoryId === category.id && limit.month === month);
            const value = amounts[category.id] ?? (saved ? amountText(saved.amountCents) : "");
            return <div className="planning-row" key={category.id}><label htmlFor={`limit-${category.id}`}>{category.name}</label><input id={`limit-${category.id}`} inputMode="decimal" placeholder="Sem limite" value={value} onChange={(e) => setAmounts({ ...amounts, [category.id]: e.target.value })} /><button type="button" onClick={() => {
              const parsed = value.trim() ? parseAmount(value) : null;
              if (value.trim() && parsed === null) { setError("Informe um valor positivo com até duas casas decimais."); return; }
              run(() => saveCategoryLimit({ personId: person, categoryId: category.id, month, amountCents: parsed }), () => setAmounts((old) => { const next = { ...old }; delete next[category.id]; return next; }));
            }}>Salvar</button></div>;
          })}</div>
        </> : <>
          <p>Defina quanto deseja alcançar. A meta é compartilhada; o saldo acompanha o acumulado automaticamente.</p>
          <label>Tipo de meta <select value={goalMode} onChange={(e) => setGoalMode(e.target.value as "amount" | "months")}><option value="amount">Valor em reais</option><option value="months">Meses de despesas essenciais</option></select></label>
          {goalMode === "amount" ? <label htmlFor="reserve-target">Meta da reserva (R$)<CurrencyInput id="reserve-target" valueCents={targetAmount} onChange={setTargetAmount} /></label> : <label>Meses de despesas essenciais <input type="number" min="1" max="120" value={targetMonths} onChange={(e) => setTargetMonths(e.target.value)} /></label>}
          {goalMode === "amount" ? <details><summary>Calcular cobertura em meses (opcional)</summary><div className="planning-categories">{categories.map((category) => <label key={category.id}><input type="checkbox" checked={essentials.includes(category.id)} onChange={(e) => setEssentials(e.target.checked ? [...essentials, category.id] : essentials.filter((id) => id !== category.id))} /> {category.name}</label>)}</div></details> : <div className="planning-categories">{categories.map((category) => <label key={category.id}><input type="checkbox" checked={essentials.includes(category.id)} onChange={(e) => setEssentials(e.target.checked ? [...essentials, category.id] : essentials.filter((id) => id !== category.id))} /> {category.name}</label>)}</div>}
          <button type="button" onClick={() => {
            if (goalMode === "amount" && (!Number.isSafeInteger(targetAmount) || targetAmount <= 0)) { setError("Informe uma meta positiva."); return; }
            if (goalMode === "months" && (!essentials.length || !Number.isInteger(Number(targetMonths)) || Number(targetMonths) < 1 || Number(targetMonths) > 120)) { setError("Escolha categorias essenciais e informe entre 1 e 120 meses."); return; }
            run(() => saveReserveConfig({ essentialCategoryIds: essentials, targetMonths: goalMode === "months" ? Number(targetMonths) : current.reserveConfig.targetMonths, targetAmountCents: goalMode === "amount" ? targetAmount : null }), onClose);
          }}>Salvar meta</button>
        </>}
      </fieldset>
    </div>
  </Modal>;
}
