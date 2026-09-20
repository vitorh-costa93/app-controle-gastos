"use server";

import { revalidatePath, revalidateTag } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { centsToReaisString } from "./mappers";
import { listPeople, listTransactionTypes } from "./reference";
import { listActiveRecurrenceRules } from "./recurrence";
import { listSalaryEntries } from "./salary";
import { getFixedSalaryTaxRates } from "./settings";
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

  const [people, rules, types] = await Promise.all([
    listPeople(),
    listActiveRecurrenceRules(),
    listTransactionTypes(),
  ]);

  const variablePerson = findVariableSalaryPerson(people);
  const fixedPerson = findFixedSalaryPerson(people);
  if (!variablePerson && !fixedPerson) return { ok: true, created: 0 };

  const taxTypeId = await ensureTaxTransactionType(supabase);
  if (!taxTypeId) return { ok: false, error: "Não foi possível preparar o tipo Imposto." };

  const currentMonth = toReferenceMonth(new Date());
  const windowMonths = monthRange(addMonths(currentMonth, -1), addMonths(currentMonth, 12));
  let created = 0;

  if (variablePerson) {
    const salaryEntries = await listSalaryEntries(variablePerson.id);
    for (const revenueMonth of windowMonths) {
      const gross = projectSalaryForMonth(salaryEntries, revenueMonth);
      if (gross <= 0) continue;
      const rbt12 = sumRevenueLast12Months(salaryEntries, revenueMonth);
      const taxCents = calcJaquelineTaxCents(gross, rbt12);
      // DAS + INSS do faturamento de um mês são pagos no mês seguinte.
      const paymentMonth = addMonths(revenueMonth, 1);
      const inserted = await insertTaxTransactionIfMissing(supabase, {
        personId: variablePerson.id,
        typeId: taxTypeId,
        referenceMonth: paymentMonth,
        amountCents: taxCents,
        description: `Imposto (DAS + INSS) referente a ${formatReferenceMonthShort(revenueMonth)}`,
      });
      if (inserted) created++;
    }
  }

  if (fixedPerson) {
    const salarioTypeId = types.find((t) => /sal[aá]rio/i.test(t.name))?.id;
    const salaryRule = rules.find(
      (r) =>
        r.personId === fixedPerson.id &&
        r.direction === "income" &&
        (!salarioTypeId || r.typeId === salarioTypeId)
    );
    if (salaryRule) {
      const { dasRate, darfRate } = await getFixedSalaryTaxRates();
      for (const month of windowMonths) {
        const dasCents = Math.round(salaryRule.amountCents * dasRate);
        const darfCents = Math.round(salaryRule.amountCents * darfRate);
        const taxCents = dasCents + darfCents;
        if (taxCents <= 0) continue;
        const inserted = await insertTaxTransactionIfMissing(supabase, {
          personId: fixedPerson.id,
          typeId: taxTypeId,
          referenceMonth: month,
          amountCents: taxCents,
          description: `Imposto estimado (DAS ${formatPercent(dasRate)} + DARF ${formatPercent(darfRate)} do salário)`,
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

function formatPercent(rate: number): string {
  return `${(rate * 100).toFixed(2).replace(".", ",")}%`;
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
  return created.id as string;
}

async function insertTaxTransactionIfMissing(
  supabase: AdminClient,
  params: { personId: string; typeId: string; referenceMonth: string; amountCents: number; description: string }
): Promise<boolean> {
  const { data: existing } = await supabase
    .from("transactions")
    .select("id")
    .eq("person_id", params.personId)
    .eq("type_id", params.typeId)
    .eq("reference_month", params.referenceMonth)
    .eq("direction", "expense")
    .is("deleted_at", null)
    .maybeSingle();
  if (existing) return false;

  const { error } = await supabase.from("transactions").insert({
    registration_date: `${params.referenceMonth}-01`,
    reference_month: params.referenceMonth,
    person_id: params.personId,
    direction: "expense",
    fixed_variable: "variable",
    type_id: params.typeId,
    category_id: null,
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
