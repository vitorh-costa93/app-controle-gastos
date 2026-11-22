import { MonthSummary, Simulation } from "@/types/domain";
import { addMonths } from "@/lib/utils/format";
import { CashVsInstallmentInput } from "./cash-vs-installments";

export interface YieldParams {
  cdiAnnualPercent: number;
  percentOfCdi: number;
}

function monthDiff(fromMonth: string, toMonth: string): number {
  const [fy, fm] = fromMonth.split("-").map(Number);
  const [ty, tm] = toMonth.split("-").map(Number);
  return (ty - fy) * 12 + (tm - fm);
}

/**
 * Monta a entrada do comparativo a partir do orçamento base (sem nenhuma simulação): o saldo acumulado ao fim do mês
 * anterior à compra e a sobra de cada mês seguinte. Aceita uma ou múltiplas compras combinadas.
 */
export function buildCashVsInstallmentInput(
  simulation: Simulation | Simulation[],
  params: YieldParams,
  baseSummaries: MonthSummary[],
  baseAccumulated: { referenceMonth: string; accumulatedCents: number }[]
): CashVsInstallmentInput | null {
  const list = Array.isArray(simulation) ? simulation : [simulation];
  if (list.length === 0) return null;

  if (list.length === 1) {
    const sim = list[0];
    if (sim.cashPriceCents == null || sim.cashPriceCents <= 0) return null;

    const startMonth = sim.startDate.slice(0, 7);
    const hasInstallments = sim.installments > 1;
    const horizon = hasInstallments ? sim.installments : 12;
    const leftoverByMonth = new Map(baseSummaries.map((s) => [s.referenceMonth, s.leftoverCents]));
    const accumulatedByMonth = new Map(baseAccumulated.map((p) => [p.referenceMonth, p.accumulatedCents]));

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
      cashPriceCents: sim.cashPriceCents,
      installmentTotalCents: hasInstallments ? sim.totalAmountCents : sim.cashPriceCents,
      installments: hasInstallments ? sim.installments : 1,
      openingBalanceCents: opening,
      monthlyLeftoverCents: Array.from({ length: horizon + 1 }, (_, i) => leftoverByMonth.get(addMonths(startMonth, i)) ?? null),
      ...params,
    };
  }

  // Múltiplas compras combinadas: soma os fluxos à vista e parcelados no mesmo horizonte.
  const cashOf = (s: Simulation) => (s.cashPriceCents != null && s.cashPriceCents > 0 ? s.cashPriceCents : s.totalAmountCents);
  const startMonth = list.map((s) => s.startDate.slice(0, 7)).sort()[0];
  const hasInstallments = list.some((s) => s.installments > 1);
  let maxEndOffset = 0;
  for (const s of list) {
    const offset = Math.max(0, monthDiff(startMonth, s.startDate.slice(0, 7)));
    const endOffset = offset + (s.installments > 1 ? s.installments : 0);
    if (endOffset > maxEndOffset) maxEndOffset = endOffset;
  }
  const horizon = hasInstallments ? Math.max(1, maxEndOffset) : Math.max(12, maxEndOffset);

  const cashOutflowsCents = Array.from({ length: horizon + 1 }, () => 0);
  const installmentOutflowsCents = Array.from({ length: horizon + 1 }, () => 0);
  let cashPriceCents = 0;
  let installmentTotalCents = 0;

  for (const s of list) {
    const offset = Math.max(0, monthDiff(startMonth, s.startDate.slice(0, 7)));
    const cash = cashOf(s);
    cashPriceCents += cash;
    cashOutflowsCents[offset] += cash;

    if (s.installments > 1) {
      installmentTotalCents += s.totalAmountCents;
      const perInstallment = s.totalAmountCents / s.installments;
      for (let i = 1; i <= s.installments; i++) {
        installmentOutflowsCents[offset + i] += perInstallment;
      }
    } else {
      installmentTotalCents += cash;
      installmentOutflowsCents[offset] += cash;
    }
  }

  if (cashPriceCents <= 0) return null;

  const leftoverByMonth = new Map(baseSummaries.map((s) => [s.referenceMonth, s.leftoverCents]));
  const accumulatedByMonth = new Map(baseAccumulated.map((p) => [p.referenceMonth, p.accumulatedCents]));
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
    cashPriceCents,
    installmentTotalCents,
    installments: hasInstallments ? horizon : 1,
    openingBalanceCents: opening,
    monthlyLeftoverCents: Array.from({ length: horizon + 1 }, (_, i) => leftoverByMonth.get(addMonths(startMonth, i)) ?? null),
    cashOutflowsCents,
    installmentOutflowsCents,
    ...params,
  };
}
