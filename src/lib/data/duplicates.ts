"use server";

import { revalidatePath } from "next/cache";
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
