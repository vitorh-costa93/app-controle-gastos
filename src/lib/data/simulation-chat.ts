"use server";

import type { ResponseInput } from "openai/resources/responses/responses";
import { resolveModelFor } from "@/lib/ai/models";
import { getOpenAIClient, isAiConfigured } from "@/lib/ai/openai";
import { logAiUsage } from "@/lib/ai/usage";
import { SimulationCategory } from "@/types/db";

export interface AssistantChatMessage {
  role: "user" | "assistant";
  content: string;
  images?: string[];
}

export interface AssistantScenarioSuggestion {
  title: string;
  category: SimulationCategory;
  description: string;
  estimatedCashCents: number;
  estimatedInstallmentTotalCents: number;
  installments: number;
  destinationAirport?: string | null;
  destinationLabel?: string | null;
  accommodationName?: string | null;
  outboundDate?: string | null;
  returnDate?: string | null;
  summaryHint: string;
}

export interface AssistantFinancialContext {
  personLabel: string;
  currentReserveCents: number;
  averageMonthlyLeftoverCents: number;
  horizonLabel: string;
  cdiAnnualPercent: number;
  existingSimulations: Array<{
    description: string;
    category: SimulationCategory;
    cashPriceCents: number | null;
    totalAmountCents: number;
    installments: number;
  }>;
}

const CHAT_RESPONSE_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["reply", "suggestions"],
  properties: {
    reply: { type: "string" },
    suggestions: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: [
          "title",
          "category",
          "description",
          "estimated_cash_brl",
          "estimated_installment_total_brl",
          "installments",
          "destination_airport",
          "destination_label",
          "accommodation_name",
          "outbound_date",
          "return_date",
          "summary_hint",
        ],
        properties: {
          title: { type: "string" },
          category: { type: "string", enum: ["product", "travel"] },
          description: { type: "string" },
          estimated_cash_brl: { type: "number" },
          estimated_installment_total_brl: { type: "number" },
          installments: { type: "integer" },
          destination_airport: { type: ["string", "null"] },
          destination_label: { type: ["string", "null"] },
          accommodation_name: { type: ["string", "null"] },
          outbound_date: { type: ["string", "null"] },
          return_date: { type: ["string", "null"] },
          summary_hint: { type: "string" },
        },
      },
    },
  },
} as const;

export async function askSimulationAssistant(
  messages: AssistantChatMessage[],
  context: AssistantFinancialContext
): Promise<{ ok: true; reply: string; suggestions: AssistantScenarioSuggestion[] } | { ok: false; error: string }> {
  if (!isAiConfigured()) {
    return { ok: false, error: "Chave da OpenAI não configurada no servidor." };
  }

  const openai = getOpenAIClient();
  const model = await resolveModelFor("insight");
  const t0 = Date.now();

  const existingSummary = context.existingSimulations
    .map(
      (s) =>
        `- ${s.description} (${s.category}): à vista R$ ${((s.cashPriceCents ?? s.totalAmountCents) / 100).toFixed(2)}, parcelado ${s.installments}x total R$ ${(s.totalAmountCents / 100).toFixed(2)}`
    )
    .join("\n");

  const recentMessages = messages.slice(-8);
  const userIndices = recentMessages
    .map((m, idx) => (m.role === "user" ? idx : -1))
    .filter((idx) => idx >= 0);
  const imageAllowedIndices = new Set(userIndices.slice(-2));

  const conversationInput: ResponseInput = recentMessages.map((m, idx) => {
    if (m.role === "assistant") {
      return {
        role: "assistant" as const,
        content: m.content,
      };
    }

    const validImages = imageAllowedIndices.has(idx)
      ? (m.images ?? []).filter((img) => typeof img === "string" && img.startsWith("data:image/")).slice(0, 4)
      : [];

    if (validImages.length === 0) {
      return {
        role: "user" as const,
        content: m.content,
      };
    }

    return {
      role: "user" as const,
      content: [
        {
          type: "input_text" as const,
          text: m.content.trim() || "Analise as imagens enviadas.",
        },
        ...validImages.map((img) => ({
          type: "input_image" as const,
          image_url: img,
          detail: "auto" as const,
        })),
      ],
    };
  });

  try {
    const response = await openai.responses.create({
      model,
      reasoning: { effort: "low" },
      tools: [
        {
          type: "web_search_preview",
          search_context_size: "low",
          user_location: {
            type: "approximate",
            country: "BR",
            region: "SP",
            city: "Araraquara",
          },
        },
      ],
      instructions: `Você é o Assistente Financeiro e de Viagens pessoal do casal (Vitor e Jaqueline, moradores de Araraquara-SP) dentro do aplicativo MeuDinheiro.
Responda em português do Brasil de forma objetiva, prática e usando OS DADOS REAIS do orçamento abaixo:
- Visão atual: ${context.personLabel}
- Saldo / Reserva atual: R$ ${(context.currentReserveCents / 100).toFixed(2)}
- Sobra média mensal projetada: R$ ${(context.averageMonthlyLeftoverCents / 100).toFixed(2)}/mês
- Horizonte analisado: ${context.horizonLabel}
- CDI atual: ${context.cdiAnnualPercent.toFixed(2)}% a.a.
- Aeroportos próximos para viagens: Campinas (VCP) e Ribeirão Preto (RAO).
- Simulações já cadastradas:
${existingSummary || "(nenhuma simulação cadastrada)"}

FORMATO E IMAGENS:
- Use Markdown limpo (**negrito** bem fechado, listas com "-") sem asteriscos soltos ou quebrados.
- Quando o usuário enviar imagens (prints de ofertas, resorts, passagens aéreas, produtos ou cotações), leia todos os preços, datas, condições de parcelamento, taxas e detalhes visíveis, compare com o orçamento real do casal e gere itens estruturados em "suggestions" sempre que fizer sentido permitir adicionar como cenário com 1 clique.

REGRAS PARA SUGESTÕES DE CENÁRIOS:
- Se o usuário pedir opções de viagens, resorts, destinos ou produtos para comprar/comparar, busque na web opções reais com valores estimados atualizados e devolva de 2 a 4 itens estruturados no array "suggestions" para que o usuário possa clicar em "+ Adicionar à Simulação".
- Para sugestões de viagem ("travel"), preencha sempre destination_airport (código IATA de 3 letras, ex.: "IOS", "REC", "NAT", "BPS", "FOR", "MCZ"), destination_label (ex.: "Ilhéus - BA (IOS)"), accommodation_name (nome exato do resort/hotel), outbound_date e return_date (YYYY-MM-DD compatíveis com a pergunta ou próximo feriado/mês mencionado).
- Para perguntas puramente analíticas sobre o orçamento (onde não faz sentido criar novo cenário), retorne suggestions: [].`,
      input: conversationInput,
      text: {
        format: {
          type: "json_schema",
          name: "simulation_assistant_reply",
          strict: true,
          schema: CHAT_RESPONSE_SCHEMA,
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
    if (!raw) {
      return { ok: false, error: "O assistente não retornou resposta." };
    }

    const parsed = JSON.parse(raw) as {
      reply: string;
      suggestions: Array<{
        title: string;
        category: SimulationCategory;
        description: string;
        estimated_cash_brl: number;
        estimated_installment_total_brl: number;
        installments: number;
        destination_airport: string | null;
        destination_label: string | null;
        accommodation_name: string | null;
        outbound_date: string | null;
        return_date: string | null;
        summary_hint: string;
      }>;
    };

    const suggestions: AssistantScenarioSuggestion[] = (parsed.suggestions ?? []).map((s) => ({
      title: s.title,
      category: s.category,
      description: s.description,
      estimatedCashCents: Math.max(100, Math.round(s.estimated_cash_brl * 100)),
      estimatedInstallmentTotalCents: Math.max(
        100,
        Math.round(Math.max(s.estimated_installment_total_brl, s.estimated_cash_brl) * 100)
      ),
      installments: Math.max(1, Math.min(12, s.installments || 10)),
      destinationAirport: s.destination_airport,
      destinationLabel: s.destination_label,
      accommodationName: s.accommodation_name,
      outboundDate: s.outbound_date,
      returnDate: s.return_date,
      summaryHint: s.summary_hint,
    }));

    return { ok: true, reply: parsed.reply, suggestions };
  } catch (err) {
    await logAiUsage({ task: "insight", model, ok: false, durationMs: Date.now() - t0, error: String(err) });
    console.error("askSimulationAssistant failed:", err);
    return { ok: false, error: "Não foi possível consultar o assistente agora. Tente novamente." };
  }
}
