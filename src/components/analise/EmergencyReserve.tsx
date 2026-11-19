"use client";

import { Pencil, ShieldCheck } from "lucide-react";
import { formatCurrencyBRL, formatMonthLabel } from "@/lib/utils/format";
import type { BalanceProjectionState } from "./useBalanceProjection";

export function EmergencyReserve({ balance, essential, targetMonths, targetAmountCents, month, onEdit }: {
  balance: BalanceProjectionState; essential: number; targetMonths: number; targetAmountCents: number | null; month: string; onEdit: () => void;
}) {
  const index = balance.accumulated.findIndex((point) => point.referenceMonth === month);
  // A Reserva de Emergência usa o saldo acumulado sem CDI (saldo real do mês atual + sobras futuras);
  // o rendimento do CDI incide apenas nos gráficos de Evolução do Saldo.
  const reserve = index >= 0 ? (balance.accumulated[index]?.accumulatedCents ?? balance.projection?.balanceSeriesCents[index] ?? null)
    : balance.budget?.startingBalance?.month === month ? balance.budget.startingBalance.amountCents : null;
  const target = targetAmountCents ?? essential * targetMonths;
  const available = Math.max(0, reserve ?? 0);
  const progress = target > 0 ? available / target * 100 : 0;
  const progressLabel = progress.toLocaleString("pt-BR", { maximumFractionDigits: 1 });
  return <section id="reserva" className="nm-panel nm-reserve">
    <span className="nm-reserve-icon"><ShieldCheck size={28} /></span>
    <div className="nm-reserve-info"><h2>Reserva de emergência</h2>
      {balance.status === "loading" ? <p role="status">Carregando saldo acumulado…</p> : balance.status === "error" ? <p role="alert">Não foi possível carregar. <button type="button" className="nm-link" onClick={balance.retry}>Tentar novamente</button></p> : reserve === null ? <p>Mês fora da projeção disponível. Confira o saldo de referência na Simulação.</p> : <>
        <p><strong className={reserve < 0 ? "nm-negative" : undefined}>{formatCurrencyBRL(reserve)}</strong></p>
        {target > 0 && <small>Meta: {formatCurrencyBRL(target)} <b className="nm-reserve-percent">{progressLabel}% da meta</b></small>}
        <small>Casal · {formatMonthLabel(month)} · saldo real da caixinha + sobras previstas (sem CDI)</small>
        {reserve < 0 ? <small>Saldo negativo neste mês; sem reserva disponível.</small> : essential > 0 ? <small>{(available / essential).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} meses de cobertura{targetAmountCents === null && <> · meta: {targetMonths} meses</>}</small> : <small>Escolha as categorias essenciais para calcular a cobertura.</small>}
      </>}
    </div>
    {balance.status === "ready" && reserve !== null && target > 0 && <div className="nm-reserve-progress" role="progressbar" aria-label="Progresso da reserva" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.min(100, progress)} aria-valuetext={`${progressLabel}% da meta`}><i style={{ width: `${Math.min(100, progress)}%` }} /></div>}
    <button type="button" className="nm-link" onClick={onEdit}><Pencil size={15} /> Editar meta</button>
  </section>;
}
