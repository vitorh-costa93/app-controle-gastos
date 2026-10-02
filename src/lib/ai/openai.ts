import "server-only";
import OpenAI from "openai";
import { modelFor, imageQuality, estimateCostUsd, type AiTask } from "./models";
import { logAiUsage } from "./usage";

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

// Modelos e custos vivem em ./models.ts; todo uso é registrado em ai_usage (./usage.ts).
// Imagem: só gpt-image-2.5-flare em medium (decisão do usuário); sem fallback para outros modelos.

/** chat.completions com modelo da tarefa + log de uso/custo (nunca quebra por causa do log). */
async function chat(
  task: AiTask,
  params: Omit<OpenAI.Chat.ChatCompletionCreateParamsNonStreaming, "model">
): Promise<OpenAI.Chat.ChatCompletion> {
  const openai = getOpenAIClient();
  const model = modelFor(task);
  const t0 = Date.now();
  try {
    const response = await openai.chat.completions.create({ ...params, model });
    const u = response.usage;
    await logAiUsage({
      task,
      model,
      ok: true,
      inputTokens: u?.prompt_tokens,
      cachedTokens: u?.prompt_tokens_details?.cached_tokens,
      outputTokens: u?.completion_tokens,
      reasoningTokens: u?.completion_tokens_details?.reasoning_tokens,
      durationMs: Date.now() - t0,
    });
    return response;
  } catch (error) {
    await logAiUsage({ task, model, ok: false, durationMs: Date.now() - t0, error: String(error) });
    throw error;
  }
}

export interface GeneratedImage {
  data: Buffer;
  contentType: string;
}

/**
 * Gera uma foto ilustrativa para uma simulação (ex.: "Viagem para Gramado").
 * Retorna os bytes da imagem (sem URL temporária pra baixar depois) ou null em
 * qualquer falha — a simulação nunca deve ficar bloqueada por causa da imagem.
 */
export async function generateSimulationImage(description: string): Promise<GeneratedImage | null> {
  if (!isAiConfigured()) return null;
  const openai = getOpenAIClient();
  const prompt = `Fotografia realista, bonita e bem iluminada representando: "${description}". Estilo foto de revista/banco de imagens, cores naturais, enquadramento horizontal, sem texto, sem letras, sem números, sem logotipos.`;

  const quality = imageQuality();
  for (const model of [modelFor("image")]) {
    const t0 = Date.now();
    try {
      const response = await openai.images.generate({
        model,
        prompt,
        size: "1536x1024",
        quality,
        output_format: "jpeg",
        n: 1,
      });
      const u = response.usage;
      const usage = { inputTokens: u?.input_tokens ?? 0, cachedTokens: 0, outputTokens: u?.output_tokens ?? 0 };
      await logAiUsage({ task: "image", model, ok: true, ...usage, costUsd: u ? estimateCostUsd(model, usage) : null, durationMs: Date.now() - t0 });
      const b64 = response.data?.[0]?.b64_json;
      if (!b64) {
        console.error(`generateSimulationImage (${model}): resposta sem imagem`);
        continue;
      }
      return { data: Buffer.from(b64, "base64"), contentType: "image/jpeg" };
    } catch (error) {
      await logAiUsage({ task: "image", model, ok: false, durationMs: Date.now() - t0, error: String(error) });
      console.error(`generateSimulationImage (${model}) failed:`, error);
    }
  }
  return null;
}

export const RAW_EXTRACTION_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    statement_due_date: {
      type: ["string", "null"],
      description:
        "Somente para fatura de cartão de crédito: a data de VENCIMENTO da fatura, no formato YYYY-MM-DD (geralmente no canto superior direito). null se o documento não for uma fatura ou não mostrar o vencimento.",
    },
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
  required: ["statement_due_date", "transactions"],
} as const;

export interface ExtractionResult {
  transactions: RawExtractedTransaction[];
  /** Vencimento da fatura (YYYY-MM-DD), quando o documento é uma fatura de cartão. */
  statementDueDate: string | null;
}

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
- Use as pessoas, categorias e tipos existentes informados quando fizerem sentido; caso contrário, sugira o nome mais apropriado em texto livre.
- FATURA DE CARTÃO (Nubank, PicPay, Inter, Itaú, C6 etc.): procure SEMPRE a data de VENCIMENTO da fatura ("Vencimento", "Vence em", "Data de vencimento" — geralmente no canto superior direito, mas confira o documento todo) e devolva em statement_due_date (YYYY-MM-DD). Ela é a data de referência da fatura: o mês e o ano do vencimento são o mês de referência de todos os lançamentos. Também observe a data de fechamento/período exibida perto do vencimento para confirmar o mês e o ano. As compras costumam aparecer só com dia e mês; devolva em registration_date a data da compra usando o ano do vencimento (se o mês da compra for posterior ao mês do vencimento, use o ano anterior). Compras parceladas mostram a data da compra original e "parcela X/Y": preencha installment_current e installment_total.
- Em fatura de cartão de QUALQUER banco, traga só a lista de compras: ignore capa/resumo, boleto, pagamento da fatura anterior, saldo, subtotais, totais e pagamentos. Créditos/estornos (valores negativos) não são lançamentos: se houver estorno, omita também a compra original de mesmo estabelecimento e valor.
- Se o texto vier em formato de tabela/CSV (colunas separadas por vírgula ou ponto e vírgula, com cabeçalho), use os nomes das colunas para identificar data, descrição, valor etc., e gere um lançamento por linha de dados (ignorando a linha de cabeçalho).`;

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
): Promise<ExtractionResult> {
  const response = await chat("extraction", {
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
  imageDataUrls: string[],
  context: ExtractionContext
): Promise<ExtractionResult> {
  const response = await chat("vision", {
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      {
        role: "user",
        content: [
          {
            type: "text",
            text: `${buildContextBlock(context)}\n\nExtraia os lançamentos financeiros visíveis ${imageDataUrls.length > 1 ? `nestas ${imageDataUrls.length} imagens (várias páginas/prints de uma mesma fatura ou extrato)` : "nesta imagem"} (nota fiscal, cupom, recibo, comprovante ou anotação). Se as imagens forem páginas seguidas de uma mesma fatura, não repita o mesmo lançamento que aparecer em mais de uma página. Se for fatura de cartão, procure a data de vencimento da fatura (em qualquer posição da página, geralmente no canto superior direito) e devolva em statement_due_date; se a imagem não mostrar o vencimento, deixe null.`,
          },
          ...imageDataUrls.map((url) => ({ type: "image_url" as const, image_url: { url } })),
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
  const model = modelFor("transcription");
  const t0 = Date.now();
  try {
    const result = await openai.audio.transcriptions.create({ model, file, language: "pt" });
    // Whisper cobra por minuto de áudio (não por token): registra a chamada sem custo estimado.
    await logAiUsage({ task: "transcription", model, ok: true, costUsd: null, durationMs: Date.now() - t0 });
    return result.text;
  } catch (error) {
    await logAiUsage({ task: "transcription", model, ok: false, durationMs: Date.now() - t0, error: String(error) });
    throw error;
  }
}

function parseExtractionResponse(content: string | null | undefined): ExtractionResult {
  if (!content) return { transactions: [], statementDueDate: null };
  try {
    const parsed = JSON.parse(content) as { statement_due_date?: string | null; transactions: RawExtractedTransaction[] };
    return { transactions: parsed.transactions ?? [], statementDueDate: parsed.statement_due_date ?? null };
  } catch {
    return { transactions: [], statementDueDate: null };
  }
}

export async function generateMonthInsight(prompt: string): Promise<string> {
  const response = await chat("insight", {
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

/** Análise financeira de compra à vista × parcelada, a partir de números já calculados (nunca inventa valores). */
export async function generateCashVsInstallmentSummary(prompt: string): Promise<string> {
  const response = await chat("insight", {
    messages: [
      {
        role: "system",
        content:
          "Você compara pagar à vista com parcelar uma compra, usando exclusivamente os números calculados fornecidos (rendimento da Caixinha do Nubank, juros embutidos, IR já descontado). Diga qual opção custa menos do ponto de vista financeiro, explique o porquê com os valores, cite o ponto de equilíbrio e, se houver, o risco de saldo ficar apertado. Não é recomendação de investimento e não invente números. Máximo 4 frases curtas, em português do Brasil, sem listas.",
      },
      { role: "user", content: prompt },
    ],
  });
  return response.choices[0]?.message?.content?.trim() ?? "";
}

export async function generateSimulationSummary(prompt: string): Promise<string> {
  const response = await chat("insight", {
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
