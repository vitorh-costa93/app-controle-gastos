import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import assert from "node:assert/strict";
import ts from "typescript";

const source = readFileSync("src/components/cadastro/TransactionEditor.tsx", "utf8");
const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2020 } }).outputText;
let slots, cursor, pending, calls, behavior;
const jsx = (type, props) => ({ type, props: props ?? {} });
const react = {
  useState(initial) { const i = cursor++; if (!(i in slots)) slots[i] = typeof initial === "function" ? initial() : initial; return [slots[i], (v) => { slots[i] = typeof v === "function" ? v(slots[i]) : v; }]; },
  useRef(initial) { const i = cursor++; if (!(i in slots)) slots[i] = { current: initial }; return slots[i]; },
  useEffect() {},
  useTransition() { cursor++; return [false, (fn) => { pending.push(Promise.resolve().then(fn)); }]; },
};
const mocks = {
  "react": react,
  "react/jsx-runtime": { jsx, jsxs: jsx, Fragment: "fragment" },
  "lucide-react": { X: "X" },
  "next/navigation": { useRouter: () => ({ refresh() {} }) },
  "@/components/layout/InterfaceProvider": { useInterface: () => ({ isModern: false }) },
  "@/lib/domain/recurrence": { RECURRENCE_FREQUENCIES: [] },
  "@/lib/domain/payments": { defaultOrganization: () => ({ method: "other", groupName: "", showAtMonthStart: false, dueDay: null }) },
  "@/lib/data/payments": {
    getPaymentOrganization: async () => ({ ok: true, settings: {} }),
    savePaymentOrganization: async () => { calls.payment++; return behavior.payment(); },
  },
  "@/lib/data/transactions": {
    checkManualTransactionDuplicates: async () => ({ ok: true, matches: [] }),
    createTransaction: async (input) => { calls.create++; return behavior.create(input); },
    updateTransaction: async () => { throw Error("unexpected update"); },
    deleteTransaction: async () => { throw Error("unexpected delete"); },
  },
  "@/components/ui/Modal": { Modal: "Modal" },
  "@/components/ui/Button": { Button: "Button" },
  "@/components/ui/Field": { FieldGroup: "FieldGroup", Input: "Input", Select: "Select" },
  "@/components/ui/CurrencyInput": { CurrencyInput: "CurrencyInput" },
  "@/components/payments/PaymentOrganizationFields": { PaymentOrganizationFields: "PaymentOrganizationFields" },
  "@/lib/utils/format": { toISODate: () => "2026-10-10", toReferenceMonth: () => "2026-10", formatCurrencyBRL: String, formatDateBR: String },
};
const moduleStub = { exports: {} };
runInNewContext(code, { module: moduleStub, exports: moduleStub.exports, require: (name) => mocks[name] ?? {}, setTimeout() {}, console, Date });
const props = { open: true, onClose() {}, people: [{ id: "p", name: "Pessoa" }], categories: [], types: [], recurrenceRules: [] };
function render() { cursor = 0; const root = moduleStub.exports.TransactionEditor(props); return root.type(root.props); }
function nodes(root) { if (!root || typeof root !== "object") return []; if (Array.isArray(root)) return root.flatMap(nodes); return [root, ...nodes(root.props?.children)]; }
function find(root, predicate) { const result = nodes(root).find(predicate); assert.ok(result, "controle não encontrado"); return result; }
function button(root, label) { return find(root, (n) => n.type === "Button" && n.props.children === label); }
async function settle() { while (pending.length) await Promise.all(pending.splice(0)); }
function initialize() {
  slots = []; cursor = 0; pending = []; calls = { create: 0, payment: 0 };
  behavior = { create: async (input) => ({ ok: true, data: { id: "t", direction: input.direction } }), payment: async () => ({ ok: true }) };
  let tree = render();
  find(tree, (n) => n.type === "CurrencyInput").props.onChange(1000);
  tree = render();
  const description = find(tree, (n) => n.type === "Input" && n.props.placeholder?.startsWith("Ex."));
  description.props.onChange({ target: { value: "Internet" } });
  return render();
}
let tree = initialize();
const direction = find(tree, (n) => n.type === "FieldGroup" && n.props.label === "Entrada / Saída");
find(direction, (n) => n.type === "Select").props.onChange({ target: { value: "income" } });
tree = render();
button(tree, "Salvar").props.onClick();
await settle();
assert.equal(calls.create, 1); assert.equal(calls.payment, 0, "receita não deve salvar perfil");

tree = initialize();
behavior.create = async () => { throw Error("rede"); };
button(tree, "Salvar").props.onClick();
await settle();
tree = render();
assert.equal(button(tree, "Salvar").props.disabled, false, "erro de rede libera salvamento");
assert.equal(button(tree, "Cancelar").props.disabled, false, "erro de rede libera fechamento");
assert.ok(nodes(tree).some((n) => typeof n.props?.children === "string" && n.props.children.includes("Verifique os lançamentos existentes")));

tree = initialize();
button(tree, "Salvar").props.onClick();
await settle();
assert.equal(calls.create, 1);
assert.equal(calls.payment, 0, "despesa sem edição não deve gravar perfil padrão");

tree = initialize();
find(tree, (n) => n.type === "PaymentOrganizationFields").props.onChange({ method: "pix", groupName: "Internet", showAtMonthStart: true, dueDay: null });
tree = render();
behavior.payment = async () => calls.payment === 1 ? { ok: false, error: "falha simulada" } : { ok: true };
button(tree, "Salvar").props.onClick();
await settle();
tree = render();
button(tree, "Tentar salvar organização novamente").props.onClick();
await settle();
assert.equal(calls.create, 1, "retry não deve recriar lançamento");
assert.equal(calls.payment, 2, "retry deve repetir somente o perfil");
console.log("Editor: receita, despesa sem edição, rejeição de rede e retry de perfil verificados.");
