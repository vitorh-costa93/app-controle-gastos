"use server";

import { revalidatePath, revalidateTag } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";

export interface UnplannedMark {
  /** Id do lançamento real. */
  id: string;
  /** true = foi planejado/essencial (sai de "Fora do planejado"); false = volta a contar. */
  excluded: boolean;
}

/** Salva a marcação manual de "fora do planejado" dos lançamentos informados. */
export async function setUnplannedMarks(
  marks: UnplannedMark[]
): Promise<{ ok: true; updated: number } | { ok: false; error: string }> {
  // Ocorrências projetadas (ids "projected:...") não são lançamentos: não há o que marcar.
  const real = marks.filter((m) => typeof m.id === "string" && !m.id.startsWith("projected:"));
  if (real.length === 0) return { ok: true, updated: 0 };

  const supabase = createAdminClient();
  let updated = 0;
  for (const excluded of [true, false]) {
    const ids = real.filter((m) => m.excluded === excluded).map((m) => m.id);
    if (ids.length === 0) continue;
    const { data, error } = await supabase
      .from("transactions")
      .update({ unplanned_excluded: excluded })
      .in("id", ids)
      .is("deleted_at", null)
      .select("id");
    if (error) {
      console.error("setUnplannedMarks failed:", error);
      return { ok: false, error: "Não foi possível salvar as marcações." };
    }
    updated += data?.length ?? 0;
  }

  revalidateTag("analysis");
  revalidatePath("/analise");
  return { ok: true, updated };
}
