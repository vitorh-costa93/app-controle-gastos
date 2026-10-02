export const dynamic = "force-dynamic";
// Gerar a foto da simulação leva de 10 a 40s — mais que o timeout padrão da função.
export const maxDuration = 60;

import { listActiveSimulations, listArchivedSimulations } from "@/lib/data/simulations";
import { getBaseMonthSummaries } from "@/lib/data/simulation-analysis";
import { getStartingBalance } from "@/lib/data/settings";
import { syncSalaryIncomeTransactions } from "@/lib/data/salary";
import { getDefaultSimulationHorizon } from "@/lib/domain/horizon";
import { addMonths } from "@/lib/utils/format";
import { getCdiRate } from "@/lib/data/cdi";
import { SimulacaoPageClient } from "@/components/simulacao/SimulacaoPageClient";

export default async function SimulacaoPage() {
  const defaultHorizon = getDefaultSimulationHorizon();
  // Antes de calcular: reflete no lançamento real de Salário qualquer atualização do
  // dashboard-psi (mesmo em mês já fechado).
  await syncSalaryIncomeTransactions();
  const startingBalance = await getStartingBalance();
  // O saldo inicial é o de um mês já fechado: o horizonte começa no mês seguinte a ele, para que os meses
  // consolidados entre o saldo inicial e hoje (ex.: outubro) entrem com o valor real, e só depois os estimados.
  const afterBaseline = startingBalance ? addMonths(startingBalance.month, 1) : defaultHorizon.from;
  const horizon = { from: afterBaseline < defaultHorizon.from ? afterBaseline : defaultHorizon.from, to: defaultHorizon.to };
  const [simulations, archived, baseSummariesMap, cdi] = await Promise.all([
    listActiveSimulations(),
    listArchivedSimulations(),
    getBaseMonthSummaries(horizon),
    getCdiRate(),
  ]);

  return (
    <SimulacaoPageClient
      initialSimulations={simulations}
      initialArchived={archived}
      baseSummaries={Array.from(baseSummariesMap.values())}
      horizon={horizon}
      startingBalance={startingBalance}
      cdi={cdi}
    />
  );
}
