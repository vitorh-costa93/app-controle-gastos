"use client";

import { Pencil, ShieldCheck } from "lucide-react";
import { formatCurrencyBRL, formatMonthLabel } from "@/lib/utils/format";
import type { BalanceProjectionState } from "./useBalanceProjection";

export function EmergencyReserve({ balance, essential, targetMonths, month, personId, onEdit }: {
  balance: BalanceProjectionState; essential: number; targetMonths: number; month: string; personId: string; onEdit: () => void;
}) {
  const index = balance.accumulated.findIndex((point) => point.referenceMonth === month);
  const reserve = index >= 0 ? balance.projection?.balanceSeriesCents[index] ?? null
    : balance.budget?.startingBalance?.month === month ? balance.budget.startingBalance.amountCents : null;
  const target = essential * targetMonths;
  const available = Math.max(0, reserve ?? 0);
  return <section id="reserva" className="nm-panel nm-reserve">
    <span className="nm-reserve-icon"><ShieldCheck size={28} /></span>
    <div className="nm-reserve-info"><h2>Reserva de emergência</h2>
      {balance.status === "loading" ? <p role="status">Carregando saldo acumulado…</p> : balance.status === "error" ? <p role="alert">Não foi possível carregar. <button type="button" className="nm-link" onClick={balance.retry}>Tentar novamente</button></p> : reserve === null ? <p>Mês fora da projeção disponível. Confira o saldo de referência na Simulação.</p> : <>
        <p><strong className={reserve < 0 ? "nm-negative" : undefined}>{formatCurrencyBRL(reserve)}</strong>{target > 0 && <> / {formatCurrencyBRL(target)}</>}</p>
        <small>{formatMonthLabel(month)} · acumulado com rendimento bruto · 100% do CDI</small>
        {reserve < 0 ? <small>Saldo negativo neste mês; sem reserva disponível.</small> : essential > 0 ? <small>{(available / essential).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} meses de cobertura · meta: {targetMonths} meses</small> : <small>Escolha as categorias essenciais para calcular a cobertura.</small>}
        {personId && <small>Saldo inicial individual: R$ 0, conforme a Simulação.</small>}
      </>}
    </div>
    {balance.status === "ready" && reserve !== null && target > 0 && <div className="nm-reserve-progress" aria-label={`Progresso da reserva: ${Math.round(available / target * 100)}%`}><i style={{ width: `${Math.min(100, available / target * 100)}%` }} /></div>}
    <button type="button" className="nm-link" onClick={onEdit}><Pencil size={15} /> Editar reserva</button>
  </section>;
}
