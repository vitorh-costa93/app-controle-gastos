"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { categoryLimitSchema, defaultReserveConfig, reserveConfigSchema, reserveEntrySchema, saveCategoryLimitSchema, saveReserveEntrySchema, type PlanningData } from "@/lib/planning";

const prefix = "planning:";
type Result = { ok: true } | { ok: false; error: string };
const fail = (error: unknown): Result => ({ ok: false, error: error instanceof Error ? error.message : "Não foi possível salvar o planejamento." });
async function ensureReferences(personIds: string[], categoryIds: string[]) {
  const client = createAdminClient();
  for (const [table, ids] of [["people", personIds], ["categories", categoryIds]] as const) {
    if (!ids.length) continue;
    const { data, error } = await client.from(table).select("id").in("id", ids);
    if (error) throw new Error("Não foi possível validar pessoas e categorias.");
    if (data.length !== new Set(ids).size) throw new Error("Pessoa ou categoria não encontrada. Atualize a página.");
  }
}
async function write(key: string, value: unknown): Promise<Result> {
  const { error } = await createAdminClient().from("app_settings").upsert({ key, value, updated_at: new Date().toISOString() });
  if (error) return { ok: false, error: "Não foi possível salvar o planejamento." };
  revalidatePath("/analise");
  return { ok: true };
}
export async function getPlanning(): Promise<PlanningData> {
  const rows: { key: string; value: unknown }[] = [];
  const client = createAdminClient();
  for (let from = 0; ; from += 1000) {
    const { data, error } = await client.from("app_settings").select("key,value").like("key", `${prefix}%`).order("key").range(from, from + 999);
    if (error) throw new Error("Não foi possível carregar o planejamento.");
    rows.push(...data);
    if (data.length < 1000) break;
  }
  const result: PlanningData = { limits: [], reserveEntries: [], reserveConfig: { ...defaultReserveConfig } };
  for (const row of rows) {
    if (row.key.startsWith(`${prefix}limit:`)) {
      const parsed = categoryLimitSchema.safeParse(row.value);
      if (!parsed.success || row.key !== `${prefix}limit:${parsed.data.month}:${parsed.data.personId}:${parsed.data.categoryId}`) throw new Error("Há um limite de planejamento inválido.");
      result.limits.push(parsed.data);
    } else if (row.key.startsWith(`${prefix}entry:`)) {
      const parsed = reserveEntrySchema.safeParse(row.value);
      if (!parsed.success || row.key !== `${prefix}entry:${parsed.data.id}`) throw new Error("Há um movimento de reserva inválido.");
      result.reserveEntries.push(parsed.data);
    } else if (row.key === `${prefix}reserve-config`) {
      const parsed = reserveConfigSchema.safeParse(row.value);
      if (!parsed.success) throw new Error("A configuração da reserva é inválida.");
      result.reserveConfig = parsed.data;
    }
  }
  return result;
}
export async function saveCategoryLimit(input: z.input<typeof saveCategoryLimitSchema>): Promise<Result> {
  const parsed = saveCategoryLimitSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Confira pessoa, categoria, mês e valor positivo do limite." };
  try {
    const value = parsed.data;
    await ensureReferences([value.personId], [value.categoryId]);
    const key = `${prefix}limit:${value.month}:${value.personId}:${value.categoryId}`;
    if (value.amountCents === null) {
      const { error } = await createAdminClient().from("app_settings").delete().eq("key", key);
      if (error) return { ok: false, error: "Não foi possível remover o limite." };
      revalidatePath("/analise"); return { ok: true };
    }
    return await write(key, value);
  } catch (error) { return fail(error); }
}
export async function saveReserveEntry(input: z.input<typeof saveReserveEntrySchema>): Promise<Result> {
  const parsed = saveReserveEntrySchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Confira pessoa, data, valor e observação do movimento." };
  try {
    await ensureReferences([parsed.data.personId], []);
    const entry = { ...parsed.data, id: parsed.data.id ?? randomUUID() };
    return await write(`${prefix}entry:${entry.id}`, entry);
  } catch (error) { return fail(error); }
}
export async function deleteReserveEntry(id: string): Promise<Result> {
  if (!z.string().uuid().safeParse(id).success) return { ok: false, error: "Movimento inválido." };
  try {
    const { error } = await createAdminClient().from("app_settings").delete().eq("key", `${prefix}entry:${id}`);
    if (error) return { ok: false, error: "Não foi possível remover o movimento." };
    revalidatePath("/analise"); return { ok: true };
  } catch (error) { return fail(error); }
}
export async function saveReserveConfig(input: z.input<typeof reserveConfigSchema>): Promise<Result> {
  const parsed = reserveConfigSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Confira o valor positivo da meta e a configuração das despesas essenciais." };
  try { await ensureReferences([], parsed.data.essentialCategoryIds); return await write(`${prefix}reserve-config`, parsed.data); } catch (error) { return fail(error); }
}
