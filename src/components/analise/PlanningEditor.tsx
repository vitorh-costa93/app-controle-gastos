"use client";

import { useState, useTransition } from "react";
import { Modal } from "@/components/ui/Modal";
import { deleteReserveEntry, getPlanning, saveCategoryLimit, saveReserveConfig, saveReserveEntry } from "@/lib/data/planning";
import { getReserveBalance, type PlanningData } from "@/lib/planning";
import { formatCurrencyBRL } from "@/lib/utils/format";
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
  const [entryAmount, setEntryAmount] = useState("");
  const [entryDate, setEntryDate] = useState(`${month}-01`);
  const [entryNote, setEntryNote] = useState("");
  const [entryKind, setEntryKind] = useState<"deposit" | "withdraw">("deposit");
  const [entryId, setEntryId] = useState(() => crypto.randomUUID());
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
  const selectedIds = people.some((p) => p.id === personId) ? [personId] : people.map((p) => p.id);
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
          <p>Saldo da seleção até {month}: <strong>{formatCurrencyBRL(getReserveBalance(current, selectedIds, month))}</strong></p>
          <h3>Meta da reserva</h3><p>Escolha as categorias essenciais para calcular a meta. A configuração vale para todas as pessoas.</p>
          <label>Meses de despesas essenciais <input type="number" min="1" max="120" value={targetMonths} onChange={(e) => setTargetMonths(e.target.value)} /></label>
          <div className="planning-categories">{categories.map((category) => <label key={category.id}><input type="checkbox" checked={essentials.includes(category.id)} onChange={(e) => setEssentials(e.target.checked ? [...essentials, category.id] : essentials.filter((id) => id !== category.id))} /> {category.name}</label>)}</div>
          <button type="button" onClick={() => run(() => saveReserveConfig({ essentialCategoryIds: essentials, targetMonths: Number(targetMonths) }))}>Salvar meta</button>
          <h3>Registrar movimento</h3><div className="planning-fields">
            <label>Pessoa <select value={person} onChange={(e) => setPerson(e.target.value)}>{people.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
            <label>Data <input type="date" value={entryDate} onChange={(e) => setEntryDate(e.target.value)} /></label>
            <label>Tipo <select value={entryKind} onChange={(e) => setEntryKind(e.target.value as "deposit" | "withdraw")}><option value="deposit">Depósito</option><option value="withdraw">Retirada</option></select></label>
            <label>Valor (R$) <input inputMode="decimal" value={entryAmount} onChange={(e) => setEntryAmount(e.target.value)} /></label>
            <label>Observação <input maxLength={200} value={entryNote} onChange={(e) => setEntryNote(e.target.value)} /></label>
          </div><button type="button" onClick={() => { const cents = parseAmount(entryAmount); if (cents === null) { setError("Informe um valor positivo com até duas casas decimais."); return; } run(() => saveReserveEntry({ id: entryId, personId: person, date: entryDate, amountCents: entryKind === "withdraw" ? -cents : cents, note: entryNote }), () => { setEntryId(crypto.randomUUID()); setEntryAmount(""); setEntryNote(""); }); }}>Adicionar movimento</button>
          <h3>Movimentos até {month}</h3><div className="planning-list">{current.reserveEntries.filter((entry) => selectedIds.includes(entry.personId) && entry.date.slice(0, 7) <= month).sort((a, b) => b.date.localeCompare(a.date)).map((entry) => <div className="planning-entry" key={entry.id}><span>{entry.date.split("-").reverse().join("/")} · {people.find((p) => p.id === entry.personId)?.name ?? "Pessoa"} · {formatCurrencyBRL(entry.amountCents)}{entry.note && ` · ${entry.note}`}</span><button type="button" onClick={() => { if (window.confirm("Excluir este movimento da reserva?")) run(() => deleteReserveEntry(entry.id)); }}>Excluir</button></div>)}</div>
        </>}
      </fieldset>
    </div>
  </Modal>;
}
