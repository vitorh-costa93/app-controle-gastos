"use server";

import type { ResponseInput } from "openai/resources/responses/responses";
import { createAdminClient } from "@/lib/supabase/admin";
import { resolveModelFor } from "@/lib/ai/models";
import { getOpenAIClient, isAiConfigured } from "@/lib/ai/openai";
import { logAiUsage } from "@/lib/ai/usage";
import { addMonths, toReferenceMonth } from "@/lib/utils/format";
import { reaisStringToCents } from "./mappers";
import { getEstimatedExpenses } from "./estimates";
import type { AssistantChatMessage } from "./simulation-chat";

export interface FinancialEstimateSuggestion {
  label: string;
  categoryId: string;
  categoryName: string;
  monthlyAmountCents: number;
  basisSummary: string;
}

const FINANCIAL_CHAT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["reply", "estimate_suggestions"],
  properties: {
    reply: { type: "string" },
    estimate_suggestions: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["label", "category_id", "category_name", "monthly_amount_brl", "basis_summary"],
        properties: {
          label: { type: "string" },
          category_id: { type: "string" },
          category_name: { type: "string" },
          monthly_amount_brl: { type: "number" },
          basis_summary: { type: "string" },
        },
      },
    },
  },
} as const;

export async function askFinancialAssistant(
  messages: AssistantChatMessage[],
  options: { personId?: string | null; currentPath?: string } = {}
): Promise<
  | { ok: true; reply: string; estimateSuggestions: FinancialEstimateSuggestion[] }
  | { ok: false; error: string }
> {
  if (!isAiConfigured()) {
    return { ok: false, error: "Chave da OpenAI não configurada no servidor." };
  }

  const supabase = createAdminClient();
  const currentMonth = toReferenceMonth(new Date());
  const twelveMonthsAgo = addMonths(currentMonth, -11);
  const threeMonthsAgo = addMonths(currentMonth, -2);

  const [peopleRes, categoriesRes, estimates, txRes] = await Promise.all([
    supabase.from("people").select("id, name").eq("active", true).order("name"),
    supabase.from("categories").select("id, name").eq("active", true).order("name"),
    getEstimatedExpenses(),
    (() => {
      let q = supabase
        .from("transactions")
        .select("reference_month, person_id, category_id, direction, amount, description")
        .eq("considered", true)
        .is("deleted_at", null)
        .gte("reference_month", twelveMonthsAgo)
        .lte("reference_month", currentMonth);
      if (options.personId) {
        q = q.eq("person_id", options.personId);
      }
      return q;
    })(),
  ]);

  if (txRes.error) {
    console.error("askFinancialAssistant transactions query failed:", txRes.error);
    return { ok: false, error: "Não foi possível consultar os lançamentos no banco." };
  }

  const people = (peopleRes.data ?? []) as Array<{ id: string; name: string }>;
  const categories = (categoriesRes.data ?? []) as Array<{ id: string; name: string }>;
  const categoryNameById = new Map(categories.map((c) => [c.id, c.name]));
  const personName = options.personId
    ? people.find((p) => p.id === options.personId)?.name ?? "Pessoa selecionada"
    : "Casal (Todas as pessoas)";

  type TxRow = {
    reference_month: string;
    person_id: string;
    category_id: string | null;
    direction: "income" | "expense";
    amount: string;
    description: string | null;
  };
  const rows = (txRes.data ?? []) as TxRow[];

  const monthTotals = new Map<string, { incomeCents: number; expenseCents: number }>();
  const catMonthTotals = new Map<string, number>(); // key: `${categoryId}|${month}`
  const catLast3Totals = new Map<string, number>();
  const catLast12Totals = new Map<string, number>();
  const catTopDescriptions = new Map<string, Map<string, number>>();

  for (const r of rows) {
    const cents = reaisStringToCents(r.amount);
    const mEntry = monthTotals.get(r.reference_month) ?? { incomeCents: 0, expenseCents: 0 };
    if (r.direction === "income") mEntry.incomeCents += cents;
    else mEntry.expenseCents += cents;
    monthTotals.set(r.reference_month, mEntry);

    if (r.direction === "expense") {
      const catId = r.category_id ?? "sem-categoria";
      const cmKey = `${catId}|${r.reference_month}`;
      catMonthTotals.set(cmKey, (catMonthTotals.get(cmKey) ?? 0) + cents);
      catLast12Totals.set(catId, (catLast12Totals.get(catId) ?? 0) + cents);

      if (r.reference_month >= threeMonthsAgo) {
        catLast3Totals.set(catId, (catLast3Totals.get(catId) ?? 0) + cents);
        const desc = (r.description || "Sem descrição").trim().slice(0, 48);
        const descMap = catTopDescriptions.get(catId) ?? new Map<string, number>();
        descMap.set(desc, (descMap.get(desc) ?? 0) + cents);
        catTopDescriptions.set(catId, descMap);
      }
    }
  }

  const monthsList = Array.from(monthTotals.keys()).sort();
  const monthlySummaryText = monthsList
    .map((m) => {
      const t = monthTotals.get(m)!;
      return `- ${m}: Receitas R$ ${(t.incomeCents / 100).toFixed(2)} | Despesas R$ ${(t.expenseCents / 100).toFixed(2)}`;
    })
    .join("\n");

  const sortedCategories = Array.from(catLast12Totals.entries()).sort((a, b) => b[1] - a[1]);
  const last3MonthsList = [addMonths(currentMonth, -2), addMonths(currentMonth, -1), currentMonth];

  const categoryBreakdownText = sortedCategories
    .map(([catId, total12]) => {
      const name = categoryNameById.get(catId) ?? "Sem categoria";
      const total3 = catLast3Totals.get(catId) ?? 0;
      const avg3 = Math.round(total3 / 3);
      const perMonth3 = last3MonthsList
        .map((m) => `${m}: R$ ${((catMonthTotals.get(`${catId}|${m}`) ?? 0) / 100).toFixed(2)}`)
        .join(", ");
      const topDescs = Array.from((catTopDescriptions.get(catId) ?? new Map()).entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 4)
        .map(([d, v]) => `${d} (R$ ${(v / 100).toFixed(2)})`)
        .join("; ");
      return `- [${catId}] ${name} | Últimos 3m (${perMonth3}) | Total 3m: R$ ${(total3 / 100).toFixed(2)} | Média 3m: R$ ${(avg3 / 100).toFixed(2)}/mês | Total 12m: R$ ${(total12 / 100).toFixed(2)}${topDescs ? ` | Principais itens 3m: ${topDescs}` : ""}`;
    })
    .join("\n");

  const estimatesText = estimates
    .map((e) => {
      const catName = e.categoryId ? categoryNameById.get(e.categoryId) ?? e.categoryId : "Sem categoria";
      const customNote =
        e.customAmountCents && e.customAmountCents > 0
          ? `valor customizado R$ ${(e.customAmountCents / 100).toFixed(2)}/mês`
          : "média automática dos 2 últimos meses";
      return `- ${e.label} (${catName}): ${customNote}`;
    })
    .join("\n");

  const activeCategoriesList = categories.map((c) => `- ${c.id}: ${c.name}`).join("\n");

  const recentMessages = messages.slice(-8);
  const conversationInput: ResponseInput = recentMessages.map((m) => ({
    role: m.role,
    content: m.content,
  }));

  const openai = getOpenAIClient();
  const model = await resolveModelFor("insight");
  const t0 = Date.now();

  try {
    const response = await openai.responses.create({
      model,
      reasoning: { effort: "low" },
      instructions: `Você é o Assistente Financeiro Pessoal do MeuDinheiro (Vitor e Jaqueline, Araraquara-SP), atuando na tela "${options.currentPath || "/analise"}".
Responda em português do Brasil usando EXCLUSIVAMENTE os números reais consultados no banco de dados abaixo (nunca invente valores):

ESCOPO ATUAL: ${personName} | Mês corrente: ${currentMonth} | Janela consultada: ${twelveMonthsAgo} a ${currentMonth} (${rows.length} lançamentos considerados).

RESUMO MENSAL (12 meses):
${monthlySummaryText || "(sem lançamentos)"}

GASTOS POR CATEGORIA (com detalhe dos últimos 3 meses ${last3MonthsList.join(", ")}):
${categoryBreakdownText || "(sem despesas no período)"}

GASTOS ESTIMADOS JÁ CONFIGURADOS:
${estimatesText || "(nenhum gasto estimado configurado)"}

CATEGORIAS ATIVAS DISPONÍVEIS (use o category_id exato ao sugerir gasto estimado):
${activeCategoriesList}

REGRAS DE RESPOSTA:
1. Quando perguntarem quanto foi gasto em uma categoria/tema nos últimos N meses (ex.: "alimentação nos últimos 3 meses"), some todas as categorias correspondentes (ex.: Supermercado / Alimentação / Restaurantes se aplicável), mostre mês a mês, o total e a média mensal.
2. Quando o usuário pedir para incluir como valor estimado para os próximos meses (ou quando você responder com uma média mensal útil que ainda não está nos gastos estimados ou pode ser atualizada), devolva 1 item estruturado em "estimate_suggestions" com o "category_id" exato, "category_name", "label" curto (ex.: "Alimentação"), "monthly_amount_brl" (média sugerida em reais) e "basis_summary" (ex.: "Média dos últimos 3 meses: R$ 2.150,00/mês").
3. Use Markdown limpo (**negrito** bem fechado, listas com "-").`,
      input: conversationInput,
      text: {
        format: {
          type: "json_schema",
          name: "financial_assistant_reply",
          strict: true,
          schema: FINANCIAL_CHAT_SCHEMA,
        },
      },
    });

    const u = response.usage;
    await logAiUsage({
      task: "insight",
      model,
      ok: true,
      inputTokens: u?.input_tokens,
      cachedTokens: u?.input_tokens_details?.cached_tokens,
      outputTokens: u?.output_tokens,
      durationMs: Date.now() - t0,
    });

    const raw = response.output_text;
    if (!raw) return { ok: false, error: "O assistente não retornou resposta." };

    const parsed = JSON.parse(raw) as {
      reply: string;
      estimate_suggestions?: Array<{
        label: string;
        category_id: string;
        category_name: string;
        monthly_amount_brl: number;
        basis_summary: string;
      }>;
    };

    const estimateSuggestions: FinancialEstimateSuggestion[] = (parsed.estimate_suggestions ?? [])
      .filter((s) => categoryNameById.has(s.category_id) && Number(s.monthly_amount_brl) > 0)
      .map((s) => ({
        label: s.label,
        categoryId: s.category_id,
        categoryName: categoryNameById.get(s.category_id) ?? s.category_name,
        monthlyAmountCents: Math.round(Number(s.monthly_amount_brl) * 100),
        basisSummary: s.basis_summary,
      }));

    return { ok: true, reply: parsed.reply, estimateSuggestions };
  } catch (err) {
    await logAiUsage({ task: "insight", model, ok: false, durationMs: Date.now() - t0, error: String(err) });
    console.error("askFinancialAssistant error:", err);
    return { ok: false, error: "Não foi possível consultar o assistente financeiro agora." };
  }
}
