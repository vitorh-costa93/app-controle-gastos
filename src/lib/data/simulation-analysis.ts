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
import { isAiConfigured, generateSimulationSummary, generateCashVsInstallmentSummary } from "@/lib/ai/openai";
import { compareCashVsInstallments, CashVsInstallmentInput } from "@/lib/domain/cash-vs-installments";
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

export type CashVsInstallmentAiInput = CashVsInstallmentInput & { description: string };

/** Recalcula os números no servidor (não confia no cliente) e pede à IA a leitura do comparativo. */
export async function generateCashVsInstallmentAiSummary(input: CashVsInstallmentAiInput): Promise<string> {
  if (!isAiConfigured()) {
    return "A análise por IA ainda não está configurada. Adicione uma chave de API para habilitar esse recurso.";
  }
  const r = compareCashVsInstallments(input);
  const inst = r.installment;
  if (!inst) return "";
  const pct = (v: number) => `${(v * 100).toFixed(2).replace(".", ",")}%`;
  const brl = formatCurrencyBRL;
  const warnings = [
    r.cash.firstNegativeMonth !== null ? `À vista: o saldo acumulado do orçamento fica negativo (mínimo ${brl(r.cash.lowestBalanceCents)}).` : null,
    inst.scenario.firstNegativeMonth !== null ? `Parcelado: o saldo acumulado do orçamento fica negativo (mínimo ${brl(inst.scenario.lowestBalanceCents)}).` : null,
    r.cash.firstNegativeMonth === null && r.cash.lowestBalanceCents < inst.installmentCents ? `À vista: o saldo acumulado chega a só ${brl(r.cash.lowestBalanceCents)}, menos que uma parcela.` : null,
  ].filter(Boolean);

  const prompt = `Compra: "${input.description}".
Preço à vista: ${brl(input.cashPriceCents)}. Parcelado: ${input.installments}x de ${brl(inst.installmentCents)} (total ${brl(input.installmentTotalCents)}), primeira parcela 30 dias após a compra. Desconto à vista: ${pct(inst.cashDiscount)}.
Juros embutidos no parcelamento: ${brl(inst.interestCents)} (${pct(inst.impliedMonthlyRate)} ao mês, ${pct(inst.impliedAnnualRate)} ao ano).
Rendimento da Caixinha do Nubank: ${input.percentOfCdi}% do CDI (CDI ${input.cdiAnnualPercent.toFixed(2).replace(".", ",")}% a.a.): ${pct(r.monthlyRate)} ao mês bruto e ${pct(r.netMonthlyRate)} líquido de IR.
Saldo acumulado do orçamento antes da compra: ${brl(input.openingBalanceCents)}, somando as sobras mensais, aplicado até o fim das parcelas.
Rendimento líquido de IR no período: não comprar ${brl(r.none.netYieldCents)}; à vista ${brl(r.cash.netYieldCents)}; parcelado ${brl(inst.scenario.netYieldCents)} (${brl(inst.extraYieldCents)} a mais que o à vista).
Saldo final: à vista ${brl(r.cash.finalNetCents)}; parcelado ${brl(inst.scenario.finalNetCents)}.
Resultado: ${inst.winner === "cash" ? `pagar à vista deixa ${brl(inst.advantageCashCents)} a mais no saldo final` : inst.winner === "installment" ? `parcelar deixa ${brl(-inst.advantageCashCents)} a mais no saldo final` : "empate"}.
Ponto de equilíbrio: parcelar só empata se o total for ${brl(inst.breakEvenTotalCents)} (${input.installments}x de ${brl(inst.breakEvenInstallmentCents)}).
${warnings.join("\n")}`;

  try {
    return await generateCashVsInstallmentSummary(prompt);
  } catch {
    return "Não foi possível gerar a análise agora. Tente novamente mais tarde.";
  }
}
