"use client";

import { useEffect, useState, useTransition } from "react";
import { Modal } from "@/components/ui/Modal";
import { getPlanning, saveCategoryLimit, saveReserveConfig } from "@/lib/data/planning";
import { type PlanningData } from "@/lib/planning";
import { addMonths } from "@/lib/utils/format";
import { getStartingBalance, setStartingBalance } from "@/lib/data/settings";
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
  const [baselineMonth, setBaselineMonth] = useState(addMonths(month, -1));
  const [baselineAmount, setBaselineAmount] = useState(0);
  const [baselineStatus, setBaselineStatus] = useState<"loading" | "ready" | "error">("loading");
  const [baselineRetry, setBaselineRetry] = useState(0);
  useEffect(() => {
    if (mode !== "reserve") return;
    let active = true;
    setBaselineStatus("loading");
    getStartingBalance(true).then((value) => {
      if (!active) return;
      if (value) { setBaselineMonth(value.month); setBaselineAmount(value.amountCents); }
      setBaselineStatus("ready");
    }).catch(() => { if (active) setBaselineStatus("error"); });
    return () => { active = false; };
  }, [mode, baselineRetry]);
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
          <p>A reserva corresponde a todo o saldo acumulado, com rendimento bruto a 100% do CDI, no mês e pessoa selecionados. Ela usa a mesma projeção da Simulação.</p>
          <h3>Meta da reserva</h3><p>Escolha as categorias essenciais para calcular a meta. A configuração vale para todas as pessoas.</p>
          <label>Meses de despesas essenciais <input type="number" min="1" max="120" value={targetMonths} onChange={(e) => setTargetMonths(e.target.value)} /></label>
          <div className="planning-categories">{categories.map((category) => <label key={category.id}><input type="checkbox" checked={essentials.includes(category.id)} onChange={(e) => setEssentials(e.target.checked ? [...essentials, category.id] : essentials.filter((id) => id !== category.id))} /> {category.name}</label>)}</div>
          <button type="button" onClick={() => run(() => saveReserveConfig({ essentialCategoryIds: essentials, targetMonths: Number(targetMonths) }))}>Salvar meta</button>
          <h3>Saldo de referência</h3>
          <p>Informe o saldo no fim de um mês. Esse é o ponto de partida do acumulado; depois, entradas, gastos e rendimento atualizam a reserva automaticamente. O mesmo valor é usado em Configurações e na Simulação.</p>
          {personId ? <p>O saldo de referência pertence à visão Casal. Para alterá-lo, selecione Casal. O acumulado individual parte de zero, conforme a Simulação.</p> : baselineStatus === "loading" ? <p role="status">Carregando saldo de referência…</p> : baselineStatus === "error" ? <p role="alert">Não foi possível carregar o saldo. <button type="button" onClick={() => setBaselineRetry((v) => v + 1)}>Tentar novamente</button></p> : <>
            <div className="planning-fields">
              <label>Mês de referência <input type="month" value={baselineMonth} onChange={(e) => setBaselineMonth(e.target.value)} /></label>
              <label>Saldo no fim do mês (R$) <CurrencyInput valueCents={baselineAmount} onChange={setBaselineAmount} /></label>
            </div>
            <button type="button" onClick={() => run(() => setStartingBalance(baselineMonth, baselineAmount))}>Salvar saldo de referência</button>
          </>}

        </>}
      </fieldset>
    </div>
  </Modal>;
}
