export const dynamic = "force-dynamic";
// Gerar a foto da simulação leva de 10 a 40s — mais que o timeout padrão da função.
export const maxDuration = 60;

import { listActiveSimulations } from "@/lib/data/simulations";
import { getBaseMonthSummaries } from "@/lib/data/simulation-analysis";
import { getStartingBalance } from "@/lib/data/settings";
import { getDefaultSimulationHorizon } from "@/lib/domain/horizon";
import { SimulacaoPageClient } from "@/components/simulacao/SimulacaoPageClient";

export default async function SimulacaoPage() {
  const horizon = getDefaultSimulationHorizon();
  const [simulations, baseSummariesMap, startingBalance] = await Promise.all([
    listActiveSimulations(),
    getBaseMonthSummaries(horizon),
    getStartingBalance(),
  ]);

  return (
    <SimulacaoPageClient
      initialSimulations={simulations}
      baseSummaries={Array.from(baseSummariesMap.values())}
      horizon={horizon}
      startingBalance={startingBalance}
    />
  );
}
