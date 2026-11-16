import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { createRequire } from "node:module";
import ts from "typescript";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

const require = createRequire(import.meta.url);
const source = ts.transpileModule(fs.readFileSync("src/components/payments/MonthlyPaymentsPanel.tsx", "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022 } }).outputText;
const group = (id, amountCents, paid, items) => ({ id, label: id, amountCents, paid, items, dueDay: 5, projected: false, suggested: false, fingerprint: "fingerprint" });
const item = { id: "item", description: "Detalhe", amountCents: 1000, origin: "real" };
const groups = [group("Paga", 1000, true, [item]), group("Pendente", 2000, false, [{ ...item, id: "item2", origin: "projected" }]), group("Vazia", null, false, []), group("Sem itens", 9000, true, [])];
function render(personId, selectedGroups = groups) {
  let state = 0;
  const hooks = { ...React, useState: () => ++state === 1 ? [{ month: "2090-01", data: { groups: selectedGroups }, error: null }, () => {}] : [null, () => {}], useRef: (value) => ({ current: value }), useCallback: (fn) => fn, useEffect: () => {} };
  const imports = { react: hooks, "next/link": { default: ({ children, ...props }) => React.createElement("a", props, children) }, "lucide-react": { ChevronDown: () => null }, "@/lib/data/payments": {}, "@/lib/utils/format": { formatCurrencyBRL: (value) => `valor:${value}` }, "@/components/ui/DescriptionIcon": { DescriptionIcon: () => null }, "@/components/ui/CategoryIcon": { CategoryIcon: () => null } };
  const exports = {};
  vm.runInNewContext(source, { exports, require: (name) => imports[name] ?? require(name) });
  return renderToStaticMarkup(React.createElement(exports.MonthlyPaymentsPanel, { month: "2090-01", personId }));
}
for (const personId of ["", "pessoa"]) {
  const html = render(personId);
  assert.match(html, /Paga/); assert.match(html, /Pendente/); assert.doesNotMatch(html, /Vazia|Sem itens|Sem lançamentos/);
  assert.match(html, /1 de 2 contas pagas/); assert.match(html, /width:50%/);
  assert.match(html, /valor:3000/); assert.match(html, /valor:2000/);
  assert.match(html, /Dia 5/); assert.match(html, /Projetado/);
  assert.match(html, /aria-label="Marcar Paga como pago"[^>]*checked/);
  if (personId) assert.match(html, /aria-label="Marcar Paga como pago"[^>]*disabled/);
  else assert.doesNotMatch(html, /aria-label="Marcar Paga como pago"[^>]*disabled/);
}
const empty = render("", [groups[2]]);
assert.match(empty, /0 de 0 contas pagas/); assert.match(empty, /width:0%/); assert.match(empty, /valor:0/);
console.log("Visibilidade, totais, progresso e estados validados em Casal, pessoa e lista vazia.");
