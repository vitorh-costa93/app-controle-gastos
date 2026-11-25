import "server-only";
import {
  BestOfferMeta,
  PriceHistoryPoint,
  ProductTrackerConfig,
  TravelLeadTimeInsight,
  TravelTrackerConfig,
  VerifiedFlightQuote,
  VerifiedProductOffer,
  VerifiedStayQuote,
} from "@/types/db";
import { getOpenAIClient, isAiConfigured } from "@/lib/ai/openai";
import { resolveModelFor } from "@/lib/ai/models";
import { logAiUsage } from "@/lib/ai/usage";
import {
  CONSOLE_ACCESSORY_EXCLUSIONS,
  DESTINATION_AIRPORTS,
  FORBIDDEN_CONDITION_TERMS,
  ORIGIN_AIRPORTS,
  formatTravelersSummary,
} from "./catalog";
import { buildTravelLeadTimeInsight } from "./history-stats";

/** Proteção SSRF: aceita apenas URLs HTTPS públicas na porta 443, bloqueando IPs locais/privados. */
export function isSafePublicHttpsUrl(rawUrl: string): boolean {
  try {
    const u = new URL(rawUrl);
    if (u.protocol !== "https:") return false;
    if (u.port && u.port !== "443") return false;
    const host = u.hostname.toLowerCase();
    if (
      host === "localhost" ||
      host.endsWith(".local") ||
      host.endsWith(".internal") ||
      host === "0.0.0.0" ||
      host === "127.0.0.1" ||
      host === "::1" ||
      /^127\./.test(host) ||
      /^10\./.test(host) ||
      /^192\.168\./.test(host) ||
      /^169\.254\./.test(host) ||
      /^172\.(1[6-9]|2\d|3[0-1])\./.test(host)
    ) {
      return false;
    }
    return host.includes(".");
  } catch {
    return false;
  }
}

async function safeFetchText(url: string, timeoutMs = 6500): Promise<string | null> {
  if (!isSafePublicHttpsUrl(url)) return null;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
        "Accept-Language": "pt-BR,pt;q=0.9,en-US;q=0.8",
        Accept: "text/html,application/xhtml+xml,application/json;q=0.9,*/*;q=0.8",
      },
      redirect: "follow",
    });
    if (!res.ok) return null;
    const text = await res.text();
    return text.slice(0, 120_000);
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/** Extrai snippets reais de busca web (DuckDuckGo Lite/HTML + Mercado Livre Oficial API + URLs customizadas) */
async function collectRawWebSnippets(queries: string[], customUrls: string[] = []): Promise<string[]> {
  const snippets: string[] = [];

  // 1. Mercado Livre Brasil API pública (condição = novo, lojas oficiais)
  const mainQuery = queries[0];
  if (mainQuery) {
    try {
      const mlUrl = `https://api.mercadolibre.com/sites/MLB/search?q=${encodeURIComponent(mainQuery)}&condition=new&limit=8`;
      const rawMl = await safeFetchText(mlUrl, 5000);
      if (rawMl) {
        const parsed = JSON.parse(rawMl) as {
          results?: Array<{
            title?: string;
            price?: number;
            original_price?: number | null;
            condition?: string;
            permalink?: string;
            official_store_name?: string | null;
            installments?: { quantity?: number; amount?: number; rate?: number };
            seller?: { nickname?: string };
          }>;
        };
        for (const item of parsed.results ?? []) {
          if (item.title && item.price) {
            const instQty = item.installments?.quantity ?? 10;
            const instTotal =
              item.installments?.amount && instQty
                ? Math.round(item.installments.amount * instQty * 100) / 100
                : item.price;
            snippets.push(
              `[Mercado Livre API] Título: ${item.title} | Preço à vista: R$ ${item.price.toFixed(2)} | Parcelado: ${instQty}x (Total R$ ${instTotal.toFixed(2)}, taxa ${item.installments?.rate ?? 0}%) | Condição: ${item.condition} | Loja Oficial: ${item.official_store_name ?? item.seller?.nickname ?? "3P"} | URL: ${item.permalink}`
            );
          }
        }
      }
    } catch {
      // ignora falha pontual da API pública
    }
  }

  // 2. Busca web HTML em tempo real (DuckDuckGo HTML Brasil)
  await Promise.all(
    queries.slice(0, 2).map(async (q) => {
      const ddgUrl = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(q)}&kl=br-pt`;
      const html = await safeFetchText(ddgUrl, 6000);
      if (!html) return;
      const cleaned = html
        .replace(/<script[\s\S]*?<\/script>/gi, " ")
        .replace(/<style[\s\S]*?<\/style>/gi, " ")
        .replace(/<[^>]+>/g, " ")
        .replace(/\s+/g, " ")
        .trim();
      if (cleaned.length > 100) {
        snippets.push(`[Busca Web "${q}"]: ${cleaned.slice(0, 6500)}`);
      }
    })
  );

  // 3. URLs diretas coladas pelo usuário (extrai JSON-LD Schema.org Product/Offer + texto visível)
  await Promise.all(
    customUrls.slice(0, 4).map(async (url) => {
      const html = await safeFetchText(url, 6500);
      if (!html) return;
      const jsonLdMatches = [...html.matchAll(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)];
      const ldBlocks = jsonLdMatches.map((m) => m[1]?.trim()).filter(Boolean).join("\n");
      const textPreview = html
        .replace(/<script[\s\S]*?<\/script>/gi, " ")
        .replace(/<style[\s\S]*?<\/style>/gi, " ")
        .replace(/<[^>]+>/g, " ")
        .replace(/\s+/g, " ")
        .slice(0, 4500);
      snippets.push(`[URL Direta ${url}] JSON-LD: ${ldBlocks.slice(0, 4000)} | Texto: ${textPreview}`);
    })
  );

  return snippets;
}

/**
 * Camadas 1, 2, 3 e 4 Determinísticas para Produto:
 * Rejeita qualquer oferta que viole identidade, condição de novo, estoque, preço condicionado ou loja não-oficial.
 */
export function verifyProductOfferFourLayers(
  offer: VerifiedProductOffer,
  config: ProductTrackerConfig
): { passed: boolean; reason?: string } {
  const titleLower = offer.title.toLocaleLowerCase("pt-BR");
  const queryLower = (config.query || "").toLocaleLowerCase("pt-BR");
  const notesLower = (offer.notes || "").toLocaleLowerCase("pt-BR");

  // CAMADA 1: Identidade Exata & Piso Anti-Acessório
  const minSanity =
    config.minSanityPriceCents && config.minSanityPriceCents > 0
      ? config.minSanityPriceCents
      : queryLower.includes("playstation 5") || queryLower.includes("ps5")
        ? 260000
        : 5000;

  if (offer.cashPriceCents < minSanity) {
    return {
      passed: false,
      reason: `Camada 1 (Piso de Sanidade): R$ ${(offer.cashPriceCents / 100).toFixed(2)} está abaixo do piso mínimo do produto (R$ ${(minSanity / 100).toFixed(2)}) — provável acessório ou anúncio inválido.`,
    };
  }

  const isConsoleSearch =
    (queryLower.includes("playstation 5") || queryLower.includes("ps5") || queryLower.includes("xbox")) &&
    !queryLower.includes("controle") &&
    !queryLower.includes("jogo");

  const hasConsoleWord = titleLower.includes("console") || titleLower.includes("playstation 5") || titleLower.includes("ps5");

  if (isConsoleSearch) {
    for (const term of CONSOLE_ACCESSORY_EXCLUSIONS) {
      if (titleLower.includes(term)) {
        return {
          passed: false,
          reason: `Camada 1 (Anti-Acessório): título "${offer.title}" contém termo de acessório ("${term}").`,
        };
      }
    }
  }

  for (const term of config.mustExclude ?? []) {
    const t = term.trim().toLocaleLowerCase("pt-BR");
    if (!t) continue;
    // Um console novo que custa acima do piso (>= R$ 2.600) frequentemente traz "1 Controle DualSense" ou "+ 2 Jogos" na caixa
    if (hasConsoleWord && offer.cashPriceCents >= minSanity && (t.includes("controle") || t.includes("dualsense") || t.includes("jogo"))) {
      continue;
    }
    if (titleLower.includes(t)) {
      return {
        passed: false,
        reason: `Camada 1/2 (Filtro de Exclusão): título contém "${t}".`,
      };
    }
  }

  // CAMADA 2: Condição 100% Novo & Disponibilidade em Estoque
  if (!offer.isNew) {
    return { passed: false, reason: `Camada 2 (Condição): item não é 100% novo.` };
  }
  if (!offer.inStock) {
    return { passed: false, reason: `Camada 2 (Estoque): item indisponível ou sem estoque para entrega.` };
  }
  for (const forbidden of FORBIDDEN_CONDITION_TERMS) {
    if (titleLower.includes(forbidden) || notesLower.includes(forbidden)) {
      return {
        passed: false,
        reason: `Camada 2 (Item Não-Novo): detectado termo "${forbidden}" no anúncio.`,
      };
    }
  }

  // CAMADA 3: Preço À Vista Universal + Parcelado Universal NA MESMA LOJA (Sem Condição Oculta)
  if (!offer.isUnconditioned) {
    return {
      passed: false,
      reason: `Camada 3 (Preço Condicionado): preço exige cartão próprio da loja, clube pago ou cashback futuro.`,
    };
  }
  if (offer.cashPriceCents <= 0 || offer.installmentTotalCents <= 0) {
    return {
      passed: false,
      reason: `Camada 3 (Par À Vista + Parcelado): oferta não informou ambos os valores da mesma loja.`,
    };
  }
  if (offer.installmentTotalCents < offer.cashPriceCents) {
    // Corrige caso o parcelado venha menor que o à vista
    offer.installmentTotalCents = offer.cashPriceCents;
  }

  // CAMADA 3b: URL real de página de produto (proibido link sintético de página de busca)
  const urlLower = (offer.url || "").toLocaleLowerCase("pt-BR");
  if (
    !isSafePublicHttpsUrl(offer.url) ||
    urlLower.includes("google.com/search") ||
    urlLower.includes("/busca/") ||
    urlLower.includes("/s?k=")
  ) {
    return {
      passed: false,
      reason: `Camada 3 (URL inválida): link "${offer.url}" não aponta para uma página real de produto.`,
    };
  }

  // CAMADA 4: Loja / Vendedor Oficial 1P (ou especialista oficial de climatização para ar-condicionado)
  const isHvacSearch =
    queryLower.includes("ar condicionado") ||
    queryLower.includes("ar-condicionado") ||
    queryLower.includes("inverter") ||
    queryLower.includes("split") ||
    queryLower.includes("btus");
  const HVAC_SPECIALISTS = [
    "dufrio",
    "central ar",
    "centralar",
    "leveros",
    "frio peças",
    "frio pecas",
    "friopecas",
    "webcontinental",
    "a.dias",
    "adias",
    "str ar",
    "frigelar",
  ];
  const sellerStoreText = `${offer.store} ${offer.seller}`.toLocaleLowerCase("pt-BR");
  const isKnownHvacSpecialist = isHvacSearch && HVAC_SPECIALISTS.some((name) => sellerStoreText.includes(name));

  if (!offer.isOfficialSeller && !isKnownHvacSpecialist) {
    return {
      passed: false,
      reason: `Camada 4 (Vendedor): "${offer.seller}" não é loja oficial 1P homologada.`,
    };
  }

  return { passed: true };
}

const PRODUCT_VERIFICATION_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["verification_summary", "rejected_count", "rejected_reasons", "offers", "price_history"],
  properties: {
    verification_summary: { type: "string" },
    rejected_count: { type: "integer" },
    rejected_reasons: { type: "array", items: { type: "string" } },
    offers: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: [
          "store",
          "seller",
          "title",
          "sku_or_model",
          "cash_price_brl",
          "installment_total_brl",
          "installments",
          "url",
          "in_stock",
          "is_new",
          "is_unconditioned",
          "is_official_seller",
          "notes",
        ],
        properties: {
          store: { type: "string" },
          seller: { type: "string" },
          title: { type: "string" },
          sku_or_model: { type: ["string", "null"] },
          cash_price_brl: { type: "number" },
          installment_total_brl: { type: "number" },
          installments: { type: "integer" },
          url: { type: "string" },
          in_stock: { type: "boolean" },
          is_new: { type: "boolean" },
          is_unconditioned: { type: "boolean" },
          is_official_seller: { type: "boolean" },
          notes: { type: "string" },
        },
      },
    },
    price_history: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["date", "price_brl", "source"],
        properties: {
          date: { type: "string" },
          price_brl: { type: "number" },
          source: { type: "string" },
        },
      },
    },
  },
} as const;

const PRODUCT_HISTORY_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["points"],
  properties: {
    points: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["date", "price_brl", "source"],
        properties: {
          date: { type: "string" },
          price_brl: { type: "number" },
          source: { type: "string" },
        },
      },
    },
  },
} as const;

async function fetchProductPriceHistory18Months(
  query: string,
  minSanityPriceCents: number
): Promise<PriceHistoryPoint[]> {
  if (!isAiConfigured()) return [];
  const openai = getOpenAIClient();
  const model = await resolveModelFor("extraction");
  const now = new Date();
  const todayIso = now.toISOString().slice(0, 10);

  const twelveMonthsAgo = new Date(now);
  twelveMonthsAgo.setUTCDate(twelveMonthsAgo.getUTCDate() - 365);
  const twelveMonthsAgoIso = twelveMonthsAgo.toISOString().slice(0, 10);

  const thirteenMonthsAgo = new Date(now);
  thirteenMonthsAgo.setUTCDate(thirteenMonthsAgo.getUTCDate() - 395);
  const thirteenMonthsAgoIso = thirteenMonthsAgo.toISOString().slice(0, 10);

  const eighteenMonthsAgo = new Date(now);
  eighteenMonthsAgo.setUTCDate(eighteenMonthsAgo.getUTCDate() - 548);
  const eighteenMonthsAgoIso = eighteenMonthsAgo.toISOString().slice(0, 10);

  const byDate = new Map<string, PriceHistoryPoint>();

  const runHistoryQuery = async (fromIso: string, toIso: string, instructions: string, input: string) => {
    const t0 = Date.now();
    try {
      const response = await openai.responses.create({
        model,
        reasoning: { effort: "low" },
        tools: [
          {
            type: "web_search_preview",
            search_context_size: "high",
            user_location: {
              type: "approximate",
              country: "BR",
              region: "SP",
              city: "Araraquara",
            },
          },
        ],
        instructions,
        input,
        text: {
          format: {
            type: "json_schema",
            name: "product_price_history_18m",
            strict: true,
            schema: PRODUCT_HISTORY_SCHEMA,
          },
        },
      });

      const u = response.usage;
      await logAiUsage({
        task: "extraction",
        model,
        ok: true,
        inputTokens: u?.input_tokens,
        cachedTokens: u?.input_tokens_details?.cached_tokens,
        outputTokens: u?.output_tokens,
        durationMs: Date.now() - t0,
      });

      const raw = response.output_text;
      if (!raw) return;
      const parsed = JSON.parse(raw) as {
        points?: Array<{ date: string; price_brl: number; source: string }>;
      };
      for (const pt of parsed.points ?? []) {
        if (!pt?.date || !/^\d{4}-\d{2}-\d{2}$/.test(pt.date)) continue;
        if (pt.date < fromIso || pt.date > toIso) continue;
        const priceCents = Math.round(Number(pt.price_brl) * 100);
        if (!Number.isFinite(priceCents) || priceCents < minSanityPriceCents) continue;
        byDate.set(pt.date, {
          date: pt.date,
          priceCents,
          source: pt.source || "Histórico Web",
        });
      }
    } catch (err) {
      await logAiUsage({ task: "extraction", model, ok: false, durationMs: Date.now() - t0, error: String(err) });
      console.error("fetchProductPriceHistory18Months error:", err);
    }
  };

  await runHistoryQuery(
    eighteenMonthsAgoIso,
    todayIso,
    `Você é um pesquisador de histórico de preços no varejo brasileiro (Buscapé, Zoom, Keepa Brasil, Promobit, Pelando, Canaltech, TechTudo, TudoCelular).
Busque o histórico REAL de preços observados no Brasil para "${query}" ao longo dos ÚLTIMOS 18 MESES completos (de ${eighteenMonthsAgoIso} até ${todayIso}), cobrindo OBRIGATORIAMENTE os dois períodos:
- Período 1 (${eighteenMonthsAgoIso} até ${twelveMonthsAgoIso}): pelo menos 6 pontos mensais cobrindo todos os meses desse semestre mais antigo (incluindo Prime Day anterior, Dia das Mães, Dia dos Pais, Dia das Crianças).
- Período 2 (${twelveMonthsAgoIso} até ${todayIso}): pelo menos 12 pontos mensais + picos/mínimas sazonais (Black Friday anterior, Natal, Dia do Consumidor, Prime Day e Black Friday atual).
Use somente preços reais observados (nunca abaixo do piso R$ ${(minSanityPriceCents / 100).toFixed(2)}). Nunca invente dados.`,
    `Levante o histórico de preços dos últimos 18 meses (${eighteenMonthsAgoIso} a ${todayIso}) no Brasil para: "${query}", incluindo obrigatoriamente os meses de ${eighteenMonthsAgoIso} a ${twelveMonthsAgoIso}.`
  );

  // Backfill direcionado caso a primeira consulta não tenha alcançado o semestre 18m-12m
  const dates = Array.from(byDate.keys()).sort();
  const oldestDate = dates[0];
  if (!oldestDate || oldestDate > thirteenMonthsAgoIso) {
    await runHistoryQuery(
      eighteenMonthsAgoIso,
      twelveMonthsAgoIso,
      `Você é um pesquisador de histórico de preços no varejo brasileiro (Buscapé, Zoom, Keepa Brasil, Promobit, Pelando, TechTudo, Canaltech).
Pesquise EXCLUSIVAMENTE o período histórico mais antigo de ${eighteenMonthsAgoIso} até ${twelveMonthsAgoIso} para "${query}" no Brasil.
Retorne de 6 a 10 pontos mensais reais (incluindo Prime Day, Dia dos Pais, Dia das Crianças e promoções daquele semestre). Nunca abaixo de R$ ${(minSanityPriceCents / 100).toFixed(2)}.`,
      `Histórico de preços no Brasil para "${query}" especificamente entre ${eighteenMonthsAgoIso} e ${twelveMonthsAgoIso}.`
    );
  }

  return Array.from(byDate.values()).sort((a, b) => a.date.localeCompare(b.date));
}

/**
 * Executa o rastreamento de um Produto (ex.: PlayStation 5) aplicando o Pipeline Anti-Falso-Positivo de 4 Camadas.
 * Retorna o menor preço à vista e o menor preço parcelado DA MESMA LOJA vencedora, além de todas as lojas aprovadas.
 */
export async function trackProductPrices(
  description: string,
  rawConfig?: Partial<ProductTrackerConfig> | null
): Promise<BestOfferMeta | null> {
  const query = (rawConfig?.query || description || "PlayStation 5").trim();
  const config: ProductTrackerConfig = {
    query,
    mustInclude: rawConfig?.mustInclude ?? [],
    mustExclude: rawConfig?.mustExclude ?? FORBIDDEN_CONDITION_TERMS,
    minSanityPriceCents:
      rawConfig?.minSanityPriceCents ??
      (query.toLocaleLowerCase("pt-BR").includes("playstation 5") || query.toLocaleLowerCase("pt-BR").includes("ps5")
        ? 260000
        : 5000),
    targetCashCents: rawConfig?.targetCashCents ?? null,
    highFrequencyBlackFriday: rawConfig?.highFrequencyBlackFriday ?? true,
    customUrls: rawConfig?.customUrls ?? [],
  };

  const snippets =
    config.customUrls && config.customUrls.length > 0
      ? await collectRawWebSnippets([], config.customUrls)
      : [];

  let candidateOffers: VerifiedProductOffer[] = [];
  let historicalPrices: PriceHistoryPoint[] = [];
  let aiRejectedCount = 0;
  let aiRejectedReasons: string[] = [];
  let verificationSummary = "";

  const yearHistoryPromise = fetchProductPriceHistory18Months(
    query,
    config.minSanityPriceCents ?? 1000
  );

  if (isAiConfigured()) {
    const openai = getOpenAIClient();
    const model = await resolveModelFor("extraction");
    const t0 = Date.now();
    try {
      const response = await openai.responses.create({
        model,
        reasoning: { effort: "low" },
        tools: [
          {
            type: "web_search_preview",
            search_context_size: "high",
            user_location: {
              type: "approximate",
              country: "BR",
              region: "SP",
              city: "Araraquara",
            },
          },
        ],
        instructions: `Você é o Auditor de Preços Anti-Falso-Positivo de 4 Camadas do aplicativo MeuDinheiro (Brasil).
Use a busca web em tempo real para encontrar e validar ofertas REAIS e COMPRÁVEIS HOJE no mercado brasileiro para o produto solicitado, aplicando 4 camadas rigorosas:
1. CAMADA 1 (Identidade Exata & Variantes Aceitas):
   - Tem que ser o produto principal ("${query}"). NUNCA inclua acessórios, controles avulsos, jogos, capas, suportes ou peças.
   - IMPORTANTE SOBRE VARIANTES: Se o usuário buscou apenas "${query}" sem exigir explicitamente "1TB" ou "Com Leitor", NÃO rejeite versões de 825GB ou Edição Digital! Pelo contrário: inclua tanto a Edição Digital (825GB ou 1TB, ex.: Sony PlayStation 5 Edição Digital 825GB na KaBuM! e Amazon.com.br) quanto a versão Com Leitor, pois o objetivo é encontrar o MENOR preço real disponível hoje para o console novo!
2. CAMADA 2 (100% Novo e Em Estoque): Rejeite imediatamente usados, seminovos, reembalados, open box, vitrine, outlet ou páginas esgotadas/indisponíveis.
3. CAMADA 3 (Mesma Loja — Preço À Vista Universal + Preço Parcelado Universal Sem Condição + URL Real):
   - Para CADA loja aprovada, informe a URL EXATA da página do produto (nunca URL de busca genérica), o menor valor à vista universal (PIX ou NuPay débito disponível para qualquer cliente) E o menor valor total parcelado no cartão de crédito comum (10x ou 12x sem juros, sem exigir cartão próprio da loja e sem abater cashback futuro).
   - NUNCA invente ou chute preços! Se não conseguir confirmar o preço real de hoje em uma página válida, NÃO inclua a oferta.
4. CAMADA 4 (Vendedor Oficial 1P ou Especialista Homologado):
   - Aprove ofertas vendidas pela própria loja (Amazon.com.br, KaBuM!, Magalu, Fast Shop, Carrefour, Mercado Livre Loja Oficial).
   - Para climatização / ar-condicionado, aprove também especialistas oficiais brasileiros (Dufrio, CentralAr, Leveros, Frio Peças, WebContinental, A.Dias, Frigelar, STR Ar).
   - Rejeite vendedores terceiros desconhecidos sem selo oficial.
- Retorne todas as ofertas aprovadas (entre 1 e 5 lojas) ordenadas do menor para o maior preço à vista.
5. HISTÓRICO DE PREÇOS REAL (Anti-Black-Fraude):
   - Também pesquise comparadores/rastreadores brasileiros (Buscapé, Zoom, Keepa, Promobit) para levantar preços históricos reais observados do produto entre os últimos 40 dias e 1 ano.
   - Retorne de 6 a 18 pontos cronológicos em "price_history" (date no formato "YYYY-MM-DD", price_brl em reais e source com o nome do comparador/loja). Use apenas preços realmente encontrados na web; NUNCA invente números — se não houver histórico confiável, retorne [].`,
        input: `Busque na web agora ofertas reais no Brasil para: "${query}"
Piso mínimo de sanidade: R$ ${(config.minSanityPriceCents! / 100).toFixed(2)}
Data da verificação: ${new Date().toISOString().slice(0, 10)} (Semana de Black Friday)
${snippets.length > 0 ? `\nDados adicionais coletados:\n${snippets.join("\n\n").slice(0, 8000)}` : ""}`,
        text: {
          format: {
            type: "json_schema",
            name: "product_price_audit",
            strict: true,
            schema: PRODUCT_VERIFICATION_SCHEMA,
          },
        },
      });

      const u = response.usage;
      await logAiUsage({
        task: "extraction",
        model,
        ok: true,
        inputTokens: u?.input_tokens,
        cachedTokens: u?.input_tokens_details?.cached_tokens,
        outputTokens: u?.output_tokens,
        durationMs: Date.now() - t0,
      });

      const raw = response.output_text;
      if (raw) {
        const parsed = JSON.parse(raw) as {
          verification_summary: string;
          rejected_count: number;
          rejected_reasons: string[];
          offers: Array<{
            store: string;
            seller: string;
            title: string;
            sku_or_model: string | null;
            cash_price_brl: number;
            installment_total_brl: number;
            installments: number;
            url: string;
            in_stock: boolean;
            is_new: boolean;
            is_unconditioned: boolean;
            is_official_seller: boolean;
            notes: string;
          }>;
          price_history?: Array<{
            date: string;
            price_brl: number;
            source: string;
          }>;
        };
        verificationSummary = parsed.verification_summary;
        aiRejectedCount = parsed.rejected_count ?? 0;
        aiRejectedReasons = parsed.rejected_reasons ?? [];
        candidateOffers = (parsed.offers ?? []).map((o) => ({
          store: o.store,
          seller: o.seller,
          title: o.title,
          skuOrModel: o.sku_or_model,
          cashPriceCents: Math.round(o.cash_price_brl * 100),
          installmentTotalCents: Math.round(Math.max(o.installment_total_brl, o.cash_price_brl) * 100),
          installments: Math.max(1, Math.min(24, o.installments || 10)),
          url: isSafePublicHttpsUrl(o.url) ? o.url : "",
          inStock: o.in_stock,
          isNew: o.is_new,
          isUnconditioned: o.is_unconditioned,
          isOfficialSeller: o.is_official_seller,
          notes: o.notes,
        }));

        const todayIso = new Date().toISOString().slice(0, 10);
        const minCents = config.minSanityPriceCents ?? 1000;
        const historyMap = new Map<string, PriceHistoryPoint>();
        for (const h of parsed.price_history ?? []) {
          if (!h?.date || !/^\d{4}-\d{2}-\d{2}$/.test(h.date) || h.date > todayIso) continue;
          const priceCents = Math.round(Number(h.price_brl) * 100);
          if (!Number.isFinite(priceCents) || priceCents < minCents) continue;
          historyMap.set(h.date, {
            date: h.date,
            priceCents,
            source: h.source || "Comparador",
          });
        }
        historicalPrices = Array.from(historyMap.values()).sort((a, b) => a.date.localeCompare(b.date));
      }
    } catch (err) {
      await logAiUsage({ task: "extraction", model, ok: false, durationMs: Date.now() - t0, error: String(err) });
      console.error("trackProductPrices AI error:", err);
    }
  }

  const yearHistory = await yearHistoryPromise;
  if (yearHistory.length > 0) {
    const mergedHistory = new Map<string, PriceHistoryPoint>();
    for (const pt of yearHistory) mergedHistory.set(pt.date, pt);
    for (const pt of historicalPrices) mergedHistory.set(pt.date, pt);
    historicalPrices = Array.from(mergedHistory.values()).sort((a, b) => a.date.localeCompare(b.date));
  }

  // Passa cada oferta pelo filtro determinístico das 4 camadas
  const approvedOffers: VerifiedProductOffer[] = [];
  const rejectedReasons = [...aiRejectedReasons];
  let rejectedCount = aiRejectedCount;

  for (const offer of candidateOffers) {
    const check = verifyProductOfferFourLayers(offer, config);
    if (check.passed) {
      approvedOffers.push(offer);
    } else {
      rejectedCount++;
      if (check.reason) rejectedReasons.push(`${offer.store}: ${check.reason}`);
    }
  }

  // NUNCA fabricar preços sintéticos quando nenhuma oferta real passar pelas 4 camadas
  if (approvedOffers.length === 0) {
    return null;
  }

  // Ordena pelo menor preço à vista validado (critério de desempate: menor parcelado na mesma loja)
  approvedOffers.sort((a, b) => a.cashPriceCents - b.cashPriceCents || a.installmentTotalCents - b.installmentTotalCents);
  const winner = approvedOffers[0];

  return {
    category: "product",
    checkedAt: new Date().toISOString(),
    sourceMode: snippets.length > 0 ? "live_verified" : "ai_web_verified",
    storeOrProvider: winner.store,
    cashPriceCents: winner.cashPriceCents,
    installmentTotalCents: winner.installmentTotalCents,
    installments: winner.installments,
    offerUrl: winner.url,
    verificationSummary:
      verificationSummary ||
      `Validado nas 4 camadas: item 100% novo, em estoque, vendido por ${winner.seller}. Na mesma loja (${winner.store}), menor valor à vista R$ ${(winner.cashPriceCents / 100).toFixed(2)} e parcelado em ${winner.installments}x totalizando R$ ${(winner.installmentTotalCents / 100).toFixed(2)}.`,
    rejectedCount,
    rejectedReasons: rejectedReasons.slice(0, 6),
    productOffers: approvedOffers,
    ...(historicalPrices.length > 0 ? { historicalPrices } : {}),
  };
}

/**
 * Audita um print/screenshot de oferta (ex.: app da Amazon no celular com desconto Pix/NuPay logado)
 * aplicando exatamente o mesmo Pipeline Anti-Falso-Positivo de 4 Camadas.
 */
export async function auditOfferFromScreenshot(
  description: string,
  imageDataUrl: string,
  existingMeta?: BestOfferMeta | null,
  rawConfig?: Partial<ProductTrackerConfig> | null
): Promise<{ ok: true; meta: BestOfferMeta; extractedOffer: VerifiedProductOffer } | { ok: false; error: string }> {
  if (!isAiConfigured()) {
    return { ok: false, error: "OPENAI_API_KEY não configurada para leitura de imagem." };
  }
  const openai = getOpenAIClient();
  const model = await resolveModelFor("vision");
  const query = (rawConfig?.query || description || "PlayStation 5").trim();
  const config: ProductTrackerConfig = {
    query,
    mustInclude: rawConfig?.mustInclude ?? [],
    mustExclude: rawConfig?.mustExclude ?? FORBIDDEN_CONDITION_TERMS,
    minSanityPriceCents:
      rawConfig?.minSanityPriceCents ??
      (query.toLocaleLowerCase("pt-BR").includes("playstation 5") || query.toLocaleLowerCase("pt-BR").includes("ps5")
        ? 260000
        : 5000),
  };

  const t0 = Date.now();
  try {
    const response = await openai.chat.completions.create({
      model,
      messages: [
        {
          role: "system",
          content: `Você é o Auditor Visual de 4 Camadas Anti-Falso-Positivo do MeuDinheiro.
Analise o print da tela do aplicativo/loja enviado pelo usuário para o produto "${query}":
1. Extraia a loja (ex.: Amazon.com.br, KaBuM!, Magalu, Mercado Livre), o vendedor/selo (ex.: "Escolha da Amazon / Loja Sony"), o título exato do produto, o preço à vista (ex.: "R$ 4.047,00 — 5% off à vista no Pix e NuPay") e o valor total parcelado sem juros na mesma tela (ex.: "em até 12x de R$ 355,00 sem juros" -> 12 * 355 = R$ 4.260,00).
2. Verifique nas 4 camadas:
   - Camada 1: É realmente o produto principal "${query}" (e não apenas um controle ou acessório avulso)?
   - Camada 2: É um item NOVO e disponível para compra?
   - Camada 3: O preço à vista (Pix/NuPay/boleto) e o parcelado (cartão comum) são universais da loja?
   - Camada 4: É uma loja oficial confiável?
3. Gere a URL direta da loja para o produto identificado (ex.: https://www.amazon.com.br/Sony-PlayStation-Edi%C3%A7%C3%A3o-Digital-Controle/dp/B0GWNKJDCZ ou link de busca da loja).`,
        },
        {
          role: "user",
          content: [
            { type: "text", text: `Extraia e audite nas 4 camadas a oferta deste print para "${query}":` },
            { type: "image_url", image_url: { url: imageDataUrl } },
          ],
        },
      ],
      response_format: {
        type: "json_schema",
        json_schema: { name: "product_price_audit", strict: true, schema: PRODUCT_VERIFICATION_SCHEMA },
      },
    });

    const u = response.usage;
    await logAiUsage({
      task: "vision",
      model,
      ok: true,
      inputTokens: u?.prompt_tokens,
      cachedTokens: u?.prompt_tokens_details?.cached_tokens,
      outputTokens: u?.completion_tokens,
      durationMs: Date.now() - t0,
    });

    const raw = response.choices[0]?.message?.content;
    if (!raw) return { ok: false, error: "Não foi possível ler os dados do print." };

    const parsed = JSON.parse(raw) as {
      verification_summary: string;
      rejected_count: number;
      rejected_reasons: string[];
      offers: Array<{
        store: string;
        seller: string;
        title: string;
        sku_or_model: string | null;
        cash_price_brl: number;
        installment_total_brl: number;
        installments: number;
        url: string;
        in_stock: boolean;
        is_new: boolean;
        is_unconditioned: boolean;
        is_official_seller: boolean;
        notes: string;
      }>;
    };

    const rawOffer = parsed.offers?.[0];
    if (!rawOffer) {
      return {
        ok: false,
        error: parsed.rejected_reasons?.[0] || parsed.verification_summary || "A oferta do print foi reprovada pelo filtro anti-falso-positivo.",
      };
    }

    const offer: VerifiedProductOffer = {
      store: rawOffer.store,
      seller: rawOffer.seller,
      title: rawOffer.title,
      skuOrModel: rawOffer.sku_or_model,
      cashPriceCents: Math.round(rawOffer.cash_price_brl * 100),
      installmentTotalCents: Math.round(Math.max(rawOffer.installment_total_brl, rawOffer.cash_price_brl) * 100),
      installments: Math.max(1, Math.min(24, rawOffer.installments || 12)),
      url: isSafePublicHttpsUrl(rawOffer.url)
        ? rawOffer.url
        : `https://www.amazon.com.br/s?k=${encodeURIComponent(rawOffer.title)}`,
      inStock: rawOffer.in_stock,
      isNew: rawOffer.is_new,
      isUnconditioned: rawOffer.is_unconditioned,
      isOfficialSeller: rawOffer.is_official_seller,
      notes: rawOffer.notes,
    };

    const check = verifyProductOfferFourLayers(offer, config);
    if (!check.passed) {
      return { ok: false, error: check.reason || "Oferta reprovada nas 4 camadas." };
    }

    const prevOffers = (existingMeta?.productOffers ?? []).filter((o) => o.store !== offer.store);
    const mergedOffers = [offer, ...prevOffers].sort(
      (a, b) => a.cashPriceCents - b.cashPriceCents || a.installmentTotalCents - b.installmentTotalCents
    );
    const winner = mergedOffers[0];

    const meta: BestOfferMeta = {
      category: "product",
      checkedAt: new Date().toISOString(),
      sourceMode: "live_verified",
      storeOrProvider: winner.store,
      cashPriceCents: winner.cashPriceCents,
      installmentTotalCents: winner.installmentTotalCents,
      installments: winner.installments,
      offerUrl: winner.url,
      verificationSummary: parsed.verification_summary,
      rejectedCount: existingMeta?.rejectedCount ?? parsed.rejected_count ?? 0,
      rejectedReasons: existingMeta?.rejectedReasons ?? parsed.rejected_reasons ?? [],
      productOffers: mergedOffers,
    };

    return { ok: true, meta, extractedOffer: offer };
  } catch (err) {
    await logAiUsage({ task: "vision", model, ok: false, durationMs: Date.now() - t0, error: String(err) });
    return { ok: false, error: "Erro ao processar o print da oferta." };
  }
}

const TRAVEL_VERIFICATION_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["verification_summary", "rejected_count", "rejected_reasons", "flight_quotes", "stay_quote"],
  properties: {
    verification_summary: { type: "string" },
    rejected_count: { type: "integer" },
    rejected_reasons: { type: "array", items: { type: "string" } },
    flight_quotes: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: [
          "origin_airport",
          "destination_airport",
          "airline",
          "stops_count",
          "duration_summary",
          "outbound_departure_time",
          "outbound_arrival_time",
          "return_departure_time",
          "return_arrival_time",
          "cash_total_brl",
          "installment_total_brl",
          "installments",
          "notes",
        ],
        properties: {
          origin_airport: { type: "string" },
          destination_airport: { type: "string" },
          airline: { type: "string" },
          stops_count: { type: "integer" },
          duration_summary: { type: "string" },
          outbound_departure_time: { type: "string" },
          outbound_arrival_time: { type: "string" },
          return_departure_time: { type: "string" },
          return_arrival_time: { type: "string" },
          cash_total_brl: { type: "number" },
          installment_total_brl: { type: "number" },
          installments: { type: "integer" },
          notes: { type: "string" },
        },
      },
    },
    stay_quote: {
      type: "object",
      additionalProperties: false,
      required: [
        "accommodation_name",
        "provider",
        "room_type",
        "board_basis",
        "nights",
        "cash_total_brl",
        "installment_total_brl",
        "installments",
        "is_black_friday_promo",
        "notes",
      ],
      properties: {
        accommodation_name: { type: "string" },
        provider: { type: "string" },
        room_type: { type: "string" },
        board_basis: { type: "string" },
        nights: { type: "integer" },
        cash_total_brl: { type: "number" },
        installment_total_brl: { type: "number" },
        installments: { type: "integer" },
        is_black_friday_promo: { type: "boolean" },
        notes: { type: "string" },
      },
    },
  },
} as const;

export function calculateNights(outboundDate: string, returnDate: string): number {
  const out = new Date(`${outboundDate}T12:00:00Z`).getTime();
  const ret = new Date(`${returnDate}T12:00:00Z`).getTime();
  if (Number.isNaN(out) || Number.isNaN(ret) || ret <= out) return 5;
  return Math.max(1, Math.min(30, Math.round((ret - out) / 86400000)));
}

function buildGoogleFlightsUrl(origin: string, dest: string, outboundDate: string, returnDate: string): string {
  const q = `Flights to ${dest} from ${origin} on ${outboundDate} through ${returnDate}`;
  return `https://www.google.com/travel/flights?hl=pt-BR&curr=BRL&q=${encodeURIComponent(q)}`;
}

function buildAccommodationUrl(
  accommodationName: string,
  destLabel: string,
  outboundDate: string,
  returnDate: string,
  adults: number,
  children = 0
): string {
  const lower = accommodationName.toLocaleLowerCase("pt-BR");
  if (lower.includes("japaratinga")) {
    return `https://www.japaratingaresort.com.br/`;
  }
  if (lower.includes("salinas") && lower.includes("maragogi")) {
    return `https://www.salinas.com.br/pt/maragogi/`;
  }
  if (lower.includes("salinas") && lower.includes("macei")) {
    return `https://www.salinas.com.br/pt/maceio/`;
  }
  if (lower.includes("la torre")) {
    return `https://www.resortlatorre.com.br/`;
  }
  return `https://www.booking.com/searchresults.pt-br.html?ss=${encodeURIComponent(`${accommodationName} ${destLabel}`)}&checkin=${outboundDate}&checkout=${returnDate}&group_adults=${adults}&group_children=${children}&no_rooms=1`;
}

const TRAVEL_WINDOW_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["best_lead_months_min", "best_lead_months_max", "best_window_label", "recommendation"],
  properties: {
    best_lead_months_min: { type: "number" },
    best_lead_months_max: { type: "number" },
    best_window_label: { type: "string" },
    recommendation: { type: "string" },
  },
} as const;

const TRAVEL_HISTORY_POINT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["date", "price_brl", "source", "lead_months_before_trip", "target_trip_month", "event_label"],
  properties: {
    date: { type: "string" },
    price_brl: { type: "number" },
    source: { type: "string" },
    lead_months_before_trip: { type: "number" },
    target_trip_month: { type: "string" },
    event_label: { type: "string" },
  },
} as const;

const TRAVEL_HISTORY_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["stay_points", "flight_points", "stay_best_window", "flight_best_window"],
  properties: {
    stay_points: {
      type: "array",
      items: TRAVEL_HISTORY_POINT_SCHEMA,
    },
    flight_points: {
      type: "array",
      items: TRAVEL_HISTORY_POINT_SCHEMA,
    },
    stay_best_window: TRAVEL_WINDOW_SCHEMA,
    flight_best_window: TRAVEL_WINDOW_SCHEMA,
  },
} as const;

interface TravelAiWindowMeta {
  bestLeadMonthsMin: number;
  bestLeadMonthsMax: number;
  bestWindowLabel: string;
  recommendation: string;
}

async function fetchTravelLeadTimeHistory(params: {
  accommodationName: string;
  destinationAirport: string;
  destinationLabel: string;
  originAirports: string[];
  nights: number;
  travelersLabel: string;
  outboundDate: string;
  returnDate: string;
  plannedPurchaseDate: string;
}): Promise<{
  stayPoints: PriceHistoryPoint[];
  flightPoints: PriceHistoryPoint[];
  stayBestWindow: TravelAiWindowMeta | null;
  flightBestWindow: TravelAiWindowMeta | null;
}> {
  if (!isAiConfigured()) {
    return { stayPoints: [], flightPoints: [], stayBestWindow: null, flightBestWindow: null };
  }
  const openai = getOpenAIClient();
  const model = await resolveModelFor("extraction");
  const t0 = Date.now();
  const now = new Date();
  const todayIso = now.toISOString().slice(0, 10);
  const eighteenMonthsAgo = new Date(now);
  eighteenMonthsAgo.setUTCDate(eighteenMonthsAgo.getUTCDate() - 548);
  const eighteenMonthsAgoIso = eighteenMonthsAgo.toISOString().slice(0, 10);

  const targetMonth = params.outboundDate.slice(5, 7);
  const targetYear = Number(params.outboundDate.slice(0, 4));
  const priorCycleTargetYm = `${targetYear - 1}-${targetMonth}`;
  const currentCycleTargetYm = `${targetYear}-${targetMonth}`;

  try {
    const response = await openai.responses.create({
      model,
      reasoning: { effort: "low" },
      tools: [
        {
          type: "web_search_preview",
          search_context_size: "high",
          user_location: {
            type: "approximate",
            country: "BR",
            region: "SP",
            city: "Araraquara",
          },
        },
      ],
      instructions: `Você é um analista especialista em precificação sazonal e antecedência de compra no turismo brasileiro (Melhores Destinos, Google Flights, Kayak, Booking, Zarpo, Passagens Imperdíveis e sites oficiais dos resorts).
O usuário planeja comprar em ${params.plannedPurchaseDate} para viajar de ${params.outboundDate} a ${params.returnDate} (${params.nights} noites, ${params.travelersLabel}) — hospedagem "${params.accommodationName}" e voos ${params.originAirports.join("/")}->${params.destinationAirport} (${params.destinationLabel}).
Você DEVE responder à pergunta de antecedência ("delta compra -> viagem"):
Para quem viaja na mesma temporada-alvo (mês ${targetMonth}, ex.: ${priorCycleTargetYm} e abertura de ${currentCycleTargetYm}), como evoluiu o preço conforme o mês da compra / antecedência?
- Ciclo anterior (para viajar em ${priorCycleTargetYm}): inclua pontos mensais desde ~11 meses antes (ex.: Out/Nov Black Friday do ano passado, Dez, Jan, Fev, Mar, Abr, Mai, Jun, Jul, Ago até 1 mês antes do embarque).
- Ciclo atual (para viajar em ${currentCycleTargetYm}): inclua pontos da abertura recente (ex.: Outubro e Novembro atuais / Black Friday atual).
Retorne de 10 a 14 pontos em stay_points e de 10 a 14 pontos em flight_points com:
- date: YYYY-MM-DD (data da compra/observação dentro de ${eighteenMonthsAgoIso} a ${todayIso})
- price_brl: valor total realista em reais para ${params.nights} noites / ${params.travelersLabel} (baseado em tarifas e promoções reais publicadas)
- source: fonte consultada (ex.: "Site Oficial", "Zarpo", "Melhores Destinos", "Google Flights", "Kayak")
- lead_months_before_trip: número inteiro de meses entre a data da compra e o embarque daquele ciclo (0 a 12)
- target_trip_month: "${priorCycleTargetYm}" ou "${currentCycleTargetYm}"
- event_label: rótulo curto da janela (ex.: "Black Friday 25 · 10m antes", "Compra 6m antes", "Abertura Black Friday 26")
E preencha stay_best_window e flight_best_window indicando se a antecedência influencia o preço, quantos meses antes garantem a melhor tarifa (best_lead_months_min, best_lead_months_max, best_window_label) e uma recomendação direta em português.`,
      input: `Levantamento por antecedência de compra (Black Friday anterior até abertura atual) para viajar no mês ${targetMonth}: hospedagem "${params.accommodationName}" (${params.nights} noites) e voos ${params.originAirports.join("/")}->${params.destinationAirport} (${params.travelersLabel}). Compra planejada: ${params.plannedPurchaseDate}, viagem: ${params.outboundDate} a ${params.returnDate}.`,
      text: {
        format: {
          type: "json_schema",
          name: "travel_lead_time_history_18m",
          strict: true,
          schema: TRAVEL_HISTORY_SCHEMA,
        },
      },
    });

    const u = response.usage;
    await logAiUsage({
      task: "extraction",
      model,
      ok: true,
      inputTokens: u?.input_tokens,
      cachedTokens: u?.input_tokens_details?.cached_tokens,
      outputTokens: u?.output_tokens,
      durationMs: Date.now() - t0,
    });

    const raw = response.output_text;
    if (!raw) {
      return { stayPoints: [], flightPoints: [], stayBestWindow: null, flightBestWindow: null };
    }
    const parsed = JSON.parse(raw) as {
      stay_points?: Array<{
        date: string;
        price_brl: number;
        source: string;
        lead_months_before_trip: number;
        target_trip_month: string;
        event_label: string;
      }>;
      flight_points?: Array<{
        date: string;
        price_brl: number;
        source: string;
        lead_months_before_trip: number;
        target_trip_month: string;
        event_label: string;
      }>;
      stay_best_window?: {
        best_lead_months_min: number;
        best_lead_months_max: number;
        best_window_label: string;
        recommendation: string;
      };
      flight_best_window?: {
        best_lead_months_min: number;
        best_lead_months_max: number;
        best_window_label: string;
        recommendation: string;
      };
    };

    const sanitize = (
      items:
        | Array<{
            date: string;
            price_brl: number;
            source: string;
            lead_months_before_trip: number;
            target_trip_month: string;
            event_label: string;
          }>
        | undefined,
      minCents: number
    ) => {
      const byDate = new Map<string, PriceHistoryPoint>();
      for (const pt of items ?? []) {
        if (!pt?.date || !/^\d{4}-\d{2}-\d{2}$/.test(pt.date)) continue;
        if (pt.date < eighteenMonthsAgoIso || pt.date > todayIso) continue;
        const priceCents = Math.round(Number(pt.price_brl) * 100);
        if (!Number.isFinite(priceCents) || priceCents < minCents) continue;
        byDate.set(pt.date, {
          date: pt.date,
          priceCents,
          source: pt.source || "Histórico Web",
          ...(Number.isFinite(pt.lead_months_before_trip)
            ? { leadMonthsBeforeTrip: Math.max(0, Math.round(pt.lead_months_before_trip)) }
            : {}),
          ...(pt.target_trip_month ? { targetTripMonth: pt.target_trip_month } : {}),
          ...(pt.event_label ? { eventLabel: pt.event_label } : {}),
        });
      }
      return Array.from(byDate.values()).sort((a, b) => a.date.localeCompare(b.date));
    };

    const mapWindow = (w?: {
      best_lead_months_min: number;
      best_lead_months_max: number;
      best_window_label: string;
      recommendation: string;
    }): TravelAiWindowMeta | null =>
      w
        ? {
            bestLeadMonthsMin: Math.max(0, Math.round(w.best_lead_months_min)),
            bestLeadMonthsMax: Math.max(0, Math.round(w.best_lead_months_max)),
            bestWindowLabel: w.best_window_label,
            recommendation: w.recommendation,
          }
        : null;

    return {
      stayPoints: sanitize(parsed.stay_points, 50000),
      flightPoints: sanitize(parsed.flight_points, 30000),
      stayBestWindow: mapWindow(parsed.stay_best_window),
      flightBestWindow: mapWindow(parsed.flight_best_window),
    };
  } catch (err) {
    await logAiUsage({ task: "extraction", model, ok: false, durationMs: Date.now() - t0, error: String(err) });
    console.error("fetchTravelLeadTimeHistory error:", err);
    return { stayPoints: [], flightPoints: [], stayBestWindow: null, flightBestWindow: null };
  }
}

/**
 * Executa o rastreamento completo de uma Viagem (Passagens Aéreas Multi-Origem RAO/VCP -> Destino + Estadia/Resort)
 * para as datas exatas informadas (outboundDate -> returnDate), aplicando validação de 4 camadas.
 */
export async function trackTravelPrices(
  description: string,
  startDate: string,
  rawConfig?: Partial<TravelTrackerConfig> | null,
  existingMeta?: BestOfferMeta | null
): Promise<BestOfferMeta | null> {
  const destCode = (rawConfig?.destinationAirport || "MCZ").toUpperCase().trim();
  const destMeta = DESTINATION_AIRPORTS.find((d) => d.code === destCode);
  const destLabel = rawConfig?.destinationLabel || destMeta?.label || `${destCode}`;
  const originAirports =
    rawConfig?.originAirports && rawConfig.originAirports.length > 0 ? rawConfig.originAirports : ["RAO", "VCP"];
  const accommodationName = (rawConfig?.accommodationName || description || "Japaratinga Lounge Resort").trim();
  const outboundDate = rawConfig?.outboundDate || startDate || new Date().toISOString().slice(0, 10);
  const defaultRet = new Date(new Date(`${outboundDate}T12:00:00Z`).getTime() + 5 * 86400000).toISOString().slice(0, 10);
  const returnDate = rawConfig?.returnDate && rawConfig.returnDate > outboundDate ? rawConfig.returnDate : defaultRet;
  const sameDatesForFlight = rawConfig?.sameDatesForFlight !== false;
  const flightOutboundDate =
    !sameDatesForFlight && rawConfig?.flightOutboundDate ? rawConfig.flightOutboundDate : outboundDate;
  const flightReturnDate =
    !sameDatesForFlight && rawConfig?.flightReturnDate && rawConfig.flightReturnDate > flightOutboundDate
      ? rawConfig.flightReturnDate
      : returnDate;
  const includeStay = rawConfig?.includeStay !== false;
  const includeFlight = rawConfig?.includeFlight !== false;
  const nights = calculateNights(outboundDate, returnDate);
  const adults = Math.max(1, rawConfig?.adults ?? 2);
  const children = Math.max(0, rawConfig?.children ?? 0);
  const pets = Math.max(0, rawConfig?.pets ?? 0);
  const travelersLabel = formatTravelersSummary(adults, children, pets);
  const allowStops = rawConfig?.allowStops ?? true;

  const customUrls = rawConfig?.customUrls ?? [];
  const snippets = customUrls.length > 0 ? await collectRawWebSnippets([], customUrls) : [];

  let flightQuotes: VerifiedFlightQuote[] = [];
  let stayQuote: VerifiedStayQuote | null = null;
  let verificationSummary = "";
  let rejectedCount = 0;
  let rejectedReasons: string[] = [];

  const travelHistoryPromise = fetchTravelLeadTimeHistory({
    accommodationName,
    destinationAirport: destCode,
    destinationLabel: destLabel,
    originAirports,
    nights,
    travelersLabel,
    outboundDate,
    returnDate,
    plannedPurchaseDate: startDate || new Date().toISOString().slice(0, 10),
  });

  const todayIso = new Date().toISOString().slice(0, 10);

  if (isAiConfigured()) {
    const openai = getOpenAIClient();
    const model = await resolveModelFor("extraction");
    const t0 = Date.now();
    try {
      const response = await openai.responses.create({
        model,
        reasoning: { effort: "low" },
        tools: [
          {
            type: "web_search_preview",
            search_context_size: "high",
            user_location: {
              type: "approximate",
              country: "BR",
              region: "SP",
              city: "Araraquara",
            },
          },
        ],
        instructions: `Você é o Motor de Cotação e Auditoria de Viagens (Voos Multi-Origem + Resorts/Hotéis por Data) do MeuDinheiro.
Data de referência de HOJE: ${todayIso}. Use a busca web em tempo real para pesquisar as tarifas ATIVAS HOJE (incluindo campanhas de Black Friday, Blue Week, cupons oficiais e tarifas promocionais vigentes hoje) dos componentes independentes da viagem:
1) PASSAGENS AÉREAS (Ida em ${flightOutboundDate} e Volta em ${flightReturnDate}, para ${travelersLabel}, taxas incluídas):
   - Compare os aeroportos de origem solicitados (${originAirports.join(", ")}) rumo ao aeroporto ${destCode} (${destLabel}).
   - Ribeirão Preto (RAO) normalmente opera com 1 escala rápida (via VCP, CGH ou CNF pela Azul/Latam/Gol).
   - Campinas / Viracopos (VCP) é hub da Azul e opera voos diretos ou com 1 conexão curta para o Nordeste/Sul.
   - Informe horários típicos reais (outbound_departure_time, outbound_arrival_time, return_departure_time, return_arrival_time em HH:MM) e o preço total de IDA E VOLTA em BRL somando todos os viajantes (${travelersLabel}, incluindo taxa de pet na cabine se houver pet) — sempre > 0.
2) HOSPEDAGEM / RESORT ("${accommodationName}" para ${nights} noites, Check-in ${outboundDate} e Check-out ${returnDate}, para ${travelersLabel}):
   - PESQUISE EXPLICITAMENTE promoções de Black Friday / Blue Week ATIVAS HOJE (${todayIso}) no site oficial e motor de reservas do resort (ex.: Omnibees, HSystem, resortlatorre.com.br, salinas.com.br, japaratingaresort.com.br, Zarpo, Booking, Melhores Destinos).
   - Priorize a tarifa promocional real vigente HOJE com desconto à vista/PIX ou Black Friday sobre tarifas cheias antigas, calculando o total das ${nights} diárias para ${travelersLabel} (incluindo taxa pet se houver pet; sempre > 0).
   - Informe o menor valor total à vista (PIX/transferência no site oficial) e o menor valor total parcelado (em até 10x ou 12x no cartão comum sem exigir clube de férias/timeshare), marcando is_black_friday_promo=true se houver campanha ativa.`,
        input: `Busque na web agora (data ${todayIso}) cotações e promoções ativas de Black Friday para esta viagem:
Destino / Aeroporto: ${destCode} (${destLabel})
Estadia / Resort: "${accommodationName}" (Check-in ${outboundDate} · Check-out ${returnDate}, ${nights} noites)
Passagens Aéreas: Ida ${flightOutboundDate} · Volta ${flightReturnDate}
Viajantes: ${travelersLabel}
Aeroportos de saída monitorados: ${originAirports.join(", ")} (Aceita escala: ${allowStops ? "Sim" : "Somente voo direto"})`,
        text: {
          format: {
            type: "json_schema",
            name: "travel_price_audit",
            strict: true,
            schema: TRAVEL_VERIFICATION_SCHEMA,
          },
        },
      });

      const u = response.usage;
      await logAiUsage({
        task: "extraction",
        model,
        ok: true,
        inputTokens: u?.input_tokens,
        cachedTokens: u?.input_tokens_details?.cached_tokens,
        outputTokens: u?.output_tokens,
        durationMs: Date.now() - t0,
      });

      const raw = response.output_text;
      if (raw) {
        const parsed = JSON.parse(raw) as {
          verification_summary: string;
          rejected_count: number;
          rejected_reasons: string[];
          flight_quotes: Array<{
            origin_airport: string;
            destination_airport: string;
            airline: string;
            stops_count: number;
            duration_summary: string;
            outbound_departure_time: string;
            outbound_arrival_time: string;
            return_departure_time: string;
            return_arrival_time: string;
            cash_total_brl: number;
            installment_total_brl: number;
            installments: number;
            notes: string;
          }>;
          stay_quote: {
            accommodation_name: string;
            provider: string;
            room_type: string;
            board_basis: string;
            nights: number;
            cash_total_brl: number;
            installment_total_brl: number;
            installments: number;
            is_black_friday_promo: boolean;
            notes: string;
          };
        };

        verificationSummary = parsed.verification_summary;
        rejectedCount = parsed.rejected_count ?? 0;
        rejectedReasons = parsed.rejected_reasons ?? [];

        flightQuotes = (parsed.flight_quotes ?? [])
          .filter((fq) => fq.cash_total_brl >= 400)
          .map((fq) => {
            const originCode = fq.origin_airport.toUpperCase().trim();
            const originMeta = ORIGIN_AIRPORTS.find((o) => o.code === originCode);
            const isRao = originCode === "RAO";
            return {
              originAirport: originCode,
              destinationAirport: destCode,
              airline: fq.airline,
              stopsCount: fq.stops_count,
              durationSummary: fq.duration_summary,
              outboundDate: flightOutboundDate,
              returnDate: flightReturnDate,
              outboundDepartureTime: fq.outbound_departure_time || (isRao ? "06:00" : "08:15"),
              outboundArrivalTime: fq.outbound_arrival_time || (isRao ? "10:50" : "11:25"),
              returnDepartureTime: fq.return_departure_time || (isRao ? "14:20" : "15:40"),
              returnArrivalTime: fq.return_arrival_time || (isRao ? "19:15" : "18:55"),
              cashTotalCents: Math.round(fq.cash_total_brl * 100),
              installmentTotalCents: Math.round(Math.max(fq.installment_total_brl, fq.cash_total_brl) * 100),
              installments: Math.max(1, Math.min(12, fq.installments || 6)),
              groundTransferCents: originMeta?.estimatedGroundCostCents ?? 20000,
              bookingUrl: buildGoogleFlightsUrl(originCode, destCode, flightOutboundDate, flightReturnDate),
              notes: fq.notes,
            };
          });

        if (parsed.stay_quote && parsed.stay_quote.cash_total_brl >= 500) {
          const sq = parsed.stay_quote;
          stayQuote = {
            accommodationName: sq.accommodation_name || accommodationName,
            provider: sq.provider || "Site Oficial / Reserva Direta",
            roomType: sq.room_type || "Standard / Smart",
            boardBasis: sq.board_basis || "All Inclusive",
            nights: sq.nights || nights,
            cashTotalCents: Math.round(sq.cash_total_brl * 100),
            installmentTotalCents: Math.round(Math.max(sq.installment_total_brl, sq.cash_total_brl) * 100),
            installments: Math.max(1, Math.min(12, sq.installments || 10)),
            bookingUrl: buildAccommodationUrl(accommodationName, destLabel, outboundDate, returnDate, adults, children),
            isBlackFridayPromo: sq.is_black_friday_promo,
            notes: sq.notes,
          };
        }
      }
    } catch (err) {
      await logAiUsage({ task: "extraction", model, ok: false, durationMs: Date.now() - t0, error: String(err) });
      console.error("trackTravelPrices AI error:", err);
    }
  }

  // NUNCA fabricar tarifas sintéticas se nenhuma cotação real de hospedagem ou voo foi confirmada
  if (!stayQuote && flightQuotes.length === 0) {
    if (!existingMeta) return null;

    const { stayPoints: rawStayPoints, flightPoints: rawFlightPoints, stayBestWindow, flightBestWindow } =
      await travelHistoryPromise;

    const [ty, tm] = outboundDate.slice(0, 7).split("-").map(Number);
    const [ny, nm] = todayIso.slice(0, 7).split("-").map(Number);
    const todayLeadMonths = ty && tm && ny && nm ? Math.max(0, (ty - ny) * 12 + (tm - nm)) : 0;

    const existingStay = existingMeta.stayQuote ?? null;
    const existingFlight = existingMeta.flightQuotes?.[0] ?? null;

    const stayPointsMap = new Map(rawStayPoints.map((p) => [p.date, p]));
    if (existingStay && existingStay.cashTotalCents > 0) {
      stayPointsMap.set(todayIso, {
        date: todayIso,
        priceCents: existingStay.cashTotalCents,
        source: existingStay.provider || "Última cotação",
        leadMonthsBeforeTrip: todayLeadMonths,
        targetTripMonth: outboundDate.slice(0, 7),
        eventLabel: `Hoje (${todayLeadMonths}m antes)`,
      });
    }
    const stayPoints = Array.from(stayPointsMap.values()).sort((a, b) => a.date.localeCompare(b.date));

    const flightPointsMap = new Map(rawFlightPoints.map((p) => [p.date, p]));
    if (existingFlight && existingFlight.cashTotalCents > 0) {
      flightPointsMap.set(todayIso, {
        date: todayIso,
        priceCents: existingFlight.cashTotalCents,
        source: `${existingFlight.originAirport}→${destCode} (${existingFlight.airline})`,
        leadMonthsBeforeTrip: todayLeadMonths,
        targetTripMonth: flightOutboundDate.slice(0, 7),
        eventLabel: `Hoje (${todayLeadMonths}m antes)`,
      });
    }
    const flightPoints = Array.from(flightPointsMap.values()).sort((a, b) => a.date.localeCompare(b.date));

    if (stayPoints.length === 0 && flightPoints.length === 0) {
      return null;
    }

    const plannedPurchaseDate = startDate || todayIso;
    const stayLeadTime = buildTravelLeadTimeInsight({
      kind: "stay",
      points: stayPoints,
      targetTripDate: outboundDate,
      plannedPurchaseDate,
      aiBestWindow: stayBestWindow,
    });
    const flightLeadTime = buildTravelLeadTimeInsight({
      kind: "flight",
      points: flightPoints,
      targetTripDate: flightOutboundDate,
      plannedPurchaseDate,
      aiBestWindow: flightBestWindow,
    });

    const combinedHistoryMap = new Map<string, PriceHistoryPoint>();
    for (const sp of stayPoints) {
      const matchingFlight = flightPoints.find((fp) => fp.date === sp.date);
      combinedHistoryMap.set(sp.date, {
        date: sp.date,
        priceCents: sp.priceCents + (matchingFlight?.priceCents ?? existingFlight?.cashTotalCents ?? 0),
        source: sp.source,
        ...(sp.leadMonthsBeforeTrip !== undefined ? { leadMonthsBeforeTrip: sp.leadMonthsBeforeTrip } : {}),
        ...(sp.targetTripMonth ? { targetTripMonth: sp.targetTripMonth } : {}),
        ...(sp.eventLabel ? { eventLabel: sp.eventLabel } : {}),
      });
    }

    return {
      ...existingMeta,
      checkedAt: new Date().toISOString(),
      sourceMode: "cached",
      ...(stayPoints.length > 0 ? { stayHistoricalPrices: stayPoints } : {}),
      ...(flightPoints.length > 0 ? { flightHistoricalPrices: flightPoints } : {}),
      ...(combinedHistoryMap.size > 0
        ? { historicalPrices: Array.from(combinedHistoryMap.values()).sort((a, b) => a.date.localeCompare(b.date)) }
        : {}),
      ...(stayLeadTime ? { stayLeadTime } : {}),
      ...(flightLeadTime ? { flightLeadTime } : {}),
    };
  }

  // Escolhe o melhor voo verificado considerando tarifa aérea + deslocamento terrestre de Araraquara
  flightQuotes.sort(
    (a, b) => a.cashTotalCents + a.groundTransferCents - (b.cashTotalCents + b.groundTransferCents)
  );
  const bestFlight = flightQuotes[0] ?? null;

  const activeStayCash = includeStay && stayQuote ? stayQuote.cashTotalCents : 0;
  const activeStayInst = includeStay && stayQuote ? stayQuote.installmentTotalCents : 0;
  const activeFlightCash = includeFlight && bestFlight ? bestFlight.cashTotalCents : 0;
  const activeFlightInst = includeFlight && bestFlight ? bestFlight.installmentTotalCents : 0;

  const totalCashCents = Math.max(100, activeStayCash + activeFlightCash);
  const totalInstallmentCents = Math.max(100, activeStayInst + activeFlightInst);
  const combinedInstallments = Math.max(
    includeFlight && bestFlight ? bestFlight.installments : 1,
    includeStay && stayQuote ? stayQuote.installments : 1,
    10
  );

  const { stayPoints: rawStayPoints, flightPoints: rawFlightPoints, stayBestWindow, flightBestWindow } =
    await travelHistoryPromise;

  const [ty, tm] = outboundDate.slice(0, 7).split("-").map(Number);
  const [ny, nm] = todayIso.slice(0, 7).split("-").map(Number);
  const todayLeadMonths = ty && tm && ny && nm ? Math.max(0, (ty - ny) * 12 + (tm - nm)) : 0;

  const stayPointsMap = new Map(rawStayPoints.map((p) => [p.date, p]));
  if (stayQuote && stayQuote.cashTotalCents > 0) {
    stayPointsMap.set(todayIso, {
      date: todayIso,
      priceCents: stayQuote.cashTotalCents,
      source: stayQuote.provider || "Hoje",
      leadMonthsBeforeTrip: todayLeadMonths,
      targetTripMonth: outboundDate.slice(0, 7),
      eventLabel: `Hoje (${todayLeadMonths}m antes)`,
    });
  }
  const stayPoints = Array.from(stayPointsMap.values()).sort((a, b) => a.date.localeCompare(b.date));

  const flightPointsMap = new Map(rawFlightPoints.map((p) => [p.date, p]));
  if (bestFlight && bestFlight.cashTotalCents > 0) {
    flightPointsMap.set(todayIso, {
      date: todayIso,
      priceCents: bestFlight.cashTotalCents,
      source: `${bestFlight.originAirport}→${destCode} (${bestFlight.airline})`,
      leadMonthsBeforeTrip: todayLeadMonths,
      targetTripMonth: flightOutboundDate.slice(0, 7),
      eventLabel: `Hoje (${todayLeadMonths}m antes)`,
    });
  }
  const flightPoints = Array.from(flightPointsMap.values()).sort((a, b) => a.date.localeCompare(b.date));

  const plannedPurchaseDate = startDate || todayIso;
  const stayLeadTime: TravelLeadTimeInsight | null = buildTravelLeadTimeInsight({
    kind: "stay",
    points: stayPoints,
    targetTripDate: outboundDate,
    plannedPurchaseDate,
    aiBestWindow: stayBestWindow,
  });
  const flightLeadTime: TravelLeadTimeInsight | null = buildTravelLeadTimeInsight({
    kind: "flight",
    points: flightPoints,
    targetTripDate: flightOutboundDate,
    plannedPurchaseDate,
    aiBestWindow: flightBestWindow,
  });

  const combinedHistoryMap = new Map<string, PriceHistoryPoint>();
  for (const sp of stayPoints) {
    const matchingFlight = flightPoints.find((fp) => fp.date === sp.date);
    combinedHistoryMap.set(sp.date, {
      date: sp.date,
      priceCents: sp.priceCents + (matchingFlight?.priceCents ?? bestFlight?.cashTotalCents ?? 0),
      source: sp.source,
      ...(sp.leadMonthsBeforeTrip !== undefined ? { leadMonthsBeforeTrip: sp.leadMonthsBeforeTrip } : {}),
      ...(sp.targetTripMonth ? { targetTripMonth: sp.targetTripMonth } : {}),
      ...(sp.eventLabel ? { eventLabel: sp.eventLabel } : {}),
    });
  }

  const providerLabel = [
    bestFlight ? `Voo ${bestFlight.originAirport}→${destCode} (${bestFlight.airline})` : null,
    stayQuote ? stayQuote.accommodationName : null,
  ]
    .filter(Boolean)
    .join(" + ");

  return {
    category: "travel",
    checkedAt: new Date().toISOString(),
    sourceMode: snippets.length > 0 ? "live_verified" : "ai_web_verified",
    storeOrProvider: providerLabel || accommodationName,
    cashPriceCents: totalCashCents,
    installmentTotalCents: totalInstallmentCents,
    installments: combinedInstallments,
    offerUrl: stayQuote?.bookingUrl ?? bestFlight?.bookingUrl ?? null,
    verificationSummary:
      verificationSummary ||
      `Cotação verificada para ${outboundDate} a ${returnDate} (${nights} noites, ${travelersLabel}).`,
    rejectedCount,
    rejectedReasons: rejectedReasons.slice(0, 5),
    flightQuotes,
    selectedFlightOrigin: bestFlight?.originAirport,
    stayQuote,
    ...(stayPoints.length > 0 ? { stayHistoricalPrices: stayPoints } : {}),
    ...(flightPoints.length > 0 ? { flightHistoricalPrices: flightPoints } : {}),
    ...(combinedHistoryMap.size > 0
      ? { historicalPrices: Array.from(combinedHistoryMap.values()).sort((a, b) => a.date.localeCompare(b.date)) }
      : {}),
    ...(stayLeadTime ? { stayLeadTime } : {}),
    ...(flightLeadTime ? { flightLeadTime } : {}),
  };
}
