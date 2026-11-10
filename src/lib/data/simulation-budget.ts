"use server";

import { getBaseMonthSummaries } from "@/lib/data/simulation-analysis";
import { getStartingBalance } from "@/lib/data/settings";
import { syncSalaryIncomeTransactions } from "@/lib/data/salary";
import { listPeople } from "@/lib/data/reference";
import { getCdiRate } from "@/lib/data/cdi";
import { getDefaultSimulationHorizon } from "@/lib/domain/horizon";
import { addMonths } from "@/lib/utils/format";

/** Mesma base e horizonte usados pela projeção da Simulação. */
export async function getSimulationBudget(personId?: string) {
  if (personId && !(await listPeople()).some((person) => person.id === personId)) {
    throw new Error("Pessoa não encontrada.");
  }
  const defaultHorizon = getDefaultSimulationHorizon();
  await syncSalaryIncomeTransactions();
  const consolidatedStartingBalance = await getStartingBalance();
  const startingBalance = personId ? null : consolidatedStartingBalance;
  const afterBaseline = consolidatedStartingBalance ? addMonths(consolidatedStartingBalance.month, 1) : defaultHorizon.from;
  const horizon = { from: afterBaseline < defaultHorizon.from ? afterBaseline : defaultHorizon.from, to: defaultHorizon.to };
  const [baseSummariesMap, cdi] = await Promise.all([
    getBaseMonthSummaries(horizon, personId || undefined),
    getCdiRate(),
  ]);
  return { horizon, startingBalance, baseSummaries: Array.from(baseSummariesMap.values()), cdi };
}
