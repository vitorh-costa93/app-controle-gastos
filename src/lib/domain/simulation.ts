import { Simulation, MonthSummary } from "@/types/domain";
import { addMonths } from "@/lib/utils/format";
import { monthRange } from "./recurrence";

export interface SimulationInstallmentImpact {
  referenceMonth: string;
  amountCents: number;
  installmentNumber: number;
}

/** Parcelado com preço à vista informado: a cobrança começa um mês depois da data de início. */
export function hasDeferredFirstInstallment(simulation: Simulation): boolean {
  return simulation.cashPriceCents != null && simulation.installments > 1;
}

/**
 * Calcula o impacto mensal de uma simulação parcelada, distribuindo o valor
 * total a partir do mês de início. A última parcela absorve o resto da divisão
 * para que a soma das parcelas seja sempre exatamente o valor total.
 */
export function calcSimulationInstallments(simulation: Simulation): SimulationInstallmentImpact[] {
  const baseInstallment = Math.floor(simulation.totalAmountCents / simulation.installments);
  const remainder = simulation.totalAmountCents - baseInstallment * simulation.installments;
  // Com preço à vista informado, a data de início é a da compra: a 1ª parcela cai 30 dias depois.
  const startMonth = addMonths(simulation.startDate.slice(0, 7), hasDeferredFirstInstallment(simulation) ? 1 : 0);

  return Array.from({ length: simulation.installments }, (_, i) => {
    const isLast = i === simulation.installments - 1;
    return {
      referenceMonth: addMonths(startMonth, i),
      amountCents: baseInstallment + (isLast ? remainder : 0),
      installmentNumber: i + 1,
    };
  });
}

/** Soma o impacto mensal (centavos) de várias simulações combinadas, por mês. */
export function combineSimulationImpacts(
  simulations: Simulation[]
): Map<string, number> {
  const impactByMonth = new Map<string, number>();
  for (const simulation of simulations) {
    for (const installment of calcSimulationInstallments(simulation)) {
      impactByMonth.set(
        installment.referenceMonth,
        (impactByMonth.get(installment.referenceMonth) ?? 0) + installment.amountCents
      );
    }
  }
  return impactByMonth;
}

export interface ScenarioComparisonMonth {
  referenceMonth: string;
  leftoverWithoutCents: number;
  leftoverWithCents: number;
  accumulatedWithoutCents: number;
  accumulatedWithCents: number;
  impactCents: number;
}

/**
 * Compara o cenário base (sem simulação) com o cenário incluindo o impacto das
 * simulações selecionadas, mês a mês, ao longo do horizonte informado.
 */
export function buildScenarioComparison(
  baseSummaries: Map<string, MonthSummary>,
  simulations: Simulation[],
  horizon: { from: string; to: string },
  startingBalanceCents = 0,
  baselineMonth?: string
): ScenarioComparisonMonth[] {
  const impactByMonth = combineSimulationImpacts(simulations);
  const months = monthRange(horizon.from, horizon.to);

  // Saldo ancorado num mês anterior ao primeiro do horizonte: já vale desde o início, e as sobras somam em cima.
  const startsAfterBaseline = !baselineMonth || (months[0] !== undefined && months[0] > baselineMonth);
  let accWithout = startsAfterBaseline ? startingBalanceCents : 0;
  let accWith = startsAfterBaseline ? startingBalanceCents : 0;

  return months.map((month) => {
    const base = baseSummaries.get(month) ?? {
      referenceMonth: month,
      incomeCents: 0,
      expenseCents: 0,
      leftoverCents: 0,
    };
    const impactCents = impactByMonth.get(month) ?? 0;

    const leftoverWithoutCents = base.leftoverCents;
    const leftoverWithCents = base.leftoverCents - impactCents;

    if (month === baselineMonth) {
      accWithout = startingBalanceCents;
      accWith = startingBalanceCents;
    } else {
      accWithout += leftoverWithoutCents;
      accWith += leftoverWithCents;
    }

    return {
      referenceMonth: month,
      leftoverWithoutCents,
      leftoverWithCents,
      accumulatedWithoutCents: accWithout,
      accumulatedWithCents: accWith,
      impactCents,
    };
  });
}

export interface SimulationPayback {
  /** Meses, contados do início da simulação, até a sobra estimada acumulada cobrir o valor investido. */
  months: number;
  /** Mês em que isso acontece. */
  referenceMonth: string;
  /** true quando passou do horizonte e o prazo foi estendido pela sobra média mensal. */
  extrapolated: boolean;
}

/**
 * Payback: quanto tempo a sobra estimada do orçamento (sem a simulação) leva para repor o valor
 * total gasto. Soma a sobra mês a mês a partir do início; se o horizonte acabar antes, estende pela
 * média. null quando a sobra média não é positiva (o valor nunca volta).
 */
export function calcPayback(
  totalAmountCents: number,
  startMonth: string,
  comparison: ScenarioComparisonMonth[]
): SimulationPayback | null {
  const fromStart = comparison.filter((m) => m.referenceMonth >= startMonth);
  if (fromStart.length === 0 || totalAmountCents <= 0) return null;

  let accumulated = 0;
  for (let i = 0; i < fromStart.length; i++) {
    accumulated += fromStart[i].leftoverWithoutCents;
    if (accumulated >= totalAmountCents) {
      return { months: i + 1, referenceMonth: fromStart[i].referenceMonth, extrapolated: false };
    }
  }

  const average = accumulated / fromStart.length;
  if (average <= 0) return null;
  const extra = Math.ceil((totalAmountCents - accumulated) / average);
  const months = fromStart.length + extra;
  return { months, referenceMonth: addMonths(startMonth, months - 1), extrapolated: true };
}

export interface SimulationImpactSummary {
  payback: SimulationPayback | null;
  totalAmountCents: number;
  installmentAmountCents: number;
  installments: number;
  startMonth: string;
  endMonth: string;
  averageMonthlyImpactCents: number;
  lowestBalanceMonth: { referenceMonth: string; accumulatedCents: number } | null;
  finalAccumulatedDifferenceCents: number;
  mostImpactedMonth: { referenceMonth: string; impactCents: number } | null;
}

export function summarizeScenarioImpact(
  simulation: Simulation,
  comparison: ScenarioComparisonMonth[]
): SimulationImpactSummary {
  const installments = calcSimulationInstallments(simulation);
  const impactedMonths = comparison.filter((m) => m.impactCents !== 0);

  const lowest = comparison.reduce<ScenarioComparisonMonth | null>((min, m) => {
    if (!min || m.accumulatedWithCents < min.accumulatedWithCents) return m;
    return min;
  }, null);

  const mostImpacted = impactedMonths.reduce<ScenarioComparisonMonth | null>((max, m) => {
    if (!max || m.impactCents > max.impactCents) return m;
    return max;
  }, null);

  const last = comparison[comparison.length - 1];
  const totalMonthsWithImpact = impactedMonths.length || 1;
  const averageMonthlyImpactCents = Math.round(
    impactedMonths.reduce((sum, m) => sum + m.impactCents, 0) / totalMonthsWithImpact
  );

  const startMonth = installments[0]?.referenceMonth ?? simulation.startDate.slice(0, 7);

  return {
    payback: calcPayback(simulation.totalAmountCents, startMonth, comparison),
    totalAmountCents: simulation.totalAmountCents,
    installmentAmountCents: simulation.installmentAmountCents,
    installments: simulation.installments,
    startMonth,
    endMonth: installments[installments.length - 1]?.referenceMonth ?? simulation.startDate.slice(0, 7),
    averageMonthlyImpactCents,
    lowestBalanceMonth: lowest
      ? { referenceMonth: lowest.referenceMonth, accumulatedCents: lowest.accumulatedWithCents }
      : null,
    finalAccumulatedDifferenceCents: last
      ? last.accumulatedWithCents - last.accumulatedWithoutCents
      : 0,
    mostImpactedMonth: mostImpacted
      ? { referenceMonth: mostImpacted.referenceMonth, impactCents: mostImpacted.impactCents }
      : null,
  };
}
