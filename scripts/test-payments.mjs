// Regressões isoladas: nenhuma conexão com Supabase ou alteração de dados reais.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import ts from "typescript";
const require = createRequire(import.meta.url);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
function load(file, imports = {}) {
  const source = ts.transpileModule(fs.readFileSync(path.join(root, file), "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const exports = {};
  vm.runInNewContext(source, { exports, require: (name) => imports[name] ?? require(name), console, Date, Map, Set });
  return exports;
}
const domain = load("src/lib/domain/payments.ts");
const uuid = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const categories = new Map([[uuid(20), "Internet"], [uuid(21), "Saúde"], [uuid(22), "Outros"]]);
const expense = (overrides = {}) => ({ categoryId: uuid(20), id: uuid(1), origin: "real", referenceMonth: "2090-01", bank: null, description: "Internet", considered: true, direction: "expense", amountCents: 16000, recurrenceRuleId: null, ...overrides });
const profile = (overrides = {}) => ({ kind: "recurrence", id: uuid(9), month: "2090-01", scope: "following", settings: { method: "pix", groupName: "Serviços", showAtMonthStart: true, dueDay: 5 }, ...overrides });
const get = (groups, label) => groups.find((g) => g.label === label);
let checks = 0;
function test(name, fn) { fn(); checks++; console.log(`✓ ${name}`); }
test("sugestões não confundem água mineral ou Luzia com contas", () => {
  assert.equal(domain.defaultOrganization({ description: "Água" }).groupName, "Água");
  for (const description of ["Água mineral", "Luzia", "Saúde: remédio"]) assert.equal(domain.defaultOrganization({ description }).showAtMonthStart, false);
});
test("categoria determina Internet e UNIMED em Saúde, com prioridade da fatura", () => {
  for (const description of ["Provedor", "Condomínio", "Água"]) assert.equal(domain.defaultOrganization({ categoryName: "Internet", description }).groupName, "Internet");
  assert.equal(domain.defaultOrganization({ categoryName: "Outros", description: "Internet" }).groupName, "");
  assert.equal(domain.defaultOrganization({ categoryName: "Saúde", description: "UNIMED mensalidade" }).groupName, "Plano de Saúde");
  for (const description of ["PréUNIMED", "UNIMEDPLUS", "plano de saúde"]) assert.equal(domain.defaultOrganization({ categoryName: "Saúde", description }).groupName, "");
  assert.equal(domain.defaultOrganization({ categoryName: "Outros", description: "UNIMED" }).groupName, "");
  const rows = [expense({ categoryId: uuid(21), description: "Unimed", bank: "nubank" }), expense({ id: uuid(2), description: "Provedor" })];
  const groups = domain.buildPaymentGroups(rows, [], "2090-01", categories);
  assert.equal(get(groups, "Nubank").amountCents, 16000);
  assert.equal(get(groups, "Internet").amountCents, 16000);
  assert.equal(get(groups, "Plano de Saúde").amountCents, null);
  assert.equal(groups.reduce((sum, g) => sum + (g.amountCents ?? 0), 0), 32000);
  const override = profile({ kind: "transaction", id: uuid(2) });
  assert.equal(domain.resolveOrganization(rows[1], [override], categories).settings.groupName, "Serviços");
});
test("cartões consolidam pessoas/categorias sem gerar despesa adicional", () => {
  const rows = [expense({ bank: "nubank" }), expense({ id: uuid(2), bank: "nubank", description: "Restaurante", amountCents: 4000 })];
  const g = get(domain.buildPaymentGroups(rows, []), "Nubank");
  assert.equal(g.amountCents, 20000); assert.equal(g.items.length, 2); assert.equal(g.paid, false);
});
test("receitas/desconsiderados ficam fora e conta ausente não vira valor zero", () => {
  const groups = domain.buildPaymentGroups([expense({ direction: "income" }), expense({ considered: false })], []);
  assert.equal(get(groups, "Internet").amountCents, null); assert.equal(groups.length, 7);
});
test("exceção mensal não contamina os meses seguintes nem o passado", () => {
  const rule = expense({ recurrenceRuleId: uuid(9) });
  const profiles = [profile(), profile({ scope: "month", month: "2090-02", settings: { ...profile().settings, groupName: "Só fevereiro" } })];
  assert.equal(domain.resolveOrganization({ ...rule, referenceMonth: "2089-12" }, profiles, categories).settings.groupName, "Internet");
  assert.equal(domain.resolveOrganization({ ...rule, referenceMonth: "2090-02" }, profiles).settings.groupName, "Só fevereiro");
  assert.equal(domain.resolveOrganization({ ...rule, referenceMonth: "2090-03" }, profiles).settings.groupName, "Serviços");
});
test("perfil da compra parcelada é herdado sem misturar outros grupos", () => {
  const settings = profile({ kind: "installment" });
  assert.equal(domain.resolveOrganization(expense({ installmentGroupId: uuid(9) }), [settings]).settings.groupName, "Serviços");
  assert.equal(domain.resolveOrganization(expense({ installmentGroupId: uuid(8) }), [settings], categories).settings.groupName, "Internet");
});
test("projeções e vencimentos são explícitos; agrupamento livre soma uma vez", () => {
  const p = profile({ kind: "transaction", id: uuid(1) });
  const groups = domain.buildPaymentGroups([expense(), expense({ id: uuid(3), description: "Outro", origin: "projected", recurrenceRuleId: uuid(9) })], [p, profile()]);
  const g = get(groups, "Serviços"); assert.equal(g.amountCents, 32000); assert.equal(g.projected, true); assert.equal(g.dueDay, 5);
});
test("desmarcar início do mês retira a conta, sem recriar sugestão vazia", () => {
  const p = profile({ kind: "transaction", id: uuid(1), settings: { ...profile().settings, groupName: "Internet", showAtMonthStart: false } });
  assert.equal(get(domain.buildPaymentGroups([expense()], [p]), "Internet"), undefined);
});
test("ocultar cartão vale para toda a fatura e só para o período escolhido", () => {
  const hidden = profile({ kind: "card", id: "nubank", scope: "month", settings: { method: "nubank", groupName: "Nubank", showAtMonthStart: false, dueDay: null } });
  const entries = [expense({ bank: "nubank" }), expense({ id: uuid(5), bank: "nubank", description: "Restaurante" })];
  assert.equal(get(domain.buildPaymentGroups(entries, [hidden], "2090-01"), "Nubank"), undefined);
  assert.equal(get(domain.buildPaymentGroups([], [hidden], "2090-01"), "Nubank"), undefined);
  assert.equal(get(domain.buildPaymentGroups(entries.map((o) => ({ ...o, referenceMonth: "2090-02" })), [hidden], "2090-02"), "Nubank").amountCents, 32000);
});

let rows = [], writes = [], failure = false;
let occurrences = [expense()];
const transactions = [{ id: uuid(1), category_id: uuid(20), description: "Plano genérico", direction: "expense", reference_month: "2090-01", recurrence_rule_id: uuid(9), installment_group_id: null, deleted_at: null }, { id: uuid(2), direction: "income", reference_month: "2090-01", deleted_at: null }];
const client = { from(table) {
  const filters = []; let offset = 0, limit = Infinity, write = null, single = false;
  const query = {
    select() { return this; }, eq(key, value) { filters.push((r) => r[key] === value); return this; }, is(key, value) { return this.eq(key, value); },
    in(key, values) { filters.push((r) => values.includes(r[key])); return this; },
    like(key, value) { filters.push((r) => r[key].startsWith(value.slice(0, -1))); return this; },
    order() { return this; }, range(a, b) { offset = a; limit = b - a + 1; return this; }, single() { single = true; return this; },
    upsert(data) { assert.equal(table, "app_settings"); write = Array.isArray(data) ? data : [data]; return this; },
    then(resolve, reject) {
      try {
        if (failure) return Promise.resolve({ data: null, error: { message: "simulado" } }).then(resolve, reject);
        if (write) { writes.push(...write); for (const row of write) { rows = rows.filter((r) => r.key !== row.key); rows.push(row); } return Promise.resolve({ error: null }).then(resolve, reject); }
        const source = table === "app_settings" ? rows : table === "transactions" ? transactions : [{ id: uuid(9), direction: "expense", active: true, bank: null, description: "Internet" }];
        const data = source.filter((r) => filters.every((f) => f(r))).slice(offset, offset + limit);
        return Promise.resolve({ data: single ? data[0] : data, error: null }).then(resolve, reject);
      } catch (error) { return Promise.reject(error).then(resolve, reject); }
    },
  }; return query;
} };
const actions = load("src/lib/data/payments.ts", {
  "next/cache": { revalidatePath() {} }, "@/lib/supabase/admin": { createAdminClient: () => client },
  "./reference": { listAllCategories: async () => [...categories].map(([id, name]) => ({ id, name })) },
  "./transactions": { listConsideredTransactionsInRange: async () => [] }, "./recurrence": { listActiveRecurrenceRules: async () => [] },
  "@/lib/domain/recurrence": { buildMonthOccurrences: () => occurrences }, "@/lib/domain/payments": domain,
});
const preview = await actions.getPaymentOrganization({ kind: "transaction", id: uuid(1), month: "2090-01" });
assert.equal(preview.ok, true); assert.equal(preview.settings.groupName, "Internet");
checks++; console.log("✓ prévia no servidor usa categoria do lançamento");
const target = { kind: "transaction", id: uuid(1), month: "2090-01" };
const settings = profile().settings;
let result = await actions.savePaymentOrganization({ targets: [target], settings, scope: "following" });
assert.equal(result.ok, true); assert.equal(writes.length, 2); assert.equal(writes[0].value.kind, "recurrence");
checks++; console.log("✓ following atualiza o próprio mês e resolve a regra no servidor");
const before = writes.length;
for (const input of [
  { targets: [target, { ...target, id: uuid(2) }], settings, scope: "month" },
  { targets: [target], settings: { ...settings, dueDay: 32 }, scope: "month" },
  { targets: [target], settings: { ...settings, groupName: "" }, scope: "month" },
  { targets: [{ ...target, month: "2090-13" }], settings, scope: "month" },
]) { assert.equal((await actions.savePaymentOrganization(input)).ok, false); assert.equal(writes.length, before); }
checks++; console.log("✓ lote inválido, receita, grupo vazio e mês/vencimento inválidos não gravam nada");
result = await actions.savePaymentOrganization({ targets: [target], settings: { method: "nubank", groupName: "ignorado", showAtMonthStart: false, dueDay: 5 }, scope: "month" });
assert.equal(result.ok, true); assert.equal(rows.find((r) => r.value.kind === "card").value.settings.showAtMonthStart, false);
checks++; console.log("✓ visibilidade da fatura é persistida junto do perfil em uma única gravação");
rows = []; writes = [];
let monthly = await actions.getMonthlyPayments("2090-01");
assert.equal(monthly.ok, true); let group = get(monthly.groups, "Internet");
result = await actions.setMonthlyPaymentPaid({ month: "2090-01", groupId: group.id, fingerprint: group.fingerprint, paid: true });
assert.equal(result.ok, true);
monthly = await actions.getMonthlyPayments("2090-01"); assert.equal(monthly.pendingCents, 0); assert.equal(monthly.totalCents, 16000);
checks++; console.log("✓ marcar pago não altera o orçamento e remove apenas do pendente");
const savedFingerprint = group.fingerprint;
occurrences = [expense({ amountCents: 17000 })];
monthly = await actions.getMonthlyPayments("2090-01"); assert.equal(get(monthly.groups, "Internet").paid, false);
assert.equal((await actions.setMonthlyPaymentPaid({ month: "2090-01", groupId: group.id, fingerprint: savedFingerprint, paid: true })).ok, false);
assert.equal((await actions.setMonthlyPaymentPaid({ month: "2090-01", groupId: "group:agua", fingerprint: savedFingerprint, paid: true })).ok, false);
checks++; console.log("✓ mudança de valor invalida quitação e impede marcar conta ausente");
occurrences = [expense()]; monthly = await actions.getMonthlyPayments("2090-02");
assert.equal(get(monthly.groups, "Internet").paid, false);
failure = true; assert.equal((await actions.getMonthlyPayments("2090-01")).ok, false);
assert.equal((await actions.savePaymentOrganization({ targets: [target], settings, scope: "month" })).ok, false);
checks++; console.log("✓ quitação isolada por mês e falhas de leitura/gravação não viram sucesso");
console.log(`${checks} grupos de regressões passaram; dados reais não acessados.`);
