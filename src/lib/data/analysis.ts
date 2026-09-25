"use server";

import { unstable_cache } from "next/cache";
import { listAllTransactions, listConsideredTransactionsInRange, listTransactionsForMonth } from "./transactions";
import { listActiveRecurrenceRules } from "./recurrence";
import { listPeople, listCategories, listTransactionTypes } from "./reference";
import { getSalaryProjectionOccurrences } from "./salary";
import { buildMonthOccurrences, monthRange } from "@/lib/domain/recurrence";
import { summarizeMonth, breakdownByCategory, breakdownByKey } from "@/lib/domain/finance";
import { computeCommitment, computeCategoryChanges, MonthCommitment, CategoryChange } from "@/lib/domain/insights";
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
  /** Renda × gastos fixos/parcelas/variáveis do mês selecionado e dos 5 seguintes (o primeiro item é o mês selecionado). */
  commitments: MonthCommitment[];
  /** Categorias que mais subiram/caíram contra a média dos 3 meses anteriores (vazio sem histórico). */
  categoryChanges: CategoryChange[];
  /** Entradas e saídas do mês por pessoa. */
  personSummaries: { personId: string; incomeCents: number; expenseCents: number }[];
  /** Ocorrências projetadas do mês (recorrências fixas + salário estimado) que ainda não viraram lançamento real. */
  projectedOccurrences: MonthlyOccurrence[];
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
  ["analysis-data-v3"],
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

  // Compromissos já assumidos: o mês selecionado + os próximos 5 (fixos e parcelas já lançadas).
  const futureMonths = monthRange(addMonths(month, 1), addMonths(month, 5));
  const futureAll = await listConsideredTransactionsInRange(futureMonths[0], futureMonths[futureMonths.length - 1]);
  const futureTransactions = personId ? futureAll.filter((t) => t.personId === personId) : futureAll;
  const futureSalary = await getSalaryProjectionOccurrences(
    futureMonths,
    people,
    types,
    [...allTransactions, ...futureAll],
    personId
  );
  const commitments = [
    computeCommitment(month, currentOccurrences),
    ...futureMonths.map((m) =>
      computeCommitment(m, [...buildMonthOccurrences(m, futureTransactions, rules), ...(futureSalary.get(m) ?? [])])
    ),
  ];

  // O que mudou: mês atual contra a média dos 3 meses anteriores que têm algum dado.
  const previousBreakdowns = [3, 2, 1]
    .map((back) => addMonths(month, -back))
    .map((m) => withSalary(m, buildMonthOccurrences(m, transactions, rules)))
    .filter((occ) => occ.some((o) => o.considered))
    .map((occ) => breakdownByCategory(occ, "expense"));
  const categoryChanges = computeCategoryChanges(categoryBreakdown, previousBreakdowns);

  const personIds = new Set(currentOccurrences.filter((o) => o.considered).map((o) => o.personId));
  const personSummaries = Array.from(personIds).map((id) => {
    const s = summarizeMonth(month, currentOccurrences.filter((o) => o.personId === id));
    return { personId: id, incomeCents: s.incomeCents, expenseCents: s.expenseCents };
  });

  const monthsWithData = summaries.filter((s) => s.incomeCents > 0 || s.expenseCents > 0).length;

  return {
    month,
    summaries,
    currentSummary,
    previousSummary,
    categoryBreakdown,
    typeBreakdown,
    personBreakdown,
    commitments,
    categoryChanges,
    personSummaries,
    projectedOccurrences: currentOccurrences.filter((o) => o.origin === "projected"),
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
): Promise<{ data: AnalysisData; transactions: MonthlyOccurrence[] }> {
  const [data, realTransactions] = await Promise.all([
    getAnalysisData(month, personId),
    listTransactionsForMonth(month, personId),
  ]);
  return { data, transactions: buildMovementRows(realTransactions, data.projectedOccurrences) };
}

/**
 * Linhas da tabela "Todas as movimentações do mês": lançamentos reais + as ocorrências
 * fixas projetadas (ex.: um gasto fixo cadastrado num mês continua aparecendo nos meses
 * seguintes até a data de encerramento). Um lançamento real já vinculado à mesma regra
 * (mesmo que "não considerado") substitui a projeção, para nunca duplicar.
 */
function buildMovementRows(real: Transaction[], projected: MonthlyOccurrence[]): MonthlyOccurrence[] {
  const materializedRules = new Set(real.map((t) => t.recurrenceRuleId).filter((id): id is string => Boolean(id)));
  const realRows = real.map<MonthlyOccurrence>((t) => ({
    id: t.id,
    origin: "real",
    registrationDate: t.registrationDate,
    referenceMonth: t.referenceMonth,
    personId: t.personId,
    direction: t.direction,
    fixedVariable: t.fixedVariable,
    typeId: t.typeId,
    categoryId: t.categoryId,
    installmentCurrent: t.installmentCurrent,
    installmentTotal: t.installmentTotal,
    amountCents: t.amountCents,
    description: t.description,
    considered: t.considered,
    recurrenceRuleId: t.recurrenceRuleId,
  }));
  const projectedRows = projected.filter((o) => !o.recurrenceRuleId || !materializedRules.has(o.recurrenceRuleId));
  return [...realRows, ...projectedRows].sort((a, b) => b.registrationDate.localeCompare(a.registrationDate));
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

/** Base completa (todos os meses, todas as pessoas) da tabela dinâmica — carregada só quando ela é aberta. */
export async function fetchPivotTransactions(): Promise<Transaction[]> {
  return listAllTransactions();
}
