"use server";

import { revalidatePath, revalidateTag } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { centsToReaisString, reaisStringToCents } from "./mappers";
import { listPeople } from "./reference";
import { findFixedSalaryPerson } from "@/lib/domain/salary";
import { getDefaultSimulationHorizon } from "@/lib/domain/horizon";
import { monthRange } from "@/lib/domain/recurrence";
import { addMonths, toReferenceMonth } from "@/lib/utils/format";

type AdminClient = ReturnType<typeof createAdminClient>;

export interface EstimatedExpense {
  id: string;
  label: string;
  personId: string;
  categoryId: string | null;
  typeId: string | null;
  amountCents: number;
}

const SETTINGS_KEY = "estimated_expenses";

function estimateDescription(item: Pick<EstimatedExpense, "label">): string {
  return `${item.label} (estimado)`;
}

/**
 * Janela em que a estimativa vale: do mês atual + 2 até o fim do horizonte da
 * Simulação. O mês atual e o seguinte recebem os dados reais (fatura/cadastro) —
 * mesma lógica da projeção de salário.
 */
function estimateWindow(): { current: string; from: string; to: string } {
  const current = toReferenceMonth(new Date());
  const from = addMonths(current, 2);
  const horizonTo = getDefaultSimulationHorizon().to;
  const minTo = addMonths(current, 12);
  return { current, from, to: horizonTo > minTo ? horizonTo : minTo };
}

async function defaultEstimates(supabase: AdminClient): Promise<EstimatedExpense[]> {
  const person = findFixedSalaryPerson(await listPeople());
  if (!person) return [];
  const { data: categories } = await supabase.from("categories").select("id, name").eq("active", true);
  const findCategory = (pattern: RegExp) =>
    ((categories ?? []) as { id: string; name: string }[]).find((c) => pattern.test(c.name))?.id ?? null;

  return [
    {
      id: "supermercado",
      label: "Supermercado",
      personId: person.id,
      categoryId: findCategory(/mercado/i),
      typeId: null,
      amountCents: 150_000,
    },
    {
      id: "combustivel",
      label: "Combustível",
      personId: person.id,
      categoryId: findCategory(/combust/i),
      typeId: null,
      amountCents: 30_000,
    },
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

/**
 * Salva a lista de gastos estimados. Lançamentos estimados ainda intocados (mesma
 * descrição automática e mesmo valor antigo) dos meses futuros acompanham a
 * mudança: valor novo é aplicado, item removido/renomeado apaga os antigos. Um
 * lançamento que o usuário já editou nunca é mexido.
 */
export async function setEstimatedExpenses(
  items: EstimatedExpense[]
): Promise<{ ok: true } | { ok: false; error: string }> {
  const supabase = createAdminClient();
  const previous = await getEstimatedExpenses();

  const { error } = await supabase
    .from("app_settings")
    .upsert({ key: SETTINGS_KEY, value: items, updated_at: new Date().toISOString() });
  if (error) {
    console.error("setEstimatedExpenses failed:", error);
    return { ok: false, error: "Não foi possível salvar os gastos estimados." };
  }

  const { from } = estimateWindow();
  for (const old of previous) {
    const next = items.find((i) => i.id === old.id);
    const sameIdentity =
      next &&
      next.label === old.label &&
      next.personId === old.personId &&
      next.categoryId === old.categoryId &&
      next.typeId === old.typeId;

    if (sameIdentity) {
      if (next.amountCents !== old.amountCents) {
        await supabase
          .from("transactions")
          .update({ amount: centsToReaisString(next.amountCents) })
          .eq("person_id", old.personId)
          .eq("description", estimateDescription(old))
          .eq("amount", centsToReaisString(old.amountCents))
          .gte("reference_month", from)
          .is("deleted_at", null);
      }
    } else {
      await supabase
        .from("transactions")
        .update({ deleted_at: new Date().toISOString() })
        .eq("person_id", old.personId)
        .eq("description", estimateDescription(old))
        .eq("amount", centsToReaisString(old.amountCents))
        .gte("reference_month", from)
        .is("deleted_at", null);
    }
  }

  await syncEstimatedExpenses();
  revalidateAll();
  return { ok: true };
}

/**
 * Materializa os gastos estimados como lançamentos reais (visíveis no Cadastro) do
 * mês atual + 2 em diante, só nos meses que ainda não têm lançamento da mesma pessoa
 * naquela categoria. E remove as estimativas intocadas que "chegaram" no mês atual ou
 * no seguinte — esses meses passam a usar só os dados reais.
 */
export async function syncEstimatedExpenses(): Promise<
  { ok: true; created: number; removed: number } | { ok: false; error: string }
> {
  const supabase = createAdminClient();
  const items = await getEstimatedExpenses();
  if (items.length === 0) return { ok: true, created: 0, removed: 0 };

  const { current, from, to } = estimateWindow();
  const futureMonths = monthRange(from, to);
  let created = 0;
  let removed = 0;

  for (const item of items) {
    if (!item.personId || item.amountCents <= 0) continue;
    const description = estimateDescription(item);

    let query = supabase
      .from("transactions")
      .select("id, reference_month, description, amount")
      .eq("person_id", item.personId)
      .eq("direction", "expense")
      .gte("reference_month", current)
      .lte("reference_month", to)
      .is("deleted_at", null);
    query = item.categoryId ? query.eq("category_id", item.categoryId) : query.eq("description", description);

    const { data, error } = await query;
    if (error) {
      console.error("syncEstimatedExpenses (select) failed:", error);
      return { ok: false, error: "Não foi possível ler os gastos estimados." };
    }
    const existing = (data ?? []) as { id: string; reference_month: string; description: string | null; amount: string }[];

    const stale = existing
      .filter(
        (r) =>
          r.reference_month < from &&
          r.description === description &&
          reaisStringToCents(r.amount) === item.amountCents
      )
      .map((r) => r.id);
    if (stale.length > 0) {
      const { error: deleteError } = await supabase
        .from("transactions")
        .update({ deleted_at: new Date().toISOString() })
        .in("id", stale);
      if (deleteError) console.error("syncEstimatedExpenses (cleanup) failed:", deleteError);
      else removed += stale.length;
    }

    const monthsWithData = new Set(existing.map((r) => r.reference_month));
    const missing = futureMonths.filter((m) => !monthsWithData.has(m));
    if (missing.length === 0) continue;

    const { error: insertError } = await supabase.from("transactions").insert(
      missing.map((month) => ({
        registration_date: `${month}-01`,
        reference_month: month,
        person_id: item.personId,
        direction: "expense",
        fixed_variable: "variable",
        type_id: item.typeId,
        category_id: item.categoryId,
        installment_current: 1,
        installment_total: 1,
        amount: centsToReaisString(item.amountCents),
        description,
        considered: true,
        source: "manual",
      }))
    );
    if (insertError) {
      console.error("syncEstimatedExpenses (insert) failed:", insertError);
      return { ok: false, error: "Não foi possível criar os gastos estimados." };
    }
    created += missing.length;
  }

  if (created > 0 || removed > 0) revalidateAll();
  return { ok: true, created, removed };
}
