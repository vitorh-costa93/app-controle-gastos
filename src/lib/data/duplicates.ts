"use server";

import { revalidatePath, revalidateTag } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { DuplicatePair, findDuplicatePairs, pairKey } from "@/lib/domain/duplicates";
import { deleteTransaction, listAllTransactions } from "./transactions";

const APPROVALS_KEY = "duplicate_approvals";

async function readApprovals(): Promise<string[]> {
  const { data, error } = await createAdminClient()
    .from("app_settings")
    .select("value")
    .eq("key", APPROVALS_KEY)
    .maybeSingle();
  if (error || !Array.isArray(data?.value)) return [];
  return (data.value as unknown[]).filter((v): v is string => typeof v === "string");
}

/** Lançamentos que parecem duplicados e ainda não foram revisados. */
export async function listDuplicatePairs(): Promise<DuplicatePair[]> {
  const [transactions, approved] = await Promise.all([listAllTransactions(), readApprovals()]);
  return findDuplicatePairs(transactions, new Set(approved));
}

/** "Não é duplicado": mantém os dois lançamentos e não volta a avisar sobre este par. */
export async function approveDuplicate(
  originalId: string,
  suspectId: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  const approved = await readApprovals();
  const key = pairKey(originalId, suspectId);
  if (!approved.includes(key)) approved.push(key);
  const { error } = await createAdminClient()
    .from("app_settings")
    .upsert({ key: APPROVALS_KEY, value: approved, updated_at: new Date().toISOString() });
  if (error) {
    console.error("approveDuplicate failed:", error);
    return { ok: false, error: "Não foi possível salvar a aprovação." };
  }
  revalidatePath("/cadastro");
  return { ok: true };
}

/** "É duplicado": exclui o lançamento suspeito (o cadastrado depois). */
export async function rejectDuplicate(suspectId: string): Promise<{ ok: true } | { ok: false; error: string }> {
  return deleteTransaction(suspectId);
}

/** "Não é duplicado" para vários pares de uma vez (todas as parcelas de uma compra parcelada). */
export async function approveDuplicateKeys(keys: string[]): Promise<{ ok: true } | { ok: false; error: string }> {
  const approved = await readApprovals();
  for (const key of keys) if (!approved.includes(key)) approved.push(key);
  const { error } = await createAdminClient()
    .from("app_settings")
    .upsert({ key: APPROVALS_KEY, value: approved, updated_at: new Date().toISOString() });
  if (error) {
    console.error("approveDuplicateKeys failed:", error);
    return { ok: false, error: "Não foi possível salvar a aprovação." };
  }
  revalidatePath("/cadastro");
  return { ok: true };
}

/** "É duplicado" numa compra parcelada: exclui todas as parcelas do grupo repetido (a compra gerada depois). */
export async function rejectDuplicateGroup(
  suspectGroupId: string
): Promise<{ ok: true; deleted: number } | { ok: false; error: string }> {
  const { data, error } = await createAdminClient()
    .from("transactions")
    .update({ deleted_at: new Date().toISOString() })
    .eq("installment_group_id", suspectGroupId)
    .is("deleted_at", null)
    .select("id");
  if (error) {
    console.error("rejectDuplicateGroup failed:", error);
    return { ok: false, error: "Não foi possível excluir a compra parcelada repetida." };
  }
  revalidatePath("/cadastro");
  revalidateTag("analysis");
  revalidatePath("/analise");
  revalidatePath("/simulacao");
  return { ok: true, deleted: data?.length ?? 0 };
}
