export const dynamic = "force-dynamic";
// Gerar a foto da simulação leva de 10 a 40s — mais que o timeout padrão da função.
export const maxDuration = 60;

import { listActiveSimulations, listArchivedSimulations } from "@/lib/data/simulations";
import { getSimulationBudget } from "@/lib/data/simulation-budget";
import { SimulacaoPageClient } from "@/components/simulacao/SimulacaoPageClient";
import { listPeople } from "@/lib/data/reference";

export default async function SimulacaoPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const people = await listPeople();
  const personId = typeof sp.personId === "string" && people.some((p) => p.id === sp.personId) ? sp.personId : "";
  const [simulations, archived, budget] = await Promise.all([
    listActiveSimulations(),
    listArchivedSimulations(),
    getSimulationBudget(personId || undefined),
  ]);

  return (
    <SimulacaoPageClient
      key={personId || "couple"}
      people={people}
      personId={personId}
      initialSimulations={simulations}
      initialArchived={archived}
      {...budget}
    />
  );
}
