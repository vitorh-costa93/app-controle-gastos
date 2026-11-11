// Pure financial and settings contract tests, without database access.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import * as zod from "zod";

function load(file, imports = {}) {
  const exports = {};
  const code = ts.transpileModule(readFileSync(file, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  vm.runInNewContext(code, { exports, require: (name) => { assert.ok(name in imports, name); return imports[name]; }, console: { error() {} }, Date, Map, Set });
  return exports;
}
const finance = load("src/lib/domain/finance.ts");
const portfolio = load("src/lib/domain/cash-vs-installments.ts");
const { buildBalanceProjection, projectAccumulatedYield } = load("src/lib/domain/balance-projection.ts", { "./finance": finance, "./cash-vs-installments": portfolio });
const baseSummaries = [10000, -5000, 0].map((leftoverCents, i) => ({ referenceMonth: `2090-0${i + 1}`, leftoverCents, incomeCents: Math.max(0, leftoverCents), expenseCents: Math.max(0, -leftoverCents) }));
const budget = { baseSummaries, startingBalance: { month: "2089-12", amountCents: 100000 }, cdi: { annualPercent: 0 } };
let result = buildBalanceProjection(budget);
assert.deepEqual([...result.projection.balanceSeriesCents], [110000, 105000, 105000]);
assert.equal(result.accumulated[1].referenceMonth, "2090-02");
assert.equal(result.projection.balanceSeriesCents[1], result.accumulated[1].accumulatedCents);
result = buildBalanceProjection({ ...budget, cdi: { annualPercent: 12 } });
assert.ok(result.projection.balanceSeriesCents[0] > 110000);
assert.ok(result.projection.balanceSeriesCents[2] > result.accumulated[2].accumulatedCents);
assert.deepEqual([...result.projection.balanceSeriesCents], [...projectAccumulatedYield(baseSummaries, result.accumulated, 12, 100).balanceSeriesCents]);
assert.ok(result.projection.finalNetCents <= result.projection.balanceSeriesCents[2]);
assert.equal(buildBalanceProjection({ ...budget, startingBalance: null }).projection.balanceSeriesCents[0], 10000);
assert.equal(buildBalanceProjection({ ...budget, baseSummaries: [], startingBalance: null }).projection, null);
assert.equal(projectAccumulatedYield([], [], 12, 100), null);
const negative = buildBalanceProjection({ ...budget, startingBalance: null, cdi: { annualPercent: 12 }, baseSummaries: [{ referenceMonth: "2090-01", leftoverCents: -10000, incomeCents: 0, expenseCents: 10000 }] });
assert.equal(negative.projection.balanceSeriesCents[0], -10000);
console.log("✓ Reserva e gráfico compartilham principal, rendimentos, referência mensal e tratamento de saldo negativo/vazio");

let value = budget.startingBalance, failed = false, writes = 0;
const settings = load("src/lib/data/settings.ts", { zod, "next/cache": { revalidatePath() {} }, "@/lib/supabase/admin": { createAdminClient: () => ({ from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { value }, error: failed ? {} : null }) }) }), upsert: async () => { writes++; return { error: null }; } }) }) } });
assert.equal((await settings.getStartingBalance(true)).amountCents, 100000);
failed = true;
await assert.rejects(settings.getStartingBalance(true));
assert.equal(await settings.getStartingBalance(), null);
failed = false; value = { month: "2090-13", amountCents: 100 };
await assert.rejects(settings.getStartingBalance(true));
assert.equal((await settings.setStartingBalance("2090-13", 100)).ok, false);
assert.equal((await settings.setStartingBalance("2090-01", Infinity)).ok, false);
assert.equal((await settings.setStartingBalance("2090-01", 1.1)).ok, false);
assert.equal(writes, 0);
assert.equal((await settings.setStartingBalance("2090-01", 100000)).ok, true);
assert.equal(writes, 1);
console.log("✓ Saldo de referência: erros explícitos e validação antes de gravar; leitura antiga preservada");
