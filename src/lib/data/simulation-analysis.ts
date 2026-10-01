"use server";

import { listConsideredTransactionsInRange } from "./transactions";
import { listActiveRecurrenceRules } from "./recurrence";
import { listPeople, listTransactionTypes } from "./reference";
import { getSalaryProjectionOccurrences } from "./salary";
import { getEstimatedExpenses } from "./estimates";
import { monthRange } from "@/lib/domain/recurrence";
import {
  MonthlyEstimate,
  averageUnplannedCents,
  buildSimulationMonthOccurrences,
  isOpenMonth,
} from "@/lib/domain/simulation-baseline";
import { summarizeMonth } from "@/lib/domain/finance";
import { summarizeScenarioImpact, ScenarioComparisonMonth } from "@/lib/domain/simulation";
import { MonthSummary, Simulation } from "@/types/domain";
import { isAiConfigured, generateSimulationSummary } from "@/lib/ai/openai";
import { addMonths, formatCurrencyBRL, formatMonthLabel, toReferenceMonth } from "@/lib/utils/format";

import { SimulationHorizon } from "@/lib/domain/horizon";
export type { SimulationHorizon } from "@/lib/domain/horizon";

export async function getBaseMonthSummaries(
  horizon: SimulationHorizon
): Promise<Map<string, MonthSummary>> {
  const currentMonth = toReferenceMonth(new Date());
  const [rules, transactions, people, types, configuredEstimates] = await Promise.all([
    listActiveRecurrenceRules(),
    listConsideredTransactionsInRange(horizon.from, horizon.to),
    listPeople(),
    listTransactionTypes(),
    getEstimatedExpenses(),
  ]);

  const months = monthRange(horizon.from, horizon.to);
  // Mesma projeção de salário variável usada em Análise — o horizonte de Simulação é
  // majoritariamente futuro, então sem isso a receita da pessoa de salário variável
  // simplesmente sumia do saldo acumulado projetado a partir do mês seguinte.
  const salaryByMonth = await getSalaryProjectionOccurrences(months, people, types, transactions);

  // Mês aberto (atual e seguintes) usa o gasto variável ESTIMADO, não o que já foi lançado: o real só
  // entra quando o mês fecha. Sem "Gastos estimados" configurados, usa a média dos 3 últimos meses fechados.
  let estimates: MonthlyEstimate[] = configuredEstimates.filter((e) => e.amountCents > 0);
  const fallbackPerson = people[0];
  if (estimates.length === 0 && fallbackPerson && months.some((m) => isOpenMonth(m, currentMonth))) {
    const recentMonths = monthRange(addMonths(currentMonth, -3), addMonths(currentMonth, -1));
    const recent = await listConsideredTransactionsInRange(recentMonths[0], recentMonths[recentMonths.length - 1]);
    const average = averageUnplannedCents(recent, recentMonths);
    if (average > 0) {
      estimates = [
        { id: "media", label: "Gasto variável médio", personId: fallbackPerson.id, categoryId: null, typeId: null, amountCents: average },
      ];
    }
  }

  const map = new Map<string, MonthSummary>();
  for (const month of months) {
    const occurrences = buildSimulationMonthOccurrences({
      month,
      currentMonth,
      transactions,
      rules,
      salaryOccurrences: salaryByMonth.get(month) ?? [],
      estimates,
    });
    map.set(month, summarizeMonth(month, occurrences));
  }
  return map;
}

export async function generateScenarioAiSummary(
  simulation: Simulation,
  comparison: ScenarioComparisonMonth[]
): Promise<string> {
  if (!isAiConfigured()) {
    return "A explicação por IA ainda não está configurada. Adicione uma chave de API para habilitar esse recurso.";
  }

  const impact = summarizeScenarioImpact(simulation, comparison);

  const prompt = `Simulação: "${simulation.description}".
Valor total: ${formatCurrencyBRL(simulation.totalAmountCents)} em ${simulation.installments}x de ${formatCurrencyBRL(simulation.installmentAmountCents)}.
Período de impacto: ${formatMonthLabel(impact.startMonth)} até ${formatMonthLabel(impact.endMonth)}.
Impacto médio mensal: ${formatCurrencyBRL(impact.averageMonthlyImpactCents)}.
${impact.mostImpactedMonth ? `Mês de maior impacto: ${formatMonthLabel(impact.mostImpactedMonth.referenceMonth)}, com ${formatCurrencyBRL(impact.mostImpactedMonth.impactCents)}.` : ""}
${impact.lowestBalanceMonth ? `Menor saldo acumulado projetado: ${formatCurrencyBRL(impact.lowestBalanceMonth.accumulatedCents)} em ${formatMonthLabel(impact.lowestBalanceMonth.referenceMonth)}.` : ""}
Diferença no saldo acumulado ao final do horizonte, comparado ao cenário sem essa simulação: ${formatCurrencyBRL(impact.finalAccumulatedDifferenceCents)}.
${impact.payback ? `Payback (tempo para a sobra estimada repor o valor): ${impact.payback.months} meses, em ${formatMonthLabel(impact.payback.referenceMonth)}.` : "Payback: a sobra atual não repõe o valor."}`;

  try {
    return await generateSimulationSummary(prompt);
  } catch {
    return "Não foi possível gerar a explicação agora. Tente novamente mais tarde.";
  }
}
