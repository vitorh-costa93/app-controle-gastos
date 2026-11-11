import type { MonthSummary } from "@/types/domain";
import type { getSimulationBudget } from "@/lib/data/simulation-budget";
import { projectCaixinha, type CaixinhaProjection } from "./cash-vs-installments";
import { accumulateBalance } from "./finance";

export type SimulationBudget = Awaited<ReturnType<typeof getSimulationBudget>>;
export type AccumulatedBalancePoint = ReturnType<typeof accumulateBalance>[number];

export function projectAccumulatedYield(
  summaries: MonthSummary[],
  accumulated: AccumulatedBalancePoint[],
  cdiAnnualPercent: number,
  percentOfCdi: number,
): CaixinhaProjection | null {
  if (accumulated.length === 0 || summaries.length === 0) return null;
  // Preserve the simulation's monthly changes, including an anchored balance.
  const changes = accumulated.map((p, i) => (i === 0 ? summaries[0].leftoverCents : p.accumulatedCents - accumulated[i - 1].accumulatedCents));
  const opening = accumulated[0].accumulatedCents - changes[0];
  return projectCaixinha(opening, changes, cdiAnnualPercent, percentOfCdi);
}

export function buildBalanceProjection(budget: SimulationBudget) {
  const accumulated = accumulateBalance(budget.baseSummaries, budget.startingBalance?.amountCents ?? 0, budget.startingBalance?.month);
  const projection = projectAccumulatedYield(budget.baseSummaries, accumulated, budget.cdi.annualPercent, 100);
  return { accumulated, projection };
}
