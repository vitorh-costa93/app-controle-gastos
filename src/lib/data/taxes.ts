"use server";

import { revalidatePath, revalidateTag } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { centsToReaisString } from "./mappers";
import { listPeople } from "./reference";
import { listEffectiveSalaryEntries } from "./salary";
import { getFixedSalaryTaxAmountCents } from "./settings";
import {
  findVariableSalaryPerson,
  findFixedSalaryPerson,
  projectSalaryForMonth,
  sumRevenueLast12Months,
  calcJaquelineTaxCents,
} from "@/lib/domain/salary";
import { monthRange } from "@/lib/domain/recurrence";
import { addMonths, toReferenceMonth, formatReferenceMonthShort } from "@/lib/utils/format";

type AdminClient = ReturnType<typeof createAdminClient>;

/** Primeiro mês de faturamento (mês do app) com imposto do salário variável calculado. */
const VARIABLE_TAX_HISTORY_START = "2025-11";

/**
 * Cria (só se ainda não existir) os lançamentos de imposto do casal como transações
 * reais — assim eles aparecem em Análise (KPIs, flat table, pivot table) e Cadastro
 * como qualquer outro custo, em vez de ficar só numa prévia isolada em Configurações.
 *
 * Nunca sobrescreve um lançamento já existente para o mesmo (pessoa, mês, tipo
 * Imposto): uma vez criado, o lançamento vira um registro real e editável — se o
 * valor real vier diferente do calculado, o usuário corrige na hora normalmente
 * (Cadastro), e essa correção nunca é sobrescrita por uma nova sincronização.
 */
export async function syncComputedTaxTransactions(): Promise<
  { ok: true; created: number } | { ok: false; error: string }
> {
  const supabase = createAdminClient();

  const people = await listPeople();

  const variablePerson = findVariableSalaryPerson(people);
  const fixedPerson = findFixedSalaryPerson(people);
  if (!variablePerson && !fixedPerson) return { ok: true, created: 0 };

  const taxTypeId = await ensureTaxTransactionType(supabase);
  if (!taxTypeId) return { ok: false, error: "Não foi possível preparar o tipo Imposto." };
  const taxCategoryId = await ensureTaxCategory(supabase);
  if (!taxCategoryId) return { ok: false, error: "Não foi possível preparar a categoria Imposto." };

  const currentMonth = toReferenceMonth(new Date());
  const windowMonths = monthRange(addMonths(currentMonth, -1), addMonths(currentMonth, 12));
  let created = 0;

  if (variablePerson) {
    const salaryEntries = await listEffectiveSalaryEntries(variablePerson.id);
    // O imposto do salário variável também é calculado para o histórico (a partir de nov/2025),
    // não só para a janela próxima — assim os meses já fechados refletem o valor de cada salário.
    for (const revenueMonth of monthRange(VARIABLE_TAX_HISTORY_START, addMonths(currentMonth, 12))) {
      const gross = projectSalaryForMonth(salaryEntries, revenueMonth);
      if (gross <= 0) continue;
      const rbt12 = sumRevenueLast12Months(salaryEntries, revenueMonth);
      const taxCents = calcJaquelineTaxCents(gross, rbt12);
      // DAS + INSS do faturamento de um mês são pagos no mês seguinte.
      const paymentMonth = addMonths(revenueMonth, 1);
      const inserted = await insertTaxTransactionIfMissing(supabase, {
        personId: variablePerson.id,
        typeId: taxTypeId,
        categoryId: taxCategoryId,
        referenceMonth: paymentMonth,
        amountCents: taxCents,
        description: `Imposto (DAS + INSS) referente a ${formatReferenceMonthShort(revenueMonth)}`,
        onlyImpostoDescription: true,
      });
      if (inserted) created++;
    }
  }

  if (fixedPerson) {
    const taxAmountCents = await getFixedSalaryTaxAmountCents();
    if (taxAmountCents > 0) {
      for (const month of windowMonths) {
        const inserted = await insertTaxTransactionIfMissing(supabase, {
          personId: fixedPerson.id,
          typeId: taxTypeId,
          categoryId: taxCategoryId,
          referenceMonth: month,
          amountCents: taxAmountCents,
          description: "Imposto estimado (DAS + DARF, valor fixo — ajustável em Configurações)",
        });
        if (inserted) created++;
      }
    }
  }

  if (created > 0) {
    revalidateTag("analysis");
    revalidatePath("/cadastro");
    revalidatePath("/analise");
    revalidatePath("/simulacao");
  }

  return { ok: true, created };
}

/**
 * Apaga (soft-delete) só os lançamentos de imposto gerados automaticamente que ainda
 * têm a descrição padrão da sincronização — nunca toca num que o usuário editou
 * manualmente (a edição muda a descrição ou o valor deixa de bater, mas a descrição
 * é o que usamos aqui pra reconhecer "nunca foi tocado"). Usado quando a fórmula de
 * cálculo muda e os valores antigos ficam errados.
 */
export async function resetComputedTaxTransactions(): Promise<
  { ok: true; deleted: number } | { ok: false; error: string }
> {
  const supabase = createAdminClient();

  const { data: taxType } = await supabase.from("transaction_types").select("id").ilike("name", "imposto").maybeSingle();
  if (!taxType?.id) return { ok: true, deleted: 0 };

  const { data: rows, error: selectError } = await supabase
    .from("transactions")
    .select("id, description")
    .eq("type_id", taxType.id)
    .is("deleted_at", null);
  if (selectError) {
    console.error("resetComputedTaxTransactions (select) failed:", selectError);
    return { ok: false, error: "Não foi possível ler os lançamentos de imposto." };
  }

  const autoGeneratedIds = ((rows as { id: string; description: string | null }[] | null) ?? [])
    .filter(
      (r) =>
        r.description?.startsWith("Imposto (DAS + INSS) referente a") ||
        r.description?.startsWith("Imposto estimado (DAS")
    )
    .map((r) => r.id);
  if (autoGeneratedIds.length === 0) return { ok: true, deleted: 0 };

  const { error: deleteError } = await supabase
    .from("transactions")
    .update({ deleted_at: new Date().toISOString() })
    .in("id", autoGeneratedIds);
  if (deleteError) {
    console.error("resetComputedTaxTransactions (delete) failed:", deleteError);
    return { ok: false, error: "Não foi possível apagar os lançamentos de imposto." };
  }

  revalidateTag("analysis");
  revalidatePath("/cadastro");
  revalidatePath("/analise");
  revalidatePath("/simulacao");
  return { ok: true, deleted: autoGeneratedIds.length };
}

async function ensureTaxTransactionType(supabase: AdminClient): Promise<string | null> {
  const { data: existing } = await supabase
    .from("transaction_types")
    .select("id")
    .ilike("name", "imposto")
    .maybeSingle();
  if (existing?.id) return existing.id as string;

  const { data: created, error } = await supabase
    .from("transaction_types")
    .insert({ name: "Imposto" })
    .select("id")
    .single();
  if (error || !created) {
    console.error("ensureTaxTransactionType failed:", error);
    return null;
  }
  // Sem isso, o tipo "Imposto" recém-criado ficava invisível no formulário de
  // Cadastro por até 5 minutos (cache de listTransactionTypes).
  revalidateTag("transaction-types");
  return created.id as string;
}

async function ensureTaxCategory(supabase: AdminClient): Promise<string | null> {
  const { data: existing } = await supabase.from("categories").select("id").ilike("name", "imposto").maybeSingle();
  if (existing?.id) return existing.id as string;

  const { data: created, error } = await supabase.from("categories").insert({ name: "Imposto" }).select("id").single();
  if (error || !created) {
    console.error("ensureTaxCategory failed:", error);
    return null;
  }
  revalidateTag("categories");
  return created.id as string;
}

async function insertTaxTransactionIfMissing(
  supabase: AdminClient,
  params: {
    personId: string;
    typeId: string;
    categoryId: string;
    referenceMonth: string;
    amountCents: number;
    description: string;
    /**
     * true = só conta como "já existe" um lançamento cuja descrição começa com "Imposto" — sem isso, um custo
     * de tipo Imposto que não é o DAS/INSS (ex.: a mensalidade da Contabilizei) impedia o imposto do mês.
     */
    onlyImpostoDescription?: boolean;
  }
): Promise<boolean> {
  let existingQuery = supabase
    .from("transactions")
    .select("id")
    .eq("person_id", params.personId)
    .eq("type_id", params.typeId)
    .eq("reference_month", params.referenceMonth)
    .eq("direction", "expense")
    .is("deleted_at", null);
  if (params.onlyImpostoDescription) existingQuery = existingQuery.ilike("description", "Imposto%");
  const { data: existing } = await existingQuery.limit(1);
  // limit(1) em vez de maybeSingle: com mais de um lançamento de imposto no mês, maybeSingle dá erro
  // (data = null) e a checagem passava como "não existe", gerando lançamento duplicado.
  if (existing && existing.length > 0) return false;

  const { error } = await supabase.from("transactions").insert({
    registration_date: `${params.referenceMonth}-01`,
    reference_month: params.referenceMonth,
    person_id: params.personId,
    direction: "expense",
    fixed_variable: "variable",
    type_id: params.typeId,
    category_id: params.categoryId,
    installment_current: 1,
    installment_total: 1,
    amount: centsToReaisString(params.amountCents),
    description: params.description,
    considered: true,
    source: "manual",
  });

  if (error) {
    console.error("insertTaxTransactionIfMissing failed:", error);
    return false;
  }
  return true;
}
