"use server";

import { revalidatePath, revalidateTag } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { reaisStringToCents, centsToReaisString } from "./mappers";
import { findVariableSalaryPerson, buildProjectedSalaryOccurrences } from "@/lib/domain/salary";
import { getPsiMonthlyRevenueCents } from "./psi-revenue";
import { listPeople } from "./reference";
import { addMonths, toReferenceMonth } from "@/lib/utils/format";
import { Person, TransactionType } from "@/types/db";
import { Transaction, MonthlyOccurrence } from "@/types/domain";

type AdminClient = ReturnType<typeof createAdminClient>;

export interface SalaryEntry {
  id: string;
  personId: string;
  referenceMonth: string;
  amountCents: number;
}

interface SalaryEntryRow {
  id: string;
  person_id: string;
  reference_month: string;
  amount: string;
}

function mapSalaryEntryRow(row: SalaryEntryRow): SalaryEntry {
  return {
    id: row.id,
    personId: row.person_id,
    referenceMonth: row.reference_month,
    amountCents: reaisStringToCents(row.amount),
  };
}

export async function listSalaryEntries(personId: string): Promise<SalaryEntry[]> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("salary_entries")
    .select("*")
    .eq("person_id", personId)
    .order("reference_month", { ascending: true });
  if (error) throw new Error("Não foi possível carregar o histórico de salário.");
  return (data as SalaryEntryRow[]).map(mapSalaryEntryRow);
}

/**
 * Salário efetivo por mês: o "Valor Recebido" do dashboard-psi (fonte principal) ou, sem dado dele,
 * o valor digitado. O salário cai um mês depois do mês do psi (set/26 lá = out/26 aqui).
 * É o que alimenta projeção e impostos.
 */
export async function listEffectiveSalaryEntries(personId: string): Promise<SalaryEntry[]> {
  const [manual, psiByMonth] = await Promise.all([listSalaryEntries(personId), getPsiMonthlyRevenueCents()]);
  const merged = new Map(manual.map((e) => [e.referenceMonth, e]));
  const psiShifted = new Map(Object.entries(psiByMonth).map(([month, cents]) => [addMonths(month, 1), cents]));
  for (const [referenceMonth, psiCents] of psiShifted) {
    merged.set(referenceMonth, {
      id: `psi:${referenceMonth}`,
      personId,
      referenceMonth,
      amountCents: psiCents,
    });
  }
  return [...merged.values()].sort((a, b) => a.referenceMonth.localeCompare(b.referenceMonth));
}

/** Cria ou atualiza o valor de um mês (um mês só pode ter um lançamento por pessoa). */
export async function upsertSalaryEntry(
  personId: string,
  referenceMonth: string,
  amountCents: number
): Promise<{ ok: true; data: SalaryEntry } | { ok: false; error: string }> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("salary_entries")
    .upsert(
      { person_id: personId, reference_month: referenceMonth, amount: centsToReaisString(amountCents) },
      { onConflict: "person_id,reference_month" }
    )
    .select("*")
    .single();

  if (error) return { ok: false, error: "Não foi possível salvar este mês." };
  revalidateTag("analysis");
  revalidatePath("/configuracoes");
  revalidatePath("/analise");
  revalidatePath("/simulacao");
  return { ok: true, data: mapSalaryEntryRow(data as SalaryEntryRow) };
}

export async function deleteSalaryEntry(id: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const supabase = createAdminClient();
  const { error } = await supabase.from("salary_entries").delete().eq("id", id);
  if (error) return { ok: false, error: "Não foi possível remover este mês." };
  revalidateTag("analysis");
  revalidatePath("/configuracoes");
  revalidatePath("/analise");
  revalidatePath("/simulacao");
  return { ok: true };
}

/**
 * Monta, por mês, os lançamentos projetados de salário variável (só da pessoa
 * identificada como salário variável, e só quando o filtro de pessoa da tela
 * permite) — usado por Análise e Simulação para preencher meses futuros que
 * ainda não têm o salário real lançado.
 */
export async function getSalaryProjectionOccurrences(
  months: string[],
  people: Person[],
  types: TransactionType[],
  allTransactions: Transaction[],
  personFilter?: string
): Promise<Map<string, MonthlyOccurrence[]>> {
  const variablePerson = findVariableSalaryPerson(people);
  if (!variablePerson) return new Map();
  if (personFilter && personFilter !== variablePerson.id) return new Map();

  const salaryEntries = await listEffectiveSalaryEntries(variablePerson.id);
  const currentMonth = toReferenceMonth(new Date());
  const monthsWithRealIncome = new Set(
    allTransactions
      .filter((t) => t.personId === variablePerson.id && t.direction === "income")
      .map((t) => t.referenceMonth)
  );
  const typeId = types.find((t) => /sal[aá]rio/i.test(t.name))?.id ?? null;

  const occurrences = buildProjectedSalaryOccurrences({
    months,
    currentMonth,
    personId: variablePerson.id,
    typeId,
    salaryEntries,
    monthsWithRealIncome,
  });

  const map = new Map<string, MonthlyOccurrence[]>();
  for (const occ of occurrences) {
    const arr = map.get(occ.referenceMonth);
    if (arr) arr.push(occ);
    else map.set(occ.referenceMonth, [occ]);
  }
  return map;
}

/**
 * Salário variável ESTIMADO para os meses abertos (atual e seguintes), usado pela Simulação: mesmo mês do
 * ano anterior × (1 + variação YoY acumulada no ano), calculado só com os meses já fechados. O valor real
 * (inclusive o que o psi já informou) só passa a valer quando o mês fecha.
 */
export async function getEstimatedSalaryOccurrences(
  months: string[],
  people: Person[],
  types: TransactionType[]
): Promise<{ personId: string | null; byMonth: Map<string, MonthlyOccurrence[]> }> {
  const person = findVariableSalaryPerson(people);
  if (!person) return { personId: null, byMonth: new Map() };

  const currentMonth = toReferenceMonth(new Date());
  const closedEntries = (await listEffectiveSalaryEntries(person.id)).filter((e) => e.referenceMonth < currentMonth);
  const typeId = types.find((t) => /sal[aá]rio/i.test(t.name))?.id ?? null;

  const occurrences = buildProjectedSalaryOccurrences({
    months: months.filter((m) => m >= currentMonth),
    currentMonth,
    personId: person.id,
    typeId,
    salaryEntries: closedEntries,
    monthsWithRealIncome: new Set(),
    projectFromMonth: currentMonth,
  });

  const byMonth = new Map<string, MonthlyOccurrence[]>();
  for (const occ of occurrences) {
    const arr = byMonth.get(occ.referenceMonth);
    if (arr) arr.push(occ);
    else byMonth.set(occ.referenceMonth, [occ]);
  }
  return { personId: person.id, byMonth };
}

// Sem revalidateTag aqui de propósito (ver comentário no fim de syncSalaryIncomeTransactions):
// essa função também roda direto no render de Server Components, onde revalidate derruba a página.
async function ensureSalaryTypeId(supabase: AdminClient): Promise<string | null> {
  const { data: existing } = await supabase.from("transaction_types").select("id").ilike("name", "salário").maybeSingle();
  if (existing?.id) return existing.id as string;
  const { data: created, error } = await supabase.from("transaction_types").insert({ name: "Salário" }).select("id").single();
  if (error || !created) {
    console.error("ensureSalaryTypeId failed:", error);
    return null;
  }
  return created.id as string;
}

async function ensureSalaryCategoryId(supabase: AdminClient): Promise<string | null> {
  const { data: existing } = await supabase.from("categories").select("id").ilike("name", "salário").maybeSingle();
  if (existing?.id) return existing.id as string;
  const { data: created, error } = await supabase.from("categories").insert({ name: "Salário" }).select("id").single();
  if (error || !created) {
    console.error("ensureSalaryCategoryId failed:", error);
    return null;
  }
  return created.id as string;
}

/**
 * Mantém o lançamento real de "Salário" (entrada) da pessoa de salário variável sempre
 * igual ao dashboard-psi, mês a mês — inclusive meses já fechados: o psi é a fonte de
 * verdade (pedido explícito, 28/09/2026), então uma correção de lá (ex.: sessão lançada
 * com atraso) precisa refletir aqui mesmo num mês antigo, sem esperar edição manual.
 * Um mês com mais de um lançamento de Salário (caso ambíguo) fica intocado.
 */
export async function syncSalaryIncomeTransactions(): Promise<
  { ok: true; created: number; updated: number } | { ok: false; error: string }
> {
  const supabase = createAdminClient();

  const variablePerson = findVariableSalaryPerson(await listPeople());
  if (!variablePerson) return { ok: true, created: 0, updated: 0 };

  const psiByMonth = await getPsiMonthlyRevenueCents();
  const shifted = Object.entries(psiByMonth).map(([month, cents]) => [addMonths(month, 1), cents] as const);
  if (shifted.length === 0) return { ok: true, created: 0, updated: 0 };

  const typeId = await ensureSalaryTypeId(supabase);
  const categoryId = await ensureSalaryCategoryId(supabase);
  if (!typeId || !categoryId) return { ok: false, error: "Não foi possível preparar o tipo/categoria Salário." };

  const { data: existingRows, error: selectError } = await supabase
    .from("transactions")
    .select("id, reference_month, amount")
    .eq("person_id", variablePerson.id)
    .eq("direction", "income")
    .eq("type_id", typeId)
    .is("deleted_at", null);
  if (selectError) return { ok: false, error: "Não foi possível ler os lançamentos de salário." };

  const byMonth = new Map<string, { id: string; amountCents: number }[]>();
  for (const row of (existingRows ?? []) as { id: string; reference_month: string; amount: string }[]) {
    const arr = byMonth.get(row.reference_month) ?? [];
    arr.push({ id: row.id, amountCents: reaisStringToCents(row.amount) });
    byMonth.set(row.reference_month, arr);
  }

  const toInsert: Record<string, unknown>[] = [];
  let updated = 0;

  for (const [referenceMonth, cents] of shifted) {
    const rows = byMonth.get(referenceMonth) ?? [];
    if (rows.length === 0) {
      toInsert.push({
        registration_date: `${referenceMonth}-01`,
        reference_month: referenceMonth,
        person_id: variablePerson.id,
        direction: "income",
        fixed_variable: "variable",
        type_id: typeId,
        category_id: categoryId,
        installment_current: 1,
        installment_total: 1,
        amount: centsToReaisString(cents),
        description: "Salário (dashboard-psi)",
        considered: true,
        source: "manual",
      });
    } else if (rows.length === 1 && rows[0].amountCents !== cents) {
      const { error: updateError } = await supabase
        .from("transactions")
        .update({ amount: centsToReaisString(cents) })
        .eq("id", rows[0].id);
      if (updateError) console.error("syncSalaryIncomeTransactions (update) failed:", updateError);
      else updated++;
    }
  }

  let created = 0;
  if (toInsert.length > 0) {
    const { error: insertError } = await supabase.from("transactions").insert(toInsert);
    if (insertError) console.error("syncSalaryIncomeTransactions (insert) failed:", insertError);
    else created = toInsert.length;
  }

  // Sem revalidatePath/revalidateTag aqui de propósito: essa função roda tanto a partir do
  // client (SalaryProjectionEditor) quanto direto no render de páginas Server Component
  // (analise/page.tsx, configuracoes/page.tsx) — chamar revalidate durante um render
  // derruba a página ("used revalidatePath ... during render"). Como nenhuma leitura no
  // caminho de Salário/Análise usa cache hoje, a escrita já fica visível na próxima leitura
  // sem precisar revalidar.
  return { ok: true, created, updated };
}
