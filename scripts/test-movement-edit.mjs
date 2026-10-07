// Testes de regressão sem conexão com dados reais: node scripts/test-movement-edit.mjs
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import path from "node:path";
import { fileURLToPath } from "node:url";
const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));

function load(file, imports) {
  const source = fs.readFileSync(path.join(scriptDirectory, "..", file), "utf8");
  const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  const exports = {};
  vm.runInNewContext(js, { exports, require: (name) => {
    if (!(name in imports)) throw new Error(`Import inesperado: ${name}`);
    return imports[name];
  }, console, Date, Set, Map });
  return exports;
}

let tables;
let failTable;
let failOperation;
let invalidations;
let requests;
const client = { async rpc(name, args) {
  assert.equal(name, "set_recurrence_month_override");
  const rule = tables.recurrence_rules.find((r) => r.id === args.p_rule_id);
  if (!rule || !rule.active || failTable === "transactions") return { error: { message: "Falha simulada" } };
  const existing = tables.transactions.find((t) => t.recurrence_rule_id === args.p_rule_id && t.reference_month === args.p_month && t.deleted_at === null);
  if (existing) existing.amount = args.p_amount;
  else tables.transactions.push({ id: "override", recurrence_rule_id: args.p_rule_id, reference_month: args.p_month, amount: args.p_amount, deleted_at: null });
  return { error: null };
}, from(table) {
  requests++;
  const filters = [];
  let operation = "select", patch, single = false, optional = false;
  const query = {
    select() { return this; },
    update(value) { operation = "update"; patch = value; return this; },
    insert(value) { operation = "insert"; patch = value; return this; },
    upsert(value) { operation = "upsert"; patch = value; return this; },
    eq(key, value) { filters.push((r) => r[key] === value); return this; },
    is(key, value) { return this.eq(key, value); },
    gt(key, value) { filters.push((r) => r[key] > value); return this; },
    gte(key, value) { filters.push((r) => r[key] >= value); return this; },
    order() { return this; },
    single() { single = true; return this; },
    maybeSingle() { single = true; optional = true; return this; },
    then(resolve, reject) {
      try {
        if (failTable === table && failOperation === operation) return Promise.resolve({ data: null, error: { message: "Falha simulada" } }).then(resolve, reject);
        let rows = tables[table].filter((row) => filters.every((f) => f(row)));
        if (operation === "update") rows.forEach((row) => Object.assign(row, patch));
        if (operation === "insert") {
          const row = { id: "override", deleted_at: null, ...patch };
          tables[table].push(row); rows = [row];
        }
        if (operation === "upsert") {
          let row = tables[table].find((r) => r.recurrence_rule_id === patch.recurrence_rule_id && r.effective_from === patch.effective_from);
          if (row) Object.assign(row, patch);
          else { row = { ...patch }; tables[table].push(row); }
          rows = [row];
        }
        const error = single && (rows.length > 1 || (!optional && rows.length === 0)) ? { message: "Registro inválido" } : null;
        return Promise.resolve({ data: single ? rows[0] ?? null : rows, error }).then(resolve, reject);
      } catch (error) { return Promise.reject(error).then(resolve, reject); }
    },
  };
  return query;
} };
const cache = { revalidatePath() { invalidations++; }, revalidateTag() { invalidations++; }, unstable_cache: (f) => f };
const mappers = load("src/lib/data/mappers.ts", {});
const imports = { "next/cache": cache, "@/lib/supabase/admin": { createAdminClient: () => client }, "./mappers": mappers };
const recurrence = load("src/lib/data/recurrence.ts", imports);
const { saveMovementAmount } = load("src/lib/data/movement-edit.ts", { ...imports, "./recurrence": recurrence });
const { buildMonthOccurrences } = load("src/lib/domain/recurrence.ts", { "@/lib/utils/format": {} });

function reset(history = []) {
  tables = {
    recurrence_rules: [{ id: "rule", start_date: "2026-10-01", end_date: "2027-01-01", active: true, amount: "100.00", frequency: "monthly", person_id: "person", direction: "expense", description: "Conta", skipped_months: [] }],
    recurrence_rule_amount_versions: history,
    transactions: [
      { id: "past", recurrence_rule_id: "rule", reference_month: "2026-10", amount: "100.00", deleted_at: null },
      { id: "current", recurrence_rule_id: "rule", reference_month: "2026-11", amount: "100.00", deleted_at: null },
      { id: "future", recurrence_rule_id: "rule", reference_month: "2026-12", amount: "120.00", deleted_at: null },
      { id: "deleted", recurrence_rule_id: "rule", reference_month: "2026-12", amount: "100.00", deleted_at: "deleted" },
      { id: "single", recurrence_rule_id: null, reference_month: "2026-11", amount: "50.00", deleted_at: null },
    ],
  };
  failTable = failOperation = null; invalidations = requests = 0;
}
function projection(month) {
  const row = tables.recurrence_rules[0];
  return buildMonthOccurrences(month, [], [{ ...row, id: "rule", startDate: row.start_date, endDate: row.end_date, amountCents: mappers.reaisStringToCents(row.amount), amountHistory: tables.recurrence_rule_amount_versions.map((v) => ({ effectiveFrom: v.effective_from, amountCents: mappers.reaisStringToCents(v.amount) })) }])[0]?.amountCents;
}

(async () => {
  reset();
  assert.equal((await saveMovementAmount("current", "rule", "2026-11", 178000, "month")).ok, true);
  assert.equal(tables.transactions.find((t) => t.id === "current").amount, "1780.00");
  assert.equal(tables.transactions.find((t) => t.id === "future").amount, "120.00");
  assert.equal(projection("2026-12"), 10000);
  tables.recurrence_rules[0].active = false;
  assert.equal((await saveMovementAmount("current", "rule", "2026-11", 180000, "month")).ok, true);
  assert.equal(tables.transactions.find((t) => t.id === "current").amount, "1800.00");
  assert.equal((await saveMovementAmount("current", "rule", "2026-11", 180000, "following")).ok, false);
  assert.equal((await saveMovementAmount("projected:rule:2026-11", "rule", "2026-11", 180000, "month")).ok, false);
  reset();
  tables.transactions = tables.transactions.filter((t) => t.id !== "current");
  assert.equal((await saveMovementAmount("projected:rule:2026-11", "rule", "2026-11", 178000, "month")).ok, true);
  assert.equal(tables.transactions.filter((t) => t.reference_month === "2026-11" && t.recurrence_rule_id === "rule").length, 1);
  assert.equal((await saveMovementAmount("projected:rule:2026-11", "rule", "2026-11", 180000, "month")).ok, true);
  assert.equal(tables.transactions.filter((t) => t.id === "override").length, 1);
  reset([{ recurrence_rule_id: "rule", effective_from: "2026-12", amount: "120.00" }]);
  assert.equal((await saveMovementAmount("current", "rule", "2026-11", 178000, "following")).ok, true);
  assert.equal(projection("2026-10"), 10000);
  assert.equal(projection("2026-11"), 178000);
  assert.equal(projection("2026-12"), 178000);
  assert.equal(projection("2027-01"), 178000);
  assert.equal(projection("2027-02"), undefined);
  assert.equal(tables.transactions.find((t) => t.id === "past").amount, "100.00");
  assert.equal(tables.transactions.find((t) => t.id === "future").amount, "1780.00");
  assert.equal(tables.transactions.find((t) => t.id === "deleted").amount, "100.00");
  reset();
  assert.equal((await saveMovementAmount("single", null, "2026-11", 12345, "month")).ok, true);
  assert.equal(tables.transactions.find((t) => t.id === "single").amount, "123.45");
  assert.equal((await saveMovementAmount("single", null, "2026-11", 12345, "following")).ok, false);
  for (const value of [0, -1, 1.5, NaN, Infinity, 100000000000000]) {
    reset();
    assert.equal((await saveMovementAmount("current", "rule", "2026-11", value, "month")).ok, false);
    assert.equal(requests, 0);
  }
  reset();
  assert.equal((await saveMovementAmount("current", "rule", "2026-13", 100, "month")).ok, false);
  assert.equal(requests, 0);
  reset(); failTable = "transactions"; failOperation = "select";
  assert.equal((await saveMovementAmount("projected:rule:2026-11", "rule", "2026-11", 100, "month")).ok, false);
  assert.equal(tables.transactions.length, 5);
  reset(); failTable = "transactions"; failOperation = "update";
  assert.equal((await saveMovementAmount("current", "rule", "2026-11", 178000, "following")).ok, false);
  assert.ok(invalidations > 0);
  failTable = failOperation = null;
  assert.equal((await saveMovementAmount("current", "rule", "2026-11", 178000, "following")).ok, true);
  assert.equal(projection("2026-10"), 10000);
  assert.equal(tables.transactions.find((t) => t.id === "future").amount, "1780.00");
  // Exercita o bloqueio mútuo entre salvar/excluir e a liberação após falhas.
  const jsx = (type, props) => ({ type, props });
  let transition;
  const uiImports = {
    react: { useState: (value) => [value, () => {}], useTransition: () => [false, (action) => { transition = action(); }] },
    "react/jsx-runtime": { jsx, jsxs: jsx, Fragment: "fragment" },
    "@/components/ui/Modal": { Modal: "modal" },
    "@/components/ui/Button": { Button: "button" },
    "@/lib/data/transactions": { deleteTransaction: async () => { throw new Error("Falha simulada"); } },
    "@/lib/data/recurrence": { deleteRecurringOccurrence: async () => ({ ok: true }) },
    "@/lib/data/installments": { cancelInstallmentGroup: async () => ({ ok: true }) },
    "@/lib/utils/format": { formatMonthLabel: (m) => m, formatCurrencyBRL: String, formatDateBR: String },
  };
  function nodes(node) {
    if (!node || typeof node !== "object") return [];
    const children = node.props?.children;
    return [node, ...(Array.isArray(children) ? children.flat(Infinity) : [children]).flatMap(nodes)];
  }
  const deleteUI = load("src/components/cadastro/DeleteRecordDialog.tsx", uiImports);
  const busyEvents = [];
  let completed = false;
  const deletion = deleteUI.DeleteActions({ target: { kind: "simple", transactionId: "single" }, onDone: () => { completed = true; }, onBusyChange: (busy) => busyEvents.push(busy) });
  nodes(deletion).find((n) => n.type === "button").props.onClick();
  assert.equal(busyEvents[0], true);
  await transition;
  assert.deepEqual(busyEvents, [true, false]);
  assert.equal(completed, false);
  const { MovementDetailsDialog } = load("src/components/analise/MovementDetailsDialog.tsx", {
    ...uiImports,
    react: { ...uiImports.react, useState: (value) => [value === false ? true : value, () => {}] },
    "@/components/ui/CurrencyInput": { CurrencyInput: "currency" },
    "@/lib/data/movement-edit": { saveMovementAmount },
    "@/lib/domain/recurrence": { frequencyLabel: String },
    "@/components/cadastro/DeleteRecordDialog": deleteUI,
  });
  let closed = false;
  const dialog = MovementDetailsDialog({ occurrence: { id: "single", origin: "real", referenceMonth: "2026-11", amountCents: 100, installmentTotal: 1 }, people: [], categories: [], types: [], onClose: () => { closed = true; }, onChanged() {} });
  assert.equal(nodes(dialog).find((n) => n.type === "button").props.disabled, true);
  dialog.props.onClose();
  assert.equal(closed, false);
  console.log("OK: mês real/projetado, repetição, meses seguintes, histórico, limite final, pontual/parcela, valores inválidos e falhas de consulta/escrita.");
})().catch((error) => { console.error(error); process.exitCode = 1; });
