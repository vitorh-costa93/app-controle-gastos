"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { getMonthlyPayments, setMonthlyPaymentPaid } from "@/lib/data/payments";
import type { PaymentGroup } from "@/lib/domain/payments";
import { formatCurrencyBRL } from "@/lib/utils/format";

type PanelData = { groups: PaymentGroup[]; totalCents: number; pendingCents: number; configuredCount: number };

export function MonthlyPaymentsPanel({ month }: { month: string }) {
  const [view, setView] = useState<{ month: string; data: PanelData | null; error: string | null }>({ month: "", data: null, error: null });
  const [pending, setPending] = useState<string | null>(null);
  const request = useRef(0);
  const currentMonth = useRef(month);
  currentMonth.current = month;
  const load = useCallback(async (selectedMonth: string) => {
    const id = ++request.current;
    try {
      const result = await getMonthlyPayments(selectedMonth);
      if (id !== request.current || currentMonth.current !== selectedMonth) return;
      setView(result.ok ? { month: selectedMonth, data: result, error: null } : { month: selectedMonth, data: null, error: result.error });
    } catch {
      if (id === request.current && currentMonth.current === selectedMonth) setView({ month: selectedMonth, data: null, error: "Não foi possível carregar os pagamentos." });
    }
  }, []);
  useEffect(() => { const requestRef = request; void load(month); return () => { requestRef.current++; }; }, [month, load]);
  async function toggle(group: PaymentGroup) {
    const selectedMonth = month;
    setPending(group.id);
    try {
      const result = await setMonthlyPaymentPaid({ month: selectedMonth, groupId: group.id, paid: !group.paid, fingerprint: group.fingerprint });
      if (currentMonth.current !== selectedMonth) return;
      if (!result.ok) { setView((previous) => ({ ...previous, error: result.error })); return; }
      await load(selectedMonth);
    } catch {
      if (currentMonth.current === selectedMonth) setView((previous) => ({ ...previous, error: "Não foi possível atualizar o pagamento." }));
    } finally { setPending(null); }
  }
  const data = view.month === month ? view.data : null;
  return <section className="rounded-2xl border border-(--color-border) bg-white p-4 shadow-(--shadow-sm)" aria-label="Pagamentos do mês">
    <div className="flex items-start justify-between gap-3"><div><h2 className="text-sm font-semibold">Contas do início do mês</h2><p className="mt-1 text-xs text-(--color-text-secondary)">Visão do casal · mês selecionado</p></div><span aria-hidden="true" className="finance-object" style={{ backgroundPosition: "66.6667% center", width: 48, height: 64, flexBasis: 48 }} /></div>
    {data && <div className="my-4" aria-live="polite"><p className="text-xs text-(--color-text-secondary)">Total a reservar</p><p className="mt-1 text-2xl font-medium tracking-tight tabular-nums">{formatCurrencyBRL(data.totalCents)}</p><p className="mt-2 text-xs text-(--color-text-secondary)">{data.groups.filter((group) => group.paid).length} de {data.configuredCount} contas pagas</p><div className="mt-2 h-1 overflow-hidden rounded bg-black/5"><div className="h-full bg-(--color-primary)" style={{ width: `${data.configuredCount ? data.groups.filter((group) => group.paid).length / data.configuredCount * 100 : 0}%` }} /></div></div>}
    {view.month !== month || (!data && !view.error) ? <p role="status" className="py-3 text-sm">Carregando pagamentos...</p> : null}
    {view.month === month && view.error && <div role="alert" className="my-2 text-xs text-(--color-negative)"><p>{view.error}</p><button type="button" onClick={() => void load(month)} className="mt-1 underline">Atualizar lista</button></div>}
    {data && <div className="divide-y divide-(--color-border)">{data.groups.map((group) => <div key={group.id} className="py-2.5">
      <div className="flex items-start gap-2"><input type="checkbox" className="mt-1" aria-label={`Marcar ${group.label} como pago`} checked={group.amountCents !== null && group.paid} disabled={pending !== null || group.amountCents === null} onChange={() => void toggle(group)} /><div className="min-w-0 flex-1"><div className="flex justify-between gap-2"><span className="font-medium">{group.label}</span><strong className="whitespace-nowrap">{group.amountCents === null ? "Sem lançamentos" : formatCurrencyBRL(group.amountCents)}</strong></div><p className="mt-0.5 text-xs text-(--color-text-secondary)">{[group.dueDay ? `Dia ${group.dueDay}` : null, group.projected ? "Inclui projeção" : null, group.suggested ? "Sugestão" : null].filter(Boolean).join(" · ")}</p></div></div>
      {group.items.length > 0 && <details className="ml-5 mt-1 text-xs text-(--color-text-secondary)"><summary className="cursor-pointer">Ver lançamentos ({group.items.length})</summary><ul className="mt-2 space-y-1">{group.items.map((item) => <li key={item.id} className="flex justify-between gap-2"><span>{item.description}{item.origin === "projected" ? " · Projetado" : ""}</span><span className="whitespace-nowrap">{formatCurrencyBRL(item.amountCents)}</span></li>)}</ul></details>}
    </div>)}</div>}
    {data && <div className="mt-3 flex justify-between gap-2 rounded-lg bg-(--color-primary-soft) p-3 text-xs"><span>Falta pagar</span><strong className="text-(--color-primary)">{formatCurrencyBRL(data.pendingCents)}</strong></div>}
    <Link href={`/cadastro?month=${encodeURIComponent(month)}`} className="mt-3 inline-block text-xs font-medium text-(--color-primary) hover:underline">Organizar no Cadastro →</Link>
    <p className="mt-2 text-xs text-(--color-text-secondary)">Valores já incluídos no orçamento. Sugestões pelo nome podem ser ajustadas no Cadastro.</p>
  </section>;
}
