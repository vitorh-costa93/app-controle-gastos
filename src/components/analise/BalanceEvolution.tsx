"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { MonthlyEvolutionChart } from "./MonthlyEvolutionChart";
import { BaseCaixinhaYield } from "@/components/simulacao/BaseCaixinhaYield";
import { getSimulationBudget } from "@/lib/data/simulation-budget";
import { accumulateBalance } from "@/lib/domain/finance";
import { formatMonthLabel } from "@/lib/utils/format";
import type { MonthSummary } from "@/types/domain";
import "./balance-evolution.css";

type Budget = Awaited<ReturnType<typeof getSimulationBudget>>;
type LoadState = { personId: string; status: "loading" | "error" } | { personId: string; status: "ready"; budget: Budget };

export function BalanceEvolution({ summaries, month, personId }: { summaries: MonthSummary[]; month: string; personId: string }) {
  const [mode, setMode] = useState<"monthly" | "accumulated">("monthly");
  const [state, setState] = useState<LoadState | null>(null);
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    if (mode !== "accumulated") return;
    let active = true;
    setState({ personId, status: "loading" });
    getSimulationBudget(personId || undefined).then(
      (budget) => { if (active) setState({ personId, status: "ready", budget }); },
      () => { if (active) setState({ personId, status: "error" }); },
    );
    return () => { active = false; };
  }, [mode, personId, retry]);
  const budget = state?.personId === personId && state.status === "ready" ? state.budget : null;
  const accumulated = useMemo(() => budget ? accumulateBalance(budget.baseSummaries, budget.startingBalance?.amountCents ?? 0, budget.startingBalance?.month) : [], [budget]);
  const [percentOfCdi, setPercentOfCdi] = useState(100);
  const cdi = budget?.cdi.annualPercent ?? 0;
  const link = personId ? `/simulacao?personId=${encodeURIComponent(personId)}` : "/simulacao";

  return (
    <section className="ma-panel ma-evolution">
      <div className="ma-heading balance-evolution-heading">
        <div><h2>Evolução do saldo</h2><p>{mode === "monthly" ? "Últimos 12 meses · sobra e taxa de poupança" : budget ? `${formatMonthLabel(budget.horizon.from)} → ${formatMonthLabel(budget.horizon.to)} · projeção da Simulação` : "Projeção da Simulação"}</p></div>
        <div className="balance-evolution-toggle" role="group" aria-label="Tipo de evolução">
          <button type="button" aria-pressed={mode === "monthly"} onClick={() => setMode("monthly")}>Mensal</button>
          <button type="button" aria-pressed={mode === "accumulated"} onClick={() => setMode("accumulated")}>Acumulado</button>
        </div>
      </div>
      {mode === "monthly" ? <div className="ma-evolution-chart"><MonthlyEvolutionChart summaries={summaries} selectedMonth={month} height="100%" /></div> : <>
        <div className="ma-evolution-chart">
          {budget ? <BaseCaixinhaYield summaries={budget.baseSummaries} accumulated={accumulated} cdiAnnualPercent={cdi} onCdiAnnualPercent={() => {}} percentOfCdi={percentOfCdi} onPercentOfCdi={setPercentOfCdi} horizon={budget.horizon} compact chartHeight="100%" /> : state?.personId === personId && state.status === "error" ? <p className="balance-evolution-status">Não foi possível carregar. <button type="button" onClick={() => setRetry((n) => n + 1)}>Tentar novamente</button></p> : <p className="balance-evolution-status" role="status">Carregando projeção…</p>}
        </div>
        <p className="balance-evolution-caption">Saldo · <span>rendimento bruto (100% do CDI; CDI {cdi ? cdi.toLocaleString("pt-BR") : "—"}% a.a.)</span>{personId ? " · saldo inicial individual: R$ 0" : ""} · <Link href={link}>Ver Simulação</Link></p>
      </>}
    </section>
  );
}
