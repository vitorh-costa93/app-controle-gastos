import { MonthSummary, Simulation } from "@/types/domain";
import { addMonths } from "@/lib/utils/format";
import { CashVsInstallmentInput } from "./cash-vs-installments";

export interface YieldParams {
  cdiAnnualPercent: number;
  percentOfCdi: number;
}

/**
 * Monta a entrada do comparativo a partir do orçamento base (sem nenhuma simulação): o saldo acumulado ao fim do mês
 * anterior à compra e a sobra de cada mês seguinte. Devolve null quando a simulação não tem preço à vista.
 */
export function buildCashVsInstallmentInput(
  simulation: Simulation,
  params: YieldParams,
  baseSummaries: MonthSummary[],
  baseAccumulated: { referenceMonth: string; accumulatedCents: number }[]
): CashVsInstallmentInput | null {
  if (simulation.cashPriceCents == null || simulation.cashPriceCents <= 0) return null;

  const startMonth = simulation.startDate.slice(0, 7);
  const hasInstallments = simulation.installments > 1;
  const horizon = hasInstallments ? simulation.installments : 12;
  const leftoverByMonth = new Map(baseSummaries.map((s) => [s.referenceMonth, s.leftoverCents]));
  const accumulatedByMonth = new Map(baseAccumulated.map((p) => [p.referenceMonth, p.accumulatedCents]));

  // Saldo ao fim do mês anterior; se a compra é no primeiro mês do horizonte, tira a sobra dele do acumulado.
  const previous = accumulatedByMonth.get(addMonths(startMonth, -1));
  const first = baseAccumulated[0];
  const opening =
    previous ??
    (first
      ? startMonth <= first.referenceMonth
        ? first.accumulatedCents - (leftoverByMonth.get(first.referenceMonth) ?? 0)
        : (baseAccumulated[baseAccumulated.length - 1]?.accumulatedCents ?? 0)
      : 0);

  return {
    cashPriceCents: simulation.cashPriceCents,
    installmentTotalCents: hasInstallments ? simulation.totalAmountCents : simulation.cashPriceCents,
    installments: hasInstallments ? simulation.installments : 1,
    openingBalanceCents: opening,
    monthlyLeftoverCents: Array.from({ length: horizon + 1 }, (_, i) => leftoverByMonth.get(addMonths(startMonth, i)) ?? null),
    ...params,
  };
}
