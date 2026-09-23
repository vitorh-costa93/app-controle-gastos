"use server";

import { revalidatePath, revalidateTag } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { reaisStringToCents } from "./mappers";
import { addMonths, addMonthsToISODate, toReferenceMonth } from "@/lib/utils/format";

export interface InstallmentGroup {
  groupId: string;
  description: string | null;
  personId: string;
  categoryId: string | null;
  typeId: string | null;
  amountCents: number;
  installmentTotal: number;
  firstMonth: string;
  lastMonth: string;
  /** Parcelas ainda por vir (mês de referência >= mês atual). */
  remainingCount: number;
  remainingCents: number;
}

interface GroupRow {
  id: string;
  installment_group_id: string;
  installment_current: number;
  installment_total: number;
  reference_month: string;
  person_id: string;
  category_id: string | null;
  type_id: string | null;
  amount: string;
  description: string | null;
}

function revalidateAll() {
  revalidateTag("analysis");
  revalidatePath("/cadastro");
  revalidatePath("/analise");
  revalidatePath("/simulacao");
}

/** Compras parceladas agrupadas — só as que ainda têm parcela no mês atual ou depois. */
export async function listInstallmentGroups(): Promise<InstallmentGroup[]> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("transactions")
    .select(
      "id, installment_group_id, installment_current, installment_total, reference_month, person_id, category_id, type_id, amount, description"
    )
    .not("installment_group_id", "is", null)
    .is("deleted_at", null)
    .order("installment_current");

  if (error) {
    console.error("listInstallmentGroups failed:", error);
    return [];
  }

  const currentMonth = toReferenceMonth(new Date());
  const byGroup = new Map<string, GroupRow[]>();
  for (const row of data as GroupRow[]) {
    const list = byGroup.get(row.installment_group_id);
    if (list) list.push(row);
    else byGroup.set(row.installment_group_id, [row]);
  }

  const groups: InstallmentGroup[] = [];
  for (const [groupId, rows] of byGroup) {
    const remaining = rows.filter((r) => r.reference_month >= currentMonth);
    if (remaining.length === 0) continue;
    const months = rows.map((r) => r.reference_month).sort();
    const first = rows[0];
    groups.push({
      groupId,
      description: first.description,
      personId: first.person_id,
      categoryId: first.category_id,
      typeId: first.type_id,
      amountCents: reaisStringToCents(first.amount),
      installmentTotal: first.installment_total,
      firstMonth: months[0],
      lastMonth: months[months.length - 1],
      remainingCount: remaining.length,
      remainingCents: remaining.reduce((s, r) => s + reaisStringToCents(r.amount), 0),
    });
  }

  return groups.sort((a, b) => a.lastMonth.localeCompare(b.lastMonth));
}

/** Encerra uma compra parcelada: apaga as parcelas a partir de `fromMonth` (as já pagas ficam). */
export async function cancelInstallmentGroup(
  groupId: string,
  fromMonth: string
): Promise<{ ok: true; deleted: number } | { ok: false; error: string }> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("transactions")
    .update({ deleted_at: new Date().toISOString() })
    .eq("installment_group_id", groupId)
    .gte("reference_month", fromMonth)
    .is("deleted_at", null)
    .select("id");

  if (error) {
    console.error("cancelInstallmentGroup failed:", error);
    return { ok: false, error: "Não foi possível encerrar esta compra parcelada." };
  }
  revalidateAll();
  return { ok: true, deleted: data?.length ?? 0 };
}

/**
 * Compras parceladas lançadas antes de existir o agrupamento (ex.: "3/10" vindo de uma
 * fatura) ficavam só no mês em que foram lançadas. Agrupa as parcelas da mesma compra
 * (mesma pessoa, valor, total de parcelas e mês de início) e cria as que faltam
 * depois da maior parcela já lançada. Idempotente: só olha lançamentos ainda sem grupo.
 */
export async function backfillInstallmentGroups(): Promise<
  { ok: true; created: number } | { ok: false; error: string }
> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("transactions")
    .select("*")
    .is("installment_group_id", null)
    .is("deleted_at", null)
    .eq("fixed_variable", "variable")
    .gt("installment_total", 1);

  if (error) {
    console.error("backfillInstallmentGroups (select) failed:", error);
    return { ok: false, error: "Não foi possível ler as compras parceladas." };
  }

  type Row = GroupRow & {
    registration_date: string;
    direction: string;
    considered: boolean;
    source: string;
  };
  const rows = (data ?? []) as Row[];
  if (rows.length === 0) return { ok: true, created: 0 };

  const clusters = new Map<string, Row[]>();
  for (const r of rows) {
    const anchor = addMonths(r.reference_month, -r.installment_current);
    const key = `${r.person_id}|${r.amount}|${r.installment_total}|${anchor}`;
    const list = clusters.get(key);
    if (list) list.push(r);
    else clusters.set(key, [r]);
  }

  let created = 0;
  for (const cluster of clusters.values()) {
    const groupId = crypto.randomUUID();
    const { error: linkError } = await supabase
      .from("transactions")
      .update({ installment_group_id: groupId })
      .in(
        "id",
        cluster.map((r) => r.id)
      );
    if (linkError) {
      console.error("backfillInstallmentGroups (link) failed:", linkError);
      continue;
    }

    const latest = cluster.reduce((a, b) => (b.installment_current > a.installment_current ? b : a));
    const existingNumbers = new Set(cluster.map((r) => r.installment_current));
    const future = [];
    for (let n = latest.installment_current + 1; n <= latest.installment_total; n++) {
      if (existingNumbers.has(n)) continue;
      const offset = n - latest.installment_current;
      future.push({
        registration_date: addMonthsToISODate(latest.registration_date, offset),
        reference_month: addMonths(latest.reference_month, offset),
        person_id: latest.person_id,
        direction: latest.direction,
        fixed_variable: "variable",
        type_id: latest.type_id,
        category_id: latest.category_id,
        installment_current: n,
        installment_total: latest.installment_total,
        amount: latest.amount,
        description: latest.description,
        considered: latest.considered,
        source: latest.source,
        installment_group_id: groupId,
      });
    }
    if (future.length === 0) continue;
    const { error: insertError } = await supabase.from("transactions").insert(future);
    if (insertError) {
      console.error("backfillInstallmentGroups (insert) failed:", insertError);
      continue;
    }
    created += future.length;
  }

  if (created > 0) revalidateAll();
  return { ok: true, created };
}
