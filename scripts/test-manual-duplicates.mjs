import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { runInNewContext } from "node:vm";
import assert from "node:assert/strict";
import ts from "typescript";

const require = createRequire(import.meta.url);
function load(path, fakeRequire) {
  const code = ts.transpileModule(readFileSync(path, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
  const mod = { exports: {} };
  runInNewContext(code, { require: fakeRequire, module: mod, exports: mod.exports, console, Date });
  return mod.exports;
}
const duplicates = load("src/lib/domain/duplicates.ts", () => ({}));
let rows = [];
let fail = false;
const supabase = { from() {
  let data = rows;
  const q = {
    select() { return q; },
    is(key, value) { data = data.filter((row) => (row[key] ?? null) === value); return q; },
    eq(key, value) { data = data.filter((row) => row[key] === value); return q; },
    gte(key, value) { data = data.filter((row) => row[key] >= value); return q; },
    lte(key, value) { data = data.filter((row) => row[key] <= value); return q; },
    order(key) { data = [...data].sort((a, b) => a[key].localeCompare(b[key])); return q; },
    range(from, to) { return Promise.resolve({ data: data.slice(from, to + 1), error: fail ? new Error("db") : null }); },
  };
  return q;
} };
const deps = (name) => name === "next/cache" ? { unstable_cache: (fn) => fn }
  : name === "zod" ? require("zod")
  : name === "@/lib/supabase/admin" ? { createAdminClient: () => supabase }
  : name === "./mappers" ? { mapTransactionRow: (x) => ({ id: x.id }), centsToReaisString: (x) => (x / 100).toFixed(2) }
  : name === "@/lib/domain/duplicates" ? duplicates
  : name === "@/lib/utils/format" ? { addMonths: (month, n) => { const [y, m] = month.split("-").map(Number); return new Date(Date.UTC(y, m - 1 + n, 1)).toISOString().slice(0, 7); } }
  : {};
const { checkManualTransactionDuplicates: check } = load("src/lib/data/transactions.ts", deps);
const input = { personId: "p", bank: "nubank", direction: "expense", amountCents: 1200, registrationDate: "2026-10-10", referenceMonth: "2026-10", description: "Mercado Central", installmentCurrent: 1, installmentTotal: 1, fixedVariable: "variable", excludeId: null };
const row = { id: "0000", person_id: "p", bank: "nubank", direction: "expense", amount: "12.00", registration_date: "2026-10-12", reference_month: "2026-10", description: "Mercado Central Loja", installment_current: 1, installment_total: 1, recurrence_rule_id: null, installment_group_id: null, deleted_at: null };
rows = [row];
assert.equal((await check(input)).matches.length, 1);
for (const change of [{ direction: "income" }, { bank: "picpay" }, { person_id: "other" }, { registration_date: "2026-11-01" }, { description: "Outra Loja" }, { recurrence_rule_id: "r", reference_month: "2026-09" }]) {
  rows = [{ ...row, ...change }];
  assert.equal((await check(input)).matches.length, 0, JSON.stringify(change));
}
rows = [{ ...row, recurrence_rule_id: "r" }];
assert.equal((await check(input)).matches.length, 1, "recorrência no mesmo mês");
assert.equal((await check({ ...input, excludeId: row.id })).matches.length, 0, "próprio id");
rows = Array.from({ length: 1001 }, (_, i) => ({ ...row, id: String(i).padStart(4, "0"), description: i === 1000 ? row.description : "Outro" }));
assert.equal((await check(input)).matches.length, 1, "paginação além de 1000 linhas");
fail = true;
assert.equal((await check(input)).ok, false, "erro de consulta");
console.log("Consulta manual: filtros, recorrência, próprio ID, paginação e erro verificados.");
