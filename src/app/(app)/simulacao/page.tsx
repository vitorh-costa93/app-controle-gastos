export const dynamic = "force-dynamic";

import { listActiveSimulations } from "@/lib/data/simulations";
import { getBaseMonthSummaries } from "@/lib/data/simulation-analysis";
import { getDefaultSimulationHorizon } from "@/lib/domain/horizon";
import { SimulacaoPageClient } from "@/components/simulacao/SimulacaoPageClient";

export default async function SimulacaoPage() {
  const horizon = getDefaultSimulationHorizon();
  const [simulations, baseSummariesMap] = await Promise.all([
    listActiveSimulations(),
    getBaseMonthSummaries(horizon),
  ]);

  return (
    <SimulacaoPageClient
      initialSimulations={simulations}
      baseSummaries={Array.from(baseSummariesMap.values())}
      horizon={horizon}
    />
  );
}
