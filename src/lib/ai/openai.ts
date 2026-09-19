import "server-only";
import OpenAI from "openai";

let client: OpenAI | null = null;

export function isAiConfigured(): boolean {
  return Boolean(process.env.OPENAI_API_KEY);
}

export function getOpenAIClient(): OpenAI {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY não configurada.");
  }
  if (!client) client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  return client;
}

export const EXTRACTION_MODEL = "gpt-4o-mini";
export const VISION_MODEL = "gpt-4o-mini";
export const TRANSCRIPTION_MODEL = "whisper-1";
export const INSIGHT_MODEL = "gpt-4o-mini";
export const IMAGE_MODEL = "dall-e-3";

/**
 * Gera uma imagem ilustrativa para uma simulação (ex.: "Viagem para Gramado").
 * Retorna null em qualquer falha — a simulação nunca deve ficar bloqueada por causa da imagem.
 */
export async function generateSimulationImage(description: string): Promise<string | null> {
  if (!isAiConfigured()) return null;
  try {
    const openai = getOpenAIClient();
    const response = await openai.images.generate({
      model: IMAGE_MODEL,
      prompt: `Ilustração digital simples, elegante e minimalista representando: "${description}". Cores suaves, sem texto, sem letras, sem números.`,
      size: "1024x1024",
      n: 1,
    });
    return response.data?.[0]?.url ?? null;
  } catch {
    return null;
  }
}

export const RAW_EXTRACTION_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    transactions: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          registration_date: { type: ["string", "null"], description: "Data no formato YYYY-MM-DD" },
          person_name: { type: ["string", "null"], description: "Nome da pessoa (ex.: Vitor, Jaqueline)" },
          direction: { type: ["string", "null"], enum: ["income", "expense", null] },
          fixed_variable: { type: ["string", "null"], enum: ["fixed", "variable", null] },
          type_name: { type: ["string", "null"] },
          category_name: { type: ["string", "null"] },
          installment_current: { type: ["integer", "null"] },
          installment_total: { type: ["integer", "null"] },
          amount: { type: ["number", "null"], description: "Valor em reais, ex.: 320.50" },
          description: { type: ["string", "null"] },
          confidence: {
            type: "object",
            additionalProperties: false,
            properties: {
              date: { type: "string", enum: ["alta", "media", "baixa"] },
              amount: { type: "string", enum: ["alta", "media", "baixa"] },
              category: { type: "string", enum: ["alta", "media", "baixa"] },
              origin: { type: "string", enum: ["alta", "media", "baixa"] },
            },
            required: ["date", "amount", "category", "origin"],
          },
        },
        required: [
          "registration_date",
          "person_name",
          "direction",
          "fixed_variable",
          "type_name",
          "category_name",
          "installment_current",
          "installment_total",
          "amount",
          "description",
          "confidence",
        ],
      },
    },
  },
  required: ["transactions"],
} as const;

export interface RawExtractedTransaction {
  registration_date: string | null;
  person_name: string | null;
  direction: "income" | "expense" | null;
  fixed_variable: "fixed" | "variable" | null;
  type_name: string | null;
  category_name: string | null;
  installment_current: number | null;
  installment_total: number | null;
  amount: number | null;
  description: string | null;
  confidence: { date: string; amount: string; category: string; origin: string };
}

const SYSTEM_PROMPT = `Você é um assistente financeiro que transforma relatos de gastos/receitas em lançamentos estruturados para um casal (Vitor e Jaqueline).

Regras obrigatórias:
- Cada evento financeiro distinto vira um lançamento separado. NUNCA agrupe eventos diferentes numa única linha.
- Nunca invente data, valor, pessoa ou categoria. Se não conseguir identificar algo com segurança, deixe o campo null e marque confiança "baixa" para ele.
- Datas relativas ("ontem", "dia 10") devem ser resolvidas usando a data de referência informada.
- installment_current/installment_total: se não houver parcelamento mencionado, use 1 e 1.
- amount é sempre em reais (BRL), nunca em centavos.
- direction: "expense" para gastos/saídas, "income" para receitas/entradas.
- Use as pessoas, categorias e tipos existentes informados quando fizerem sentido; caso contrário, sugira o nome mais apropriado em texto livre.`;

function buildContextBlock(context: ExtractionContext): string {
  return `Data de referência para resolver datas relativas: ${context.today}.
Pessoas cadastradas: ${context.people.join(", ")}.
Categorias cadastradas: ${context.categories.join(", ")}.
Tipos cadastrados: ${context.types.join(", ")}.`;
}

export interface ExtractionContext {
  today: string;
  people: string[];
  categories: string[];
  types: string[];
}

export async function extractTransactionsFromText(
  text: string,
  context: ExtractionContext
): Promise<RawExtractedTransaction[]> {
  const openai = getOpenAIClient();
  const response = await openai.chat.completions.create({
    model: EXTRACTION_MODEL,
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: `${buildContextBlock(context)}\n\nTexto do usuário:\n${text}` },
    ],
    response_format: {
      type: "json_schema",
      json_schema: { name: "extracted_transactions", strict: true, schema: RAW_EXTRACTION_SCHEMA },
    },
  });

  return parseExtractionResponse(response.choices[0]?.message?.content);
}

export async function extractTransactionsFromImage(
  imageDataUrl: string,
  context: ExtractionContext
): Promise<RawExtractedTransaction[]> {
  const openai = getOpenAIClient();
  const response = await openai.chat.completions.create({
    model: VISION_MODEL,
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      {
        role: "user",
        content: [
          {
            type: "text",
            text: `${buildContextBlock(context)}\n\nExtraia os lançamentos financeiros visíveis nesta imagem (nota fiscal, cupom, recibo, comprovante ou anotação).`,
          },
          { type: "image_url", image_url: { url: imageDataUrl } },
        ],
      },
    ],
    response_format: {
      type: "json_schema",
      json_schema: { name: "extracted_transactions", strict: true, schema: RAW_EXTRACTION_SCHEMA },
    },
  });

  return parseExtractionResponse(response.choices[0]?.message?.content);
}

export async function transcribeAudio(file: File): Promise<string> {
  const openai = getOpenAIClient();
  const result = await openai.audio.transcriptions.create({
    model: TRANSCRIPTION_MODEL,
    file,
    language: "pt",
  });
  return result.text;
}

function parseExtractionResponse(content: string | null | undefined): RawExtractedTransaction[] {
  if (!content) return [];
  try {
    const parsed = JSON.parse(content) as { transactions: RawExtractedTransaction[] };
    return parsed.transactions ?? [];
  } catch {
    return [];
  }
}

export async function generateMonthInsight(prompt: string): Promise<string> {
  const openai = getOpenAIClient();
  const response = await openai.chat.completions.create({
    model: INSIGHT_MODEL,
    messages: [
      {
        role: "system",
        content:
          "Você analisa exclusivamente os dados financeiros calculados fornecidos. Nunca invente causas ou números. Se os dados forem insuficientes, diga isso explicitamente. Seja direto, no máximo 3 frases, em português do Brasil.",
      },
      { role: "user", content: prompt },
    ],
  });
  return response.choices[0]?.message?.content?.trim() ?? "";
}

export async function generateSimulationSummary(prompt: string): Promise<string> {
  const openai = getOpenAIClient();
  const response = await openai.chat.completions.create({
    model: INSIGHT_MODEL,
    messages: [
      {
        role: "system",
        content:
          "Você explica o impacto financeiro de uma simulação usando exclusivamente os números calculados fornecidos. Nunca emita julgamento subjetivo (não diga se a pessoa deveria ou não comprar). Apenas descreva o impacto: quanto, quando, e o período de maior pressão financeira. Máximo 3 frases, em português do Brasil.",
      },
      { role: "user", content: prompt },
    ],
  });
  return response.choices[0]?.message?.content?.trim() ?? "";
}
