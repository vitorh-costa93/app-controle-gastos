"use server";

import { listConsideredTransactionsInRange } from "./transactions";
import { listActiveRecurrenceRules } from "./recurrence";
import { listPeople, listCategories, listTransactionTypes } from "./reference";
import { buildMonthOccurrences, monthRange } from "@/lib/domain/recurrence";
import { summarizeMonth, breakdownByCategory, breakdownByKey } from "@/lib/domain/finance";
import { addMonths } from "@/lib/utils/format";
import { isAiConfigured, generateMonthInsight } from "@/lib/ai/openai";
import { MonthSummary } from "@/types/domain";
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

export async function getAnalysisData(month: string): Promise<AnalysisData> {
  const from12 = addMonths(month, -11);
  const [rules, people, categories, types] = await Promise.all([
    listActiveRecurrenceRules(),
    listPeople(),
    listCategories(),
    listTransactionTypes(),
  ]);
  const transactions = await listConsideredTransactionsInRange(from12, month);
  const months = monthRange(from12, month);

  const summaries = months.map((m) => summarizeMonth(m, buildMonthOccurrences(m, transactions, rules)));
  const currentSummary = summaries[summaries.length - 1];
  const previousSummary = summaries.length > 1 ? summaries[summaries.length - 2] : null;

  const currentOccurrences = buildMonthOccurrences(month, transactions, rules);
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

export async function getMonthInsight(month: string): Promise<string> {
  const data = await getAnalysisData(month);

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

  const prompt = `Dados do mês ${data.month}:
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
