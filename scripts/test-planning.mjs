// Isolated planning contract checks: no database connection or financial writes.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import * as zod from "zod";
import { randomUUID } from "node:crypto";

function load(file, imports) {
  const exports = {};
  const code = ts.transpileModule(readFileSync(file, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  vm.runInNewContext(code, { exports, require: (name) => { assert.ok(name in imports, `Unexpected import ${name}`); return imports[name]; }, Date, Map, Set, console });
  return exports;
}
const domain = load("src/lib/planning.ts", { zod });
const v = randomUUID(), j = randomUUID(), category = randomUUID();
const month = "2090-01";
const stored = new Map();
let failed = false;
const client = { from() {
  return {
    async upsert(row) { if (failed) return { error: {} }; stored.set(row.key, row.value); return { error: null }; },
    select() { return {
      in(_field, ids) { return Promise.resolve({ data: ids.filter((id) => [v, j, category].includes(id)).map((id) => ({ id })), error: null }); },
      like() { return { order() { return { async range(from, to) { return { data: [...stored].map(([key, value]) => ({ key, value })).slice(from, to + 1), error: failed ? {} : null }; } }; } }; },
    }; },
    delete() { return { async eq(_field, key) { stored.delete(key); return { error: null }; } }; },
  };
} };
const api = load("src/lib/data/planning.ts", { "node:crypto": { randomUUID }, "next/cache": { revalidatePath() {} }, zod, "@/lib/supabase/admin": { createAdminClient: () => client }, "@/lib/planning": domain });
const limit = { personId: v, categoryId: category, month, amountCents: 12000 };
assert.equal((await api.saveCategoryLimit(limit)).ok, true);
assert.equal((await api.saveCategoryLimit({ ...limit, personId: j, amountCents: 8000 })).ok, true);
let data = await api.getPlanning();
assert.equal(domain.getCategoryLimit(data, [v], category, month), 12000);
assert.equal(domain.getCategoryLimit(data, [v, j], category, month), 20000);
assert.equal(domain.getCategoryLimit(data, [v, j], category, "2090-02"), null);
await api.saveCategoryLimit({ ...limit, personId: j, amountCents: null });
data = await api.getPlanning();
assert.equal(domain.getCategoryLimit(data, [v, j], category, month), null);
assert.equal(domain.getCategoryLimit(data, [v], category, month), 12000);
assert.equal((await api.saveCategoryLimit({ ...limit, amountCents: 0 })).ok, false);
assert.equal((await api.saveCategoryLimit({ ...limit, amountCents: 1.1 })).ok, false);
assert.equal((await api.saveCategoryLimit({ ...limit, personId: randomUUID() })).ok, false);
assert.equal((await api.saveCategoryLimit({ ...limit, month: "2090-13" })).ok, false);
console.log("✓ Limites opcionais: isolamento mensal/pessoa/categoria, remoção e consolidação completa");

const id = randomUUID();
const deposit = { id, personId: v, date: "2090-01-15", amountCents: 50000, note: "Fixture" };
await api.saveReserveEntry(deposit);
await api.saveReserveEntry(deposit); // retry of the same operation must not duplicate it
await api.saveReserveEntry({ id: randomUUID(), personId: v, date: "2090-01-20", amountCents: -10000, note: "" });
await api.saveReserveEntry({ id: randomUUID(), personId: j, date: "2090-01-20", amountCents: 30000, note: "" });
await api.saveReserveEntry({ id: randomUUID(), personId: v, date: "2090-02-01", amountCents: 90000, note: "" });
data = await api.getPlanning();
assert.equal(data.reserveEntries.length, 4);
assert.equal(domain.getReserveBalance(data, [v], month), 40000);
assert.equal(domain.getReserveBalance(data, [j], month), 30000);
assert.equal(domain.getReserveBalance(data, [v, j], month), 70000);
assert.equal(domain.getReserveBalance(data, [v], "2089-12"), 0);
assert.equal((await api.saveReserveEntry({ ...deposit, date: "2090-02-30" })).ok, false);
assert.equal((await api.saveReserveEntry({ ...deposit, amountCents: Number.MAX_SAFE_INTEGER + 1 })).ok, false);
const legacyConfig = { essentialCategoryIds: [category], targetMonths: 6 };
assert.equal(domain.reserveConfigSchema.parse(legacyConfig).targetAmountCents, null);
assert.equal(domain.reserveConfigSchema.parse({ ...legacyConfig, targetAmountCents: 125000 }).targetAmountCents, 125000);
for (const targetAmountCents of [-1, 0, 1.5, Number.MAX_SAFE_INTEGER + 1]) {
  assert.equal(domain.reserveConfigSchema.safeParse({ ...legacyConfig, targetAmountCents }).success, false);
}
stored.set("starting_balance", { month: "2089-12", amountCents: 42000 });
const beforeGoal = new Map([...stored].filter(([key]) => key === "starting_balance" || key.startsWith("planning:entry:")));
assert.equal((await api.saveReserveConfig({ ...legacyConfig, targetAmountCents: 125000 })).ok, true);
assert.equal((await api.getPlanning()).reserveConfig.targetAmountCents, 125000);
assert.deepEqual(new Map([...stored].filter(([key]) => key === "starting_balance" || key.startsWith("planning:entry:"))), beforeGoal);
assert.equal((await api.saveReserveConfig(legacyConfig)).ok, true);
assert.equal((await api.getPlanning()).reserveConfig.targetAmountCents, null);
assert.equal((await api.saveReserveConfig({ essentialCategoryIds: [category, category], targetMonths: 6 })).ok, false);
await api.deleteReserveEntry(id);
assert.equal(domain.getReserveBalance(await api.getPlanning(), [v], month), -10000);
assert.equal((await api.getPlanning()).limits.length, 1);
console.log("✓ Reserva: depósitos/retiradas, repetição idempotente, pessoa/data e configurações isoladas");
failed = true;
await assert.rejects(api.getPlanning());
assert.equal((await api.saveCategoryLimit(limit)).ok, false);
failed = false;
stored.set(`planning:entry:${randomUUID()}`, { amountCents: 0 });
await assert.rejects(api.getPlanning());
console.log("✓ Falhas de leitura/gravação e registros inválidos permanecem explícitos");
