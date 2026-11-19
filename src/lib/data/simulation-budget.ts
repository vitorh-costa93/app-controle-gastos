"use server";

import { getBaseMonthSummaries } from "@/lib/data/simulation-analysis";
import { getStartingBalance } from "@/lib/data/settings";
import { syncSalaryIncomeTransactions } from "@/lib/data/salary";
import { listPeople } from "@/lib/data/reference";
import { getCdiRate } from "@/lib/data/cdi";
import { getDefaultSimulationHorizon } from "@/lib/domain/horizon";
import { getBrazilTodayParts } from "@/lib/domain/simulation-baseline";

/** Mesma base e horizonte usados pela projeção da Simulação. */
export async function getSimulationBudget(personId?: string) {
  if (personId && !(await listPeople()).some((person) => person.id === personId)) {
    throw new Error("Pessoa não encontrada.");
  }
  const defaultHorizon = getDefaultSimulationHorizon();
  const { month: currentMonth } = getBrazilTodayParts();
  await syncSalaryIncomeTransactions();
  const consolidatedStartingBalance = await getStartingBalance(true);
  // O saldo real informado na caixinha ancora sempre o mês atual (quando salvo para <= currentMonth),
  // garantindo que o saldo inicial do mês seguinte seja exatamente o final real do mês atual.
  const startingBalance = personId
    ? null
    : consolidatedStartingBalance
      ? {
          amountCents: consolidatedStartingBalance.amountCents,
          month: consolidatedStartingBalance.month < currentMonth ? currentMonth : consolidatedStartingBalance.month,
        }
      : null;
  const horizon = { from: defaultHorizon.from, to: defaultHorizon.to };
  const [baseSummariesMap, cdi] = await Promise.all([
    getBaseMonthSummaries(horizon, personId || undefined),
    getCdiRate(),
  ]);
  return { horizon, startingBalance, baseSummaries: Array.from(baseSummariesMap.values()), cdi };
}
