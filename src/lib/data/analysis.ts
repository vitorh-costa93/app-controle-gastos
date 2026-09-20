"use server";

import { unstable_cache } from "next/cache";
import { listConsideredTransactionsInRange, listTransactionsForMonth } from "./transactions";
import { listActiveRecurrenceRules } from "./recurrence";
import { listPeople, listCategories, listTransactionTypes } from "./reference";
import { getSalaryProjectionOccurrences } from "./salary";
import { buildMonthOccurrences, monthRange } from "@/lib/domain/recurrence";
import { summarizeMonth, breakdownByCategory, breakdownByKey } from "@/lib/domain/finance";
import { addMonths } from "@/lib/utils/format";
import { isAiConfigured, generateMonthInsight } from "@/lib/ai/openai";
import { MonthSummary, MonthlyOccurrence, Transaction } from "@/types/domain";
import { Person, Category, TransactionType } from "@/types/db";

export interface AnalysisData {
  month: string;
  summaries: MonthSummary[];
  currentSummary: MonthSummary;
  previousSummary: MonthSummary | null;
  categoryBreakdown: { categoryId: string | null; amountCents: number; percent: number }[];
  typeBreakdown: { key: string | null; amountCents: number; percent: number }[];
  personBreakdown: { key: string | null; amountCents: number; percent: number }[];
  people: Person[];
  categories: Category[];
  types: TransactionType[];
  hasEnoughHistory: boolean;
}

/**
 * Trocar de mês em Análise refazia sempre 12 meses de consultas do zero — cacheado
 * por mês+pessoa (300s ou até uma mutação relevante invalidar a tag "analysis") pra
 * deixar a navegação entre meses instantânea na maioria das vezes.
 */
export const getAnalysisData = unstable_cache(
  async (month: string, personId?: string): Promise<AnalysisData> => {
    return computeAnalysisData(month, personId);
  },
  ["analysis-data"],
  { tags: ["analysis"], revalidate: 300 }
);

/** `personId` restringe tudo (KPIs, gráficos, breakdowns) a uma única pessoa — "ver o todo" quando omitido. */
async function computeAnalysisData(month: string, personId?: string): Promise<AnalysisData> {
  const from12 = addMonths(month, -11);
  const [allRules, people, categories, types] = await Promise.all([
    listActiveRecurrenceRules(),
    listPeople(),
    listCategories(),
    listTransactionTypes(),
  ]);
  const rules = personId ? allRules.filter((r) => r.personId === personId) : allRules;
  const allTransactions = await listConsideredTransactionsInRange(from12, month);
  const transactions = personId ? allTransactions.filter((t) => t.personId === personId) : allTransactions;
  const months = monthRange(from12, month);

  // Preenche meses futuros sem lançamento real com o salário variável projetado
  // (dias úteis) — senão Análise simplesmente não via essa receita nesses meses.
  const salaryByMonth = await getSalaryProjectionOccurrences(months, people, types, allTransactions, personId);
  const withSalary = (m: string, occ: MonthlyOccurrence[]) => [...occ, ...(salaryByMonth.get(m) ?? [])];

  const summaries = months.map((m) => summarizeMonth(m, withSalary(m, buildMonthOccurrences(m, transactions, rules))));
  const currentSummary = summaries[summaries.length - 1];
  const previousSummary = summaries.length > 1 ? summaries[summaries.length - 2] : null;

  const currentOccurrences = withSalary(month, buildMonthOccurrences(month, transactions, rules));
  const categoryBreakdown = breakdownByCategory(currentOccurrences, "expense");
  const typeBreakdown = breakdownByKey(currentOccurrences, "typeId", "expense");
  const personBreakdown = breakdownByKey(currentOccurrences, "personId", "expense");

  const monthsWithData = summaries.filter((s) => s.incomeCents > 0 || s.expenseCents > 0).length;

  return {
    month,
    summaries,
    currentSummary,
    previousSummary,
    categoryBreakdown,
    typeBreakdown,
    personBreakdown,
    people,
    categories,
    types,
    hasEnoughHistory: monthsWithData >= 2,
  };
}

/**
 * Combina os dois fetches do "caminho rápido" (KPIs/gráficos + tabela detalhada) numa
 * única ida ao servidor — usada pela troca de mês/pessoa client-side em Análise, pra
 * não pagar 3 round-trips (um por chamada) numa navegação que precisa parecer instantânea.
 * Função async simples (não embrulhada em unstable_cache) de propósito: é o alvo direto
 * de uma Server Action chamada do client, e precisa ter essa forma pro Next reconhecer.
 */
export async function fetchAnalysisPageData(
  month: string,
  personId?: string
): Promise<{ data: AnalysisData; transactions: Transaction[] }> {
  const [data, transactions] = await Promise.all([
    getAnalysisData(month, personId),
    listTransactionsForMonth(month, personId),
  ]);
  return { data, transactions };
}

export async function getMonthInsight(month: string, personId?: string): Promise<string> {
  const data = await getAnalysisData(month, personId);

  if (!data.hasEnoughHistory) {
    return "Ainda não há dados suficientes para gerar um insight confiável. Cadastre lançamentos em pelo menos dois meses para comparações.";
  }

  if (!isAiConfigured()) {
    return "A geração de insights por IA ainda não está configurada. Adicione uma chave de API para habilitar esse recurso.";
  }

  const categoriesById = new Map(data.categories.map((c) => [c.id, c.name]));
  const topCategories = data.categoryBreakdown
    .slice(0, 5)
    .map((c) => `${c.categoryId ? categoriesById.get(c.categoryId) ?? "Outros" : "Sem categoria"}: R$ ${(c.amountCents / 100).toFixed(2)} (${c.percent.toFixed(1)}%)`)
    .join("; ");

  const personName = personId ? data.people.find((p) => p.id === personId)?.name : null;

  const prompt = `Dados do mês ${data.month}${personName ? ` — apenas lançamentos de ${personName}` : ""}:
Entradas: R$ ${(data.currentSummary.incomeCents / 100).toFixed(2)}
Saídas: R$ ${(data.currentSummary.expenseCents / 100).toFixed(2)}
Sobra: R$ ${(data.currentSummary.leftoverCents / 100).toFixed(2)}
${data.previousSummary ? `Mês anterior — Entradas: R$ ${(data.previousSummary.incomeCents / 100).toFixed(2)}, Saídas: R$ ${(data.previousSummary.expenseCents / 100).toFixed(2)}` : ""}
Distribuição de saídas por categoria: ${topCategories}

Gere um insight curto e objetivo sobre a evolução dos gastos.`;

  try {
    return await generateMonthInsight(prompt);
  } catch {
    return "Não foi possível gerar o insight agora. Tente novamente mais tarde.";
  }
}
