import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { estimateCostUsd, type AiTask } from "./models";

export interface UsageRecord {
  task: AiTask;
  model: string;
  ok: boolean;
  inputTokens?: number;
  cachedTokens?: number;
  outputTokens?: number;
  reasoningTokens?: number;
  /** Sobrescreve a estimativa por tokens (ex.: preço fixo por imagem quando a API não devolve usage). */
  costUsd?: number | null;
  durationMs?: number;
  error?: string;
}

/** Teto mensal em US$ (AI_MONTHLY_CAP_USD). Só AVISA: nunca bloqueia nenhuma chamada. */
function monthlyCap(): number {
  const n = Number(process.env.AI_MONTHLY_CAP_USD);
  return Number.isFinite(n) && n > 0 ? n : 5;
}

/**
 * Registra uma chamada de IA. Nunca lança: falha de log não pode derrubar a funcionalidade.
 * Depois de gravar, confere o gasto do mês e avisa no log do servidor se passou do teto.
 */
export async function logAiUsage(rec: UsageRecord): Promise<void> {
  try {
    const usage = {
      inputTokens: rec.inputTokens ?? 0,
      cachedTokens: rec.cachedTokens ?? 0,
      outputTokens: rec.outputTokens ?? 0,
    };
    const cost = rec.costUsd !== undefined ? rec.costUsd : estimateCostUsd(rec.model, usage);
    const supabase = createAdminClient();
    const { error } = await supabase.from("ai_usage").insert({
      task: rec.task,
      model: rec.model,
      ok: rec.ok,
      input_tokens: usage.inputTokens,
      cached_tokens: usage.cachedTokens,
      output_tokens: usage.outputTokens,
      reasoning_tokens: rec.reasoningTokens ?? 0,
      cost_usd: cost,
      duration_ms: rec.durationMs ?? null,
      error: rec.error?.slice(0, 300) ?? null,
    });
    if (error) {
      console.error("logAiUsage: falha ao gravar", error.message);
      return;
    }
    const month = await getMonthAiSpend();
    if (month.overCap) {
      console.warn(`[ai] gasto estimado do mês US$ ${month.spentUsd.toFixed(2)} passou do teto US$ ${month.capUsd.toFixed(2)}`);
    }
  } catch (error) {
    console.error("logAiUsage failed:", error);
  }
}

export interface MonthAiSpend {
  spentUsd: number;
  capUsd: number;
  overCap: boolean;
}

/** Gasto estimado do mês corrente (UTC) somando ai_usage. */
export async function getMonthAiSpend(): Promise<MonthAiSpend> {
  const start = new Date();
  start.setUTCDate(1);
  start.setUTCHours(0, 0, 0, 0);
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("ai_usage")
    .select("cost_usd")
    .gte("created_at", start.toISOString());
  if (error) throw new Error(error.message);
  const spentUsd = (data ?? []).reduce((sum, r) => sum + Number(r.cost_usd ?? 0), 0);
  const capUsd = monthlyCap();
  return { spentUsd, capUsd, overCap: spentUsd >= capUsd };
}
