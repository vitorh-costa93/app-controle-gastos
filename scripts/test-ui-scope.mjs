// Isolated regression checks: no database connection or writes.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";

function load(file, imports = {}) {
  const exports = {};
  const code = ts.transpileModule(readFileSync(file, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  vm.runInNewContext(code, { exports, require: (name) => { if (!(name in imports)) throw Error(`Unexpected import: ${name}`); return imports[name]; }, console, Date, Map, Set });
  return exports;
}
const { conferenceScope } = load("src/components/analise/conference-scope.ts");
const row = (id, personId, bank, categoryId, amountCents, origin = "real", extras = {}) => ({ id, personId, bank, categoryId, amountCents, origin, considered: true, direction: "expense", referenceMonth: "2090-01", ...extras });
const transactions = [
  row("a", "v", "nubank", "food", 42000), row("b", "v", "nubank", "food", 18000),
  row("c", "v", "nubank", "health", 48000), row("d", "j", "nubank", "food", 35000),
  row("e", "v", "picpay", "food", 17000), row("f", "v", "nubank", "food", 9000, "recurring"),
  row("g", "v", "nubank", "food", 500000, "real", { considered: false }),
  row("h", "v", "nubank", "food", 100000, "real", { direction: "income" }),
  row("i", "v", null, null, 1000),
];
const filters = { bank: "nubank", category: "food", includeProjected: false };
let scope = conferenceScope(transactions, filters, "v");
assert.equal(scope.totalCents, 60000);
assert.equal(scope.bankTotalCents, 108000);
assert.equal(scope.rows.length, 2);
assert.ok(scope.rows.every((r) => r.personId === "v" && r.origin === "real"));
assert.equal(scope.categories.reduce((sum, c) => sum + c.amountCents, 0), scope.bankTotalCents);
assert.equal(conferenceScope(transactions, { ...filters, category: "health" }, "v").bankTotalCents, scope.bankTotalCents);
assert.equal(conferenceScope(transactions, { ...filters, includeProjected: true }, "v").totalCents, 69000);
assert.equal(conferenceScope(transactions, filters, "j").totalCents, 35000);
assert.equal(conferenceScope(transactions, filters).totalCents, 95000);
scope = conferenceScope(transactions, { bank: "none", category: "none", includeProjected: false }, "v");
assert.equal(scope.totalCents, 1000);
assert.equal(conferenceScope(transactions, filters, "unknown").bankTotalCents, 0);
console.log("✓ Conferência: pessoa, banco, categoria, reais/projetados e subtotais coerentes");

const finance = load("src/lib/domain/finance.ts");
const months = ["2090-01", "2090-02"];
const source = [row("real-v", "v", null, null, 10000), row("real-j", "j", null, null, 25000)];
let assemblies = 0;
const { getBaseMonthSummaries } = load("src/lib/data/simulation-analysis.ts", {
  "./transactions": { listConsideredTransactionsInRange: async () => source },
  "./recurrence": { listActiveRecurrenceRules: async () => [{ id: "rv", personId: "v" }, { id: "rj", personId: "j" }] },
  "./reference": { listPeople: async () => [{ id: "v" }, { id: "j" }], listTransactionTypes: async () => [] },
  "./salary": { getEstimatedSalaryOccurrences: async () => ({ personId: "j", byMonth: new Map() }), getSalaryProjectionOccurrences: async () => new Map() },
  "./estimates": { getEstimatedExpenseOccurrences: async () => new Map() },
  "@/lib/domain/recurrence": { monthRange: () => months },
  "@/lib/domain/simulation-baseline": { isOpenMonth: () => true, buildSimulationMonthOccurrences: (input) => {
    // Both people must reach the existing assembler before person selection, preserving suppression rules.
    assert.equal(input.transactions.length, 2); assert.equal(input.rules.length, 2); assemblies++;
    return [...input.transactions, row("projected-v", "v", null, null, 3000, "recurring"), row("income-v", "v", null, null, 50000, "real", { direction: "income" }), row("income-j", "j", null, null, 70000, "real", { direction: "income" })];
  } },
  "@/lib/domain/finance": finance,
  "@/lib/domain/simulation": {}, "@/lib/ai/openai": {}, "@/lib/domain/cash-vs-installments": {},
  "@/lib/utils/format": { toReferenceMonth: () => "2089-12" },
});
const horizon = { from: months[0], to: months[1] };
const combined = await getBaseMonthSummaries(horizon);
const vitor = await getBaseMonthSummaries(horizon, "v");
const jaqueline = await getBaseMonthSummaries(horizon, "j");
for (const month of months) {
  assert.equal(vitor.get(month).expenseCents, 13000);
  assert.equal(vitor.get(month).incomeCents, 50000);
  assert.equal(jaqueline.get(month).expenseCents, 25000);
  assert.equal(combined.get(month).expenseCents, vitor.get(month).expenseCents + jaqueline.get(month).expenseCents);
  assert.equal(combined.get(month).leftoverCents, vitor.get(month).leftoverCents + jaqueline.get(month).leftoverCents);
}
assert.equal(assemblies, 6);
console.log("✓ Simulação: base montada antes do filtro, casal é soma das duas pessoas");

let synced = 0;
const budgetCalls = [];
const baseline = { month: "2026-09", amountCents: 120000 };
const { getSimulationBudget } = load("src/lib/data/simulation-budget.ts", {
  "@/lib/data/simulation-analysis": { getBaseMonthSummaries: async (range, personId) => { budgetCalls.push({ range, personId }); return new Map([[range.from, { referenceMonth: range.from, incomeCents: 2000, expenseCents: 1000, leftoverCents: 1000 }]]); } },
  "@/lib/data/settings": { getStartingBalance: async () => baseline },
  "@/lib/data/salary": { syncSalaryIncomeTransactions: async () => { synced++; } },
  "@/lib/data/reference": { listPeople: async () => [{ id: "v" }, { id: "j" }] },
  "@/lib/data/cdi": { getCdiRate: async () => ({ annualPercent: 13.65 }) },
  "@/lib/domain/horizon": { getDefaultSimulationHorizon: () => ({ from: "2026-11", to: "2027-12" }) },
  "@/lib/utils/format": { addMonths: (month, count) => { assert.equal(month, "2026-09"); assert.equal(count, 1); return "2026-10"; } },
});
const sharedBudget = await getSimulationBudget();
assert.equal(sharedBudget.horizon.from, "2026-10");
assert.equal(sharedBudget.horizon.to, "2027-12");
assert.equal(sharedBudget.startingBalance.amountCents, 120000);
assert.equal(sharedBudget.baseSummaries[0].referenceMonth, "2026-10");
assert.equal(sharedBudget.cdi.annualPercent, 13.65);
const personalBudget = await getSimulationBudget("v");
assert.equal(personalBudget.startingBalance, null);
assert.equal(personalBudget.horizon.from, sharedBudget.horizon.from);
assert.equal(budgetCalls[1].personId, "v");
assert.equal(synced, 2);
await assert.rejects(getSimulationBudget("unknown"), /Pessoa não encontrada/);
assert.equal(synced, 2);
console.log("✓ Acumulado e Simulação compartilham horizonte, saldo, CDI e filtro por pessoa");
