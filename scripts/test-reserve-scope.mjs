// Isolated regression: shared reserve, individual analyses, no database or writes.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import vm from "node:vm";
import ts from "typescript";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

const require = createRequire(import.meta.url);
function load(file, imports = {}) {
  const exports = {};
  const code = ts.transpileModule(readFileSync(file, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022 } }).outputText;
  vm.runInNewContext(code, { exports, require: (name) => name in imports ? imports[name] : require(name), Date, Map, Set });
  return exports;
}
const finance = load("src/lib/domain/finance.ts");
const month = "2090-01";
const occurrence = (id, personId, amountCents, extras = {}) => ({ id, personId, amountCents, referenceMonth: month, registrationDate: `${month}-05`, categoryId: "essential", considered: true, direction: "expense", origin: "real", ...extras });
const real = [occurrence("v", "v", 10000), occurrence("j", "j", 20000), occurrence("ignored", "j", 99999, { considered: false })];
const projected = occurrence("projected", "j", 3000, { origin: "projected" });
const { getAnalysisData } = load("src/lib/data/analysis.ts", {
  "./estimates": { getEstimatedExpenseOccurrences: async () => new Map([[month, [projected]]]) },
  "./transactions": { listConsideredTransactionsInRange: async (from) => from > month ? [] : real },
  "./recurrence": { listActiveRecurrenceRules: async () => [] },
  "./reference": { listPeople: async () => [{ id: "v", name: "Vitor" }, { id: "j", name: "Jaqueline" }], listCategories: async () => [], listAllCategories: async () => [], listTransactionTypes: async () => [] },
  "./salary": { getSalaryProjectionOccurrences: async () => new Map() },
  "@/lib/domain/recurrence": { monthRange: (from, to) => [to], buildMonthOccurrences: (m, rows) => rows.filter((r) => r.referenceMonth === m) },
  "@/lib/domain/finance": finance,
  "@/lib/domain/insights": { computeCommitment: () => ({}), computeCategoryChanges: () => [], buildUnplannedExclusions: () => ({}), computeUnplanned: () => ({}), isUnplannedCandidate: () => false, isUnplannedExpense: () => false },
  "@/lib/utils/format": { addMonths: (m, count) => { const d = new Date(`${m}-01T00:00:00Z`); d.setUTCMonth(d.getUTCMonth() + count); return d.toISOString().slice(0, 7); } },
  "@/lib/ai/openai": {},
});
const results = await Promise.all([undefined, "v", "j"].map((id) => getAnalysisData(month, id)));
assert.deepEqual(results.map((data) => data.currentSummary.expenseCents), [33000, 10000, 23000]);
for (const data of results) assert.equal(data.householdCategoryBreakdown[0].amountCents, 33000);

const balance = { status: "ready", budget: null, accumulated: [{ referenceMonth: month }], projection: { balanceSeriesCents: [90000] } };
const { EmergencyReserve } = load("src/components/analise/EmergencyReserve.tsx", { "lucide-react": { Pencil: () => null, ShieldCheck: () => null }, "@/lib/utils/format": { formatCurrencyBRL: (v) => `money:${v}`, formatMonthLabel: (v) => v, toReferenceMonth: () => month } });
let calls = [];
const marker = (type) => function ScopeMarker(props) { return React.createElement("span", { "data-test": type, "data-person": props.personId || "casal", "data-shared": Boolean(props.shared) }); };
const { ModernOverview } = load("src/components/analise/ModernOverview.tsx", {
  "next/image": { default: () => null },
  "./useBalanceProjection": { useBalanceProjection: (personId) => { calls.push(personId); return balance; } },
  "./EmergencyReserve": { EmergencyReserve },
  "@/lib/brand-icons": { getBrandIcon: () => ({ src: "/logo.svg" }) },
  "lucide-react": new Proxy({}, { get: () => () => null }),
  "@/lib/planning": { getCategoryLimit: () => null },
  "@/lib/utils/format": { formatCurrencyBRL: (v) => `money:${v}` },
  "@/components/payments/MonthlyPaymentsPanel": { MonthlyPaymentsPanel: marker("payments") },
  "@/components/ui/CategoryIcon": { CategoryIcon: () => null },
  "@/components/ui/AdaptiveAmount": { AdaptiveAmount: () => null },
  "@/components/ui/DescriptionIcon": { DescriptionIcon: () => null },
  "./BalanceEvolution": { BalanceEvolution: marker("evolution") }, "./nosso-mes.css": {},
});
for (const [index, personId] of ["", "v", "j"].entries()) {
  const html = renderToStaticMarkup(React.createElement(ModernOverview, { data: results[index], transactions: [], month, personId, planning: { reserveConfig: { essentialCategoryIds: ["essential"], targetMonths: 6, targetAmountCents: null } }, onInspect() {}, onEditPlanning() {} }));
  assert.match(html, /money:90000/);
  assert.match(html, /Meta: money:198000/);
  assert.match(html, /45,5% da meta/);
  assert.match(html, /Casal · 2090-01/);
  assert.doesNotMatch(html, /Saldo inicial individual/);
  assert.match(html, new RegExp(`data-test="evolution" data-person="${personId || "casal"}" data-shared="${!personId}"`));
}
assert.deepEqual(calls, ["", "", ""]);
console.log("Reserva e cobertura consolidadas nos três filtros; gastos e evolução individuais preservados.");
