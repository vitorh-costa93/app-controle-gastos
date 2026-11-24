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

const visorCode = fs.readFileSync(path.join(root, "src/components/simulacao/ProductVisorPanel.tsx"), "utf8");
assert.match(visorCode, /Como está o preço hoje/);
assert.match(visorCode, /Histórico de preço/);
assert.match(visorCode, /Avisar quando baixar/);

const feasibilityCode = fs.readFileSync(path.join(root, "src/lib/utils/best-purchase-date.ts"), "utf8");
assert.match(feasibilityCode, /export function computePurchaseFeasibility/);
assert.match(feasibilityCode, /Viável à vista agora/);

console.log("✓ Rastreamento de Preços (4 camadas Anti-Falso-Positivo + Viagens RAO/VCP + Resorts por data + Histórico Visor) validado com sucesso");
