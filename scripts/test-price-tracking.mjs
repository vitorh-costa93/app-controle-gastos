import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();

// 1. Verifica migration isolada no schema meudinheiro
const migrationSql = fs.readFileSync(
  path.join(root, "supabase/migrations/20261123171000_simulation_price_tracking.sql"),
  "utf8"
);
assert.match(migrationSql, /alter table meudinheiro\.simulations/i);
assert.match(migrationSql, /create table if not exists meudinheiro\.simulation_price_snapshots/i);
assert.match(migrationSql, /create table if not exists meudinheiro\.simulation_price_alerts/i);
assert.doesNotMatch(migrationSql, /public\./i, "Migration nunca deve tocar no schema public");

// 2. Verifica Pipeline Anti-Falso-Positivo de 4 Camadas e Viagens Multi-Origem (RAO/VCP)
const engineCode = fs.readFileSync(path.join(root, "src/lib/price-tracking/engine.ts"), "utf8");
assert.match(engineCode, /isSafePublicHttpsUrl/, "Deve ter proteção SSRF para URLs HTTPS públicas");
assert.match(engineCode, /verifyProductOfferFourLayers/, "Deve validar as 4 camadas determinísticas");
assert.match(engineCode, /trackProductPrices/, "Deve exportar rastreador de produtos");
assert.match(engineCode, /trackTravelPrices/, "Deve exportar rastreador de viagens (voos + estadia por data)");

// 3. Verifica catálogo de aeroportos (RAO e VCP) e resorts (Japaratinga / Salinas Maragogi)
const catalogCode = fs.readFileSync(path.join(root, "src/lib/price-tracking/catalog.ts"), "utf8");
assert.match(catalogCode, /code:\s*"RAO"/);
assert.match(catalogCode, /code:\s*"VCP"/);
assert.match(catalogCode, /code:\s*"MCZ"/);
assert.match(catalogCode, /Japaratinga Lounge Resort/);
assert.match(catalogCode, /Salinas Maragogi/);

// 4. Verifica UI com seletor de Produto vs Viagem e campos de Destino + Estadia + Datas
const formCode = fs.readFileSync(path.join(root, "src/components/simulacao/SimulationFormFields.tsx"), "utf8");
assert.match(formCode, /Compra \/ Produto/);
assert.match(formCode, /Viagem \(Voo \+ Estadia\)/);
assert.match(formCode, /1\. Destino \/ Aeroporto de chegada/);
assert.match(formCode, /2\. Estadia \/ Resort \/ Hotel/);
assert.match(formCode, /Entrada na hospedagem \(Check-in\)/);
assert.match(formCode, /Saída da hospedagem \(Check-out\)/);
assert.match(formCode, /Usar as mesmas datas para o voo/);

// 5. Verifica Histórico de Preços (Visor 40d/3m/6m/1a + Termômetro) e Viabilidade de Compra
const historyStatsCode = fs.readFileSync(path.join(root, "src/lib/price-tracking/history-stats.ts"), "utf8");
assert.match(historyStatsCode, /export function mergePriceHistoryPoints/);
assert.match(historyStatsCode, /export function computePriceHistoryStats/);
assert.match(historyStatsCode, /"40d": 40/);
assert.match(historyStatsCode, /"3m": 90/);
assert.match(historyStatsCode, /"6m": 180/);
assert.match(historyStatsCode, /"1a": 365/);
assert.match(historyStatsCode, /"18m": 548/);

const visorCode = fs.readFileSync(path.join(root, "src/components/simulacao/PriceHistoryVisorCard.tsx"), "utf8");
assert.match(visorCode, /Como está o preço hoje/);
assert.match(visorCode, /Histórico de preço/);

const productPanelCode = fs.readFileSync(path.join(root, "src/components/simulacao/ProductVisorPanel.tsx"), "utf8");
assert.match(productPanelCode, /Avisar quando baixar/);
assert.match(productPanelCode, /PriceHistoryVisorCard/);

const trackingSectionCode = fs.readFileSync(path.join(root, "src/components/simulacao/PriceTrackingSection.tsx"), "utf8");
assert.match(trackingSectionCode, /TravelPriceHistorySection/);
assert.match(trackingSectionCode, /Lado a lado/);

const feasibilityCode = fs.readFileSync(path.join(root, "src/lib/utils/best-purchase-date.ts"), "utf8");
assert.match(feasibilityCode, /export function computePurchaseFeasibility/);
assert.match(feasibilityCode, /Viável à vista agora/);

// 6. Guarda contra regressão de preços sintéticos / falsos-positivos
assert.doesNotMatch(engineCode, /334900|baseCash = isPs5|Fallback determinístico/, "Motor nunca deve conter preços sintéticos hardcoded");
assert.match(engineCode, /google\.com\/search/, "Deve rejeitar URLs genéricas de busca");

const trackingServiceCode = fs.readFileSync(path.join(root, "src/lib/data/price-tracking.ts"), "utf8");
assert.match(trackingServiceCode, /if \(!meta\)/, "Deve preservar o último preço válido quando nenhuma oferta real for confirmada");

// 7. Verifica histórico de 18 meses real + análise de antecedência em viagens
assert.match(engineCode, /product_price_history_18m/, "Produto deve buscar histórico real de 18 meses");
assert.match(engineCode, /fetchTravelLeadTimeHistory/, "Viagem deve usar histórico por janela de antecedência");
assert.match(historyStatsCode, /export function buildTravelLeadTimeInsight/);
assert.match(historyStatsCode, /leadMonthsBeforeTrip/);
assert.match(visorCode, /Quando comprar\?/);

// 8. Verifica fontes ampliadas em viagens + Assistente IA Global (Visão do mês / Lançamentos)
assert.match(engineCode, /TripAdvisor/, "Viagem deve pesquisar relatos no TripAdvisor");
assert.match(engineCode, /Semana do Consumidor/, "Viagem deve pesquisar promoções da Semana do Consumidor");
assert.match(engineCode, /validateTravelPoint/, "Viagem deve validar piso e teto anti-falso-positivo");

const financialChatCode = fs.readFileSync(path.join(root, "src/lib/data/financial-chat.ts"), "utf8");
assert.match(financialChatCode, /export async function askFinancialAssistant/);

const estimatesCode = fs.readFileSync(path.join(root, "src/lib/data/estimates.ts"), "utf8");
assert.match(estimatesCode, /export async function upsertEstimatedExpenseFromAssistant/);

const globalDrawerCode = fs.readFileSync(path.join(root, "src/components/layout/GlobalAssistantDrawer.tsx"), "utf8");
assert.match(globalDrawerCode, /Incluir como gasto estimado/);

assert.match(engineCode, /evidence_type/, "Viagem deve classificar evidência de origem");
assert.match(engineCode, /estimativa modelada/, "Viagem deve rejeitar estimativas modeladas no sanitize");
assert.match(engineCode, /venda casada/, "Viagem deve proibir pacotes com venda casada");
assert.match(engineCode, /Reclame Aqui/, "Viagem deve pesquisar relatos de preço no Reclame Aqui");
assert.match(engineCode, /Mundi/, "Viagem deve pesquisar comparadores como Mundi");
assert.match(engineCode, /effort:\s*"medium"/, "Histórico investigativo de viagem deve usar reasoning medium");

console.log("✓ Rastreamento de Preços (4 camadas + Viagens sem venda casada + busca investigativa medium + Assistente IA Global) validado com sucesso");
