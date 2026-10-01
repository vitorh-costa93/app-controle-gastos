export const dynamic = "force-dynamic";
// Gerar a foto da simulação leva de 10 a 40s — mais que o timeout padrão da função.
export const maxDuration = 60;

import { listActiveSimulations, listArchivedSimulations } from "@/lib/data/simulations";
import { getBaseMonthSummaries } from "@/lib/data/simulation-analysis";
import { getStartingBalance } from "@/lib/data/settings";
import { syncSalaryIncomeTransactions } from "@/lib/data/salary";
import { getDefaultSimulationHorizon } from "@/lib/domain/horizon";
import { SimulacaoPageClient } from "@/components/simulacao/SimulacaoPageClient";

export default async function SimulacaoPage() {
  const horizon = getDefaultSimulationHorizon();
  // Antes de calcular: reflete no lançamento real de Salário qualquer atualização do
  // dashboard-psi (mesmo em mês já fechado).
  await syncSalaryIncomeTransactions();
  const [simulations, archived, baseSummariesMap, startingBalance] = await Promise.all([
    listActiveSimulations(),
    listArchivedSimulations(),
    getBaseMonthSummaries(horizon),
    getStartingBalance(),
  ]);

  return (
    <SimulacaoPageClient
      initialSimulations={simulations}
      initialArchived={archived}
      baseSummaries={Array.from(baseSummariesMap.values())}
      horizon={horizon}
      startingBalance={startingBalance}
    />
  );
}
