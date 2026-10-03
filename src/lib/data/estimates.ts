"use server";

import { revalidatePath, revalidateTag } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { centsToReaisString, reaisStringToCents } from "./mappers";
import { listPeople } from "./reference";
import { findFixedSalaryPerson } from "@/lib/domain/salary";
import {
  EstimateScope,
  averageOfTwoMonths,
  estimateModeFor,
  estimateTopUpCents,
  isEstimateVisible,
} from "@/lib/domain/estimated-expenses";
import { MonthlyOccurrence, Transaction } from "@/types/domain";
import { addMonths, toReferenceMonth } from "@/lib/utils/format";

type AdminClient = ReturnType<typeof createAdminClient>;

export interface EstimatedExpense {
  id: string;
  label: string;
  personId: string;
  categoryId: string | null;
  typeId: string | null;
  /**
   * Legado: antes o valor era fixo e virava lançamentos "(estimado)". Hoje a estimativa é a média dos dois últimos
   * meses fechados; este campo só serve para limpar os lançamentos antigos.
   */
  amountCents: number;
}

/** Média usada na estimativa de um item e de onde ela veio. */
export interface EstimateAverage {
  itemId: string;
  averageCents: number;
  /** Os dois meses fechados considerados (antigo, recente) e o gasto real de cada um. */
  months: [string, string];
  monthCents: [number, number];
}

const SETTINGS_KEY = "estimated_expenses";

function estimateDescription(item: Pick<EstimatedExpense, "label">): string {
  return `${item.label} (estimado)`;
}

async function defaultEstimates(supabase: AdminClient): Promise<EstimatedExpense[]> {
  const person = findFixedSalaryPerson(await listPeople());
  if (!person) return [];
  const { data: categories } = await supabase.from("categories").select("id, name").eq("active", true);
  const findCategory = (pattern: RegExp) =>
    ((categories ?? []) as { id: string; name: string }[]).find((c) => pattern.test(c.name))?.id ?? null;

  return [
    { id: "supermercado", label: "Supermercado", personId: person.id, categoryId: findCategory(/mercado/i), typeId: null, amountCents: 0 },
    { id: "combustivel", label: "Combustível", personId: person.id, categoryId: findCategory(/combust/i), typeId: null, amountCents: 0 },
  ];
}

export async function getEstimatedExpenses(): Promise<EstimatedExpense[]> {
  const supabase = createAdminClient();
  const { data, error } = await supabase.from("app_settings").select("value").eq("key", SETTINGS_KEY).maybeSingle();
  if (error) {
    console.error("getEstimatedExpenses failed:", error);
    return [];
  }
  if (data?.value && Array.isArray(data.value)) return data.value as EstimatedExpense[];
  return defaultEstimates(supabase);
}

function revalidateAll() {
  revalidateTag("analysis");
  revalidatePath("/cadastro");
  revalidatePath("/analise");
  revalidatePath("/simulacao");
}

/** Salva a lista de gastos estimados (quais categorias estimar e em nome de quem). O valor é sempre calculado. */
export async function setEstimatedExpenses(
  items: EstimatedExpense[]
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { error } = await createAdminClient()
    .from("app_settings")
    .upsert({ key: SETTINGS_KEY, value: items, updated_at: new Date().toISOString() });
  if (error) {
    console.error("setEstimatedExpenses failed:", error);
    return { ok: false, error: "Não foi possível salvar os gastos estimados." };
  }
  revalidateAll();
  return { ok: true };
}

/**
 * Média dos dois últimos meses fechados (o mês atual e o anterior) do gasto real em cada categoria estimada,
 * somando todas as pessoas. Itens sem categoria não têm como ser calculados e ficam sem média.
 */
export async function getEstimateAverages(items?: EstimatedExpense[]): Promise<EstimateAverage[]> {
  const list = (items ?? (await getEstimatedExpenses())).filter((i) => i.categoryId);
  if (list.length === 0) return [];

  const current = toReferenceMonth(new Date());
  const older = addMonths(current, -1);
  const { data, error } = await createAdminClient()
    .from("transactions")
    .select("category_id, reference_month, amount")
    .in("category_id", [...new Set(list.map((i) => i.categoryId as string))])
    .eq("direction", "expense")
    .eq("considered", true)
    .gte("reference_month", older)
    .lte("reference_month", current)
    .is("deleted_at", null);
  if (error) {
    console.error("getEstimateAverages failed:", error);
    return [];
  }

  const sums = new Map<string, number>();
  for (const row of (data ?? []) as { category_id: string; reference_month: string; amount: string }[]) {
    const key = `${row.category_id}|${row.reference_month}`;
    sums.set(key, (sums.get(key) ?? 0) + reaisStringToCents(row.amount));
  }

  return list.map((item) => {
    const a = sums.get(`${item.categoryId}|${older}`) ?? 0;
    const b = sums.get(`${item.categoryId}|${current}`) ?? 0;
    return { itemId: item.id, averageCents: averageOfTwoMonths(a, b), months: [older, current], monthCents: [a, b] };
  });
}

/**
 * Ocorrências estimadas por mês, para somar às da Análise ou da Simulação (nada é gravado no banco). Cada uma
 * completa o real do mês até a média: o total do mês na categoria fica no maior entre o real e a estimativa.
 * `transactions` são os lançamentos reais já carregados que cobrem esses meses.
 */
export async function getEstimatedExpenseOccurrences(
  months: string[],
  scope: EstimateScope,
  transactions: Transaction[]
): Promise<Map<string, MonthlyOccurrence[]>> {
  const result = new Map<string, MonthlyOccurrence[]>();
  const current = toReferenceMonth(new Date());
  const visibleMonths = months.filter((m) => isEstimateVisible(estimateModeFor(m, current), scope));
  if (visibleMonths.length === 0) return result;

  const items = (await getEstimatedExpenses()).filter((i) => i.categoryId && i.personId);
  const averages = new Map((await getEstimateAverages(items)).map((a) => [a.itemId, a.averageCents]));

  for (const month of visibleMonths) {
    const occurrences: MonthlyOccurrence[] = [];
    for (const item of items) {
      const average = averages.get(item.id) ?? 0;
      if (average <= 0) continue;
      const real = transactions
        .filter(
          (t) =>
            t.referenceMonth === month &&
            t.categoryId === item.categoryId &&
            t.direction === "expense" &&
            t.considered
        )
        .reduce((sum, t) => sum + t.amountCents, 0);
      const topUp = estimateTopUpCents(average, real);
      if (topUp <= 0) continue;
      occurrences.push({
        id: `estimate:${item.id}:${month}`,
        origin: "projected",
        registrationDate: `${month}-01`,
        referenceMonth: month,
        personId: item.personId,
        direction: "expense",
        fixedVariable: "variable",
        typeId: item.typeId,
        categoryId: item.categoryId,
        installmentCurrent: 1,
        installmentTotal: 1,
        amountCents: topUp,
        description: estimateDescription(item),
        considered: true,
        recurrenceRuleId: null,
      });
    }
    if (occurrences.length > 0) result.set(month, occurrences);
  }
  return result;
}

/**
 * Limpeza dos lançamentos "(estimado)" de valor fixo que versões antigas gravavam no Cadastro (do mês seguinte em
 * diante): agora a estimativa é calculada na hora. Só apaga os que continuam intocados (mesma descrição automática,
 * mesma pessoa e mesmo valor antigo); os que você editou ficam. Idempotente.
 */
export async function syncEstimatedExpenses(): Promise<
  { ok: true; created: number; removed: number } | { ok: false; error: string }
> {
  const supabase = createAdminClient();
  const items = (await getEstimatedExpenses()).filter((i) => i.amountCents > 0 && i.personId);
  if (items.length === 0) return { ok: true, created: 0, removed: 0 };

  const from = addMonths(toReferenceMonth(new Date()), 1);
  let removed = 0;
  for (const item of items) {
    const { data, error } = await supabase
      .from("transactions")
      .update({ deleted_at: new Date().toISOString() })
      .eq("person_id", item.personId)
      .eq("description", estimateDescription(item))
      .eq("amount", centsToReaisString(item.amountCents))
      .eq("source", "manual")
      .gte("reference_month", from)
      .is("deleted_at", null)
      .select("id");
    if (error) {
      console.error("syncEstimatedExpenses (cleanup) failed:", error);
      return { ok: false, error: "Não foi possível limpar os lançamentos estimados antigos." };
    }
    removed += data?.length ?? 0;
  }

  if (removed > 0) revalidateAll();
  return { ok: true, created: 0, removed };
}
