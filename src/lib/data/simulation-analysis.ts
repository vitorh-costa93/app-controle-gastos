"use server";

import { listConsideredTransactionsInRange } from "./transactions";
import { listActiveRecurrenceRules } from "./recurrence";
import { listPeople, listTransactionTypes } from "./reference";
import { getEstimatedSalaryOccurrences, getSalaryProjectionOccurrences } from "./salary";
import { monthRange } from "@/lib/domain/recurrence";
import { buildSimulationMonthOccurrences, isOpenMonth } from "@/lib/domain/simulation-baseline";
import { summarizeMonth } from "@/lib/domain/finance";
import { summarizeScenarioImpact, ScenarioComparisonMonth } from "@/lib/domain/simulation";
import { MonthSummary, MonthlyOccurrence, Simulation } from "@/types/domain";
import { isAiConfigured, generateSimulationSummary } from "@/lib/ai/openai";
import { formatCurrencyBRL, formatMonthLabel, toReferenceMonth } from "@/lib/utils/format";

import { SimulationHorizon } from "@/lib/domain/horizon";
export type { SimulationHorizon } from "@/lib/domain/horizon";

export async function getBaseMonthSummaries(
  horizon: SimulationHorizon
): Promise<Map<string, MonthSummary>> {
  const currentMonth = toReferenceMonth(new Date());
  const [rules, transactions, people, types] = await Promise.all([
    listActiveRecurrenceRules(),
    listConsideredTransactionsInRange(horizon.from, horizon.to),
    listPeople(),
    listTransactionTypes(),
  ]);

  const months = monthRange(horizon.from, horizon.to);
  // Gastos e entradas seguem exatamente Análise. Só o salário variável (Jaqueline) é estimado do mês
  // seguinte em diante: mesmo mês do ano anterior × YoY acumulado. Até o mês atual vale a regra de Análise.
  const currentOrPast = months.filter((m) => !isOpenMonth(m, currentMonth));
  const [estimatedSalary, analysisSalaryByMonth] = await Promise.all([
    getEstimatedSalaryOccurrences(months, people, types),
    currentOrPast.length > 0
      ? getSalaryProjectionOccurrences(currentOrPast, people, types, transactions)
      : Promise.resolve(new Map<string, MonthlyOccurrence[]>()),
  ]);
  const salaryByMonth = new Map([...analysisSalaryByMonth, ...estimatedSalary.byMonth]);

  const map = new Map<string, MonthSummary>();
  for (const month of months) {
    const occurrences = buildSimulationMonthOccurrences({
      month,
      currentMonth,
      transactions,
      rules,
      salaryOccurrences: salaryByMonth.get(month) ?? [],
      estimatedSalaryPersonId: estimatedSalary.personId,
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
