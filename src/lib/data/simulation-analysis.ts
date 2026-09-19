"use server";

import { listConsideredTransactionsInRange } from "./transactions";
import { listActiveRecurrenceRules } from "./recurrence";
import { buildMonthOccurrences, monthRange } from "@/lib/domain/recurrence";
import { summarizeMonth } from "@/lib/domain/finance";
import { summarizeScenarioImpact, ScenarioComparisonMonth } from "@/lib/domain/simulation";
import { MonthSummary, Simulation } from "@/types/domain";
import { isAiConfigured, generateSimulationSummary } from "@/lib/ai/openai";
import { formatCurrencyBRL, formatMonthLabel } from "@/lib/utils/format";

import { SimulationHorizon } from "@/lib/domain/horizon";
export type { SimulationHorizon } from "@/lib/domain/horizon";

export async function getBaseMonthSummaries(
  horizon: SimulationHorizon
): Promise<Map<string, MonthSummary>> {
  const [rules, transactions] = await Promise.all([
    listActiveRecurrenceRules(),
    listConsideredTransactionsInRange(horizon.from, horizon.to),
  ]);

  const months = monthRange(horizon.from, horizon.to);
  const map = new Map<string, MonthSummary>();
  for (const month of months) {
    map.set(month, summarizeMonth(month, buildMonthOccurrences(month, transactions, rules)));
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
Diferença no saldo acumulado ao final do horizonte, comparado ao cenário sem essa simulação: ${formatCurrencyBRL(impact.finalAccumulatedDifferenceCents)}.`;

  try {
    return await generateSimulationSummary(prompt);
  } catch {
    return "Não foi possível gerar a explicação agora. Tente novamente mais tarde.";
  }
}
