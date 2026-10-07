"use server";

import { revalidatePath, revalidateTag } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { bulkDatabasePatch, bulkEditSchema, BulkEditPatch } from "@/lib/domain/bulk-edit";

export async function bulkEditMovements(ids: string[], patch: BulkEditPatch): Promise<{ ok: true; count: number } | { ok: false; error: string }> {
  const parsed = bulkEditSchema.safeParse({ ids, patch });
  if (!parsed.success) return { ok: false, error: "Selecione até 500 registros e preencha os campos escolhidos com valores válidos." };
  const { data, error } = await createAdminClient().rpc("bulk_edit_movements", {
    p_ids: parsed.data.ids,
    p_patch: bulkDatabasePatch(parsed.data.patch),
  });
  if (error) {
    console.error("bulkEditMovements failed:", error.code);
    const message = error.message.startsWith("Lote:") ? error.message.slice(5).trim() : "Não foi possível salvar o lote. Nenhum registro foi alterado.";
    return { ok: false, error: message };
  }
  revalidateTag("analysis");
  revalidateTag("recurrence-rules");
  for (const route of ["/cadastro", "/analise", "/simulacao", "/configuracoes"]) revalidatePath(route);
  return { ok: true, count: Number(data) };
}
