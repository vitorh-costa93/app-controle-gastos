import { MonthlyOccurrence } from "@/types/domain";
import { CategoryBreakdownItem } from "./finance";

/** Como a renda de um mês se divide entre gastos fixos, parcelas e gastos variáveis (só saídas consideradas). */
export interface MonthCommitment {
  referenceMonth: string;
  incomeCents: number;
  fixedCents: number;
  installmentCents: number;
  variableCents: number;
}

export function computeCommitment(referenceMonth: string, occurrences: MonthlyOccurrence[]): MonthCommitment {
  const considered = occurrences.filter((o) => o.considered);
  const incomeCents = considered.filter((o) => o.direction === "income").reduce((s, o) => s + o.amountCents, 0);
  let fixedCents = 0;
  let installmentCents = 0;
  let variableCents = 0;
  for (const o of considered) {
    if (o.direction !== "expense") continue;
    if (o.installmentTotal > 1) installmentCents += o.amountCents;
    else if (o.fixedVariable === "fixed") fixedCents += o.amountCents;
    else variableCents += o.amountCents;
  }
  return { referenceMonth, incomeCents, fixedCents, installmentCents, variableCents };
}

/** Categorias, tipos e descrições que nunca contam como "fora do planejado" (custos essenciais: imposto, supermercado, combustível, Wellhub). */
export interface UnplannedExclusions {
  categoryIds: Set<string>;
  typeIds: Set<string>;
}

const ESSENTIAL_CATEGORY_NAMES = ["imposto", "supermercado", "combustivel"];
/** Trechos (sem acento, minúsculos) da descrição que tiram o lançamento de "fora do planejado", em qualquer categoria. */
const ESSENTIAL_DESCRIPTION_PARTS = ["wellhub"];
const ESSENTIAL_TYPE_NAMES = ["imposto"];

const normalizeName = (name: string) => name.normalize("NFD").replace(/[̀-ͯ]/g, "").trim().toLowerCase();

/** Ids das categorias/tipos essenciais (imposto, supermercado, combustível) a tirar de "fora do planejado". */
export function buildUnplannedExclusions(
  categories: { id: string; name: string }[],
  types: { id: string; name: string }[]
): UnplannedExclusions {
  return {
    categoryIds: new Set(categories.filter((c) => ESSENTIAL_CATEGORY_NAMES.includes(normalizeName(c.name))).map((c) => c.id)),
    typeIds: new Set(types.filter((t) => ESSENTIAL_TYPE_NAMES.includes(normalizeName(t.name))).map((t) => t.id)),
  };
}

/** Saída considerada que, pela regra automática, não é parcela, fixa/recorrente nem custo essencial (ignora a marcação manual). */
export function isUnplannedCandidate(o: MonthlyOccurrence, excluded?: UnplannedExclusions): boolean {
  const description = normalizeName(o.description ?? "");
  if (ESSENTIAL_DESCRIPTION_PARTS.some((part) => description.includes(part))) return false;
  if (excluded) {
    if (o.categoryId && excluded.categoryIds.has(o.categoryId)) return false;
    if (o.typeId && excluded.typeIds.has(o.typeId)) return false;
  }
  return (
    o.direction === "expense" &&
    o.considered &&
    o.installmentTotal <= 1 &&
    o.fixedVariable !== "fixed" &&
    !o.recurrenceRuleId
  );
}

/** Gasto que não estava no planejamento: candidato pela regra automática e não marcado como planejado pelo usuário. */
export function isUnplannedExpense(o: MonthlyOccurrence, excluded?: UnplannedExclusions): boolean {
  return isUnplannedCandidate(o, excluded) && !o.unplannedExcluded;
}

/** Gasto fora do planejado de um mês, contra a renda e as saídas totais dele. */
export interface MonthUnplanned {
  referenceMonth: string;
  unplannedCents: number;
  expenseCents: number;
  incomeCents: number;
}

export function computeUnplanned(
  referenceMonth: string,
  occurrences: MonthlyOccurrence[],
  excluded?: UnplannedExclusions
): MonthUnplanned {
  const considered = occurrences.filter((o) => o.considered);
  return {
    referenceMonth,
    unplannedCents: considered.filter((o) => isUnplannedExpense(o, excluded)).reduce((s, o) => s + o.amountCents, 0),
    expenseCents: considered.filter((o) => o.direction === "expense").reduce((s, o) => s + o.amountCents, 0),
    incomeCents: considered.filter((o) => o.direction === "income").reduce((s, o) => s + o.amountCents, 0),
  };
}

export interface CategoryChange {
  categoryId: string | null;
  currentCents: number;
  averageCents: number;
  deltaCents: number;
  /** null quando a média anterior é zero (categoria nova). */
  deltaPercent: number | null;
}

/** Diferença de cada categoria no mês contra a média dos meses anteriores informados. */
export function computeCategoryChanges(
  current: CategoryBreakdownItem[],
  previousMonths: CategoryBreakdownItem[][]
): CategoryChange[] {
  if (previousMonths.length === 0) return [];
  const ids = new Set<string | null>([...current.map((c) => c.categoryId), ...previousMonths.flat().map((c) => c.categoryId)]);
  const changes: CategoryChange[] = [];
  for (const categoryId of ids) {
    const currentCents = current.find((c) => c.categoryId === categoryId)?.amountCents ?? 0;
    const previousTotal = previousMonths.reduce(
      (sum, month) => sum + (month.find((c) => c.categoryId === categoryId)?.amountCents ?? 0),
      0
    );
    const averageCents = Math.round(previousTotal / previousMonths.length);
    const deltaCents = currentCents - averageCents;
    if (deltaCents === 0) continue;
    changes.push({
      categoryId,
      currentCents,
      averageCents,
      deltaCents,
      deltaPercent: averageCents > 0 ? (deltaCents / averageCents) * 100 : null,
    });
  }
  return changes.sort((a, b) => b.deltaCents - a.deltaCents);
}
