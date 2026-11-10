import type { MonthlyOccurrence } from "@/types/domain";

export const PAYMENT_METHODS = ["pix", "boleto", "transfer", "cash", "nubank", "picpay", "other"] as const;
export type PaymentOrganization = {
  method: typeof PAYMENT_METHODS[number];
  groupName: string;
  showAtMonthStart: boolean;
  dueDay: number | null;
};
export type PaymentTarget = { kind: "transaction" | "recurrence"; id: string; month: string };
export type PaymentProfile = { kind: "transaction" | "recurrence" | "installment" | "card"; id: string; month: string; scope: "month" | "following"; settings: PaymentOrganization };
export type PaymentGroup = {
  id: string; label: string; amountCents: number | null; method: PaymentOrganization["method"];
  dueDay: number | null; paid: boolean; fingerprint: string; projected: boolean; suggested: boolean;
  items: { id: string; description: string; amountCents: number; origin: "real" | "projected" }[];
};
export const MONTH_START_GROUPS = ["Luz", "Água", "Internet", "Nubank", "PicPay", "Plano de Saúde", "Condomínio"];
const normalize = (value: string) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLowerCase().replace(/\s+/g, " ");
export function isCardMethod(method: string): method is "nubank" | "picpay" { return method === "nubank" || method === "picpay"; }
export function normalizeOrganization(settings: PaymentOrganization): PaymentOrganization {
  return { ...settings, groupName: isCardMethod(settings.method) ? (settings.method === "nubank" ? "Nubank" : "PicPay") : settings.groupName.trim() };
}
/** Sugestões conservadoras: uma compra de água mineral não vira a conta de água. */
export function defaultOrganization(input: { bank?: "nubank" | "picpay" | null; description?: string | null; categoryName?: string | null }): PaymentOrganization {
  const text = normalize(input.description ?? "");
  const category = normalize(input.categoryName ?? "");
  let groupName = "";
  if (/^(?:conta de )?(?:luz|energia(?: eletrica)?)$/.test(text)) groupName = "Luz";
  if (/^(?:conta de )?agua$/.test(text)) groupName = "Água";
  if (/^condominio(?: residencial)?$/.test(text)) groupName = "Condomínio";
  if (category === "internet") groupName = "Internet";
  if (category === "saude" && /\bunimed\b/.test(text)) groupName = "Plano de Saúde";
  return normalizeOrganization({ method: input.bank ?? "other", groupName, showAtMonthStart: Boolean(input.bank || groupName), dueDay: null });
}
export function targetForOccurrence(o: MonthlyOccurrence): PaymentTarget | null {
  if (o.origin === "real") return { kind: "transaction", id: o.id, month: o.referenceMonth };
  return o.recurrenceRuleId ? { kind: "recurrence", id: o.recurrenceRuleId, month: o.referenceMonth } : null;
}
export function resolveOrganization(o: MonthlyOccurrence, profiles: PaymentProfile[], categoryNames: ReadonlyMap<string, string> = new Map()): { settings: PaymentOrganization; suggested: boolean } {
  const kind = o.recurrenceRuleId ? "recurrence" : o.installmentGroupId ? "installment" : "transaction";
  const id = o.recurrenceRuleId ?? o.installmentGroupId ?? o.id;
  const candidates = profiles.filter((p) => p.kind === kind && p.id === id && (p.scope === "month" ? p.month === o.referenceMonth : p.month <= o.referenceMonth));
  candidates.sort((a, b) => Number(b.scope === "month") - Number(a.scope === "month") || b.month.localeCompare(a.month));
  const result = candidates[0] ? { settings: normalizeOrganization(candidates[0].settings), suggested: false } : { settings: defaultOrganization({ ...o, categoryName: o.categoryId ? categoryNames.get(o.categoryId) : null }), suggested: true };
  if (isCardMethod(result.settings.method)) result.settings.showAtMonthStart = cardIsVisible(result.settings.method, o.referenceMonth, profiles);
  return result;
}
export function cardIsVisible(bank: "nubank" | "picpay", month: string, profiles: PaymentProfile[]): boolean {
  const versions = profiles.filter((p) => p.kind === "card" && p.id === bank && (p.scope === "month" ? p.month === month : p.month <= month));
  versions.sort((a, b) => Number(b.scope === "month") - Number(a.scope === "month") || b.month.localeCompare(a.month));
  return versions[0]?.settings.showAtMonthStart ?? true;
}
export function paymentGroupId(settings: PaymentOrganization): string {
  return isCardMethod(settings.method) ? `card:${settings.method}` : `group:${normalize(settings.groupName)}`;
}
/** Une apenas saídas consideradas; é uma visão do orçamento, nunca uma nova despesa. */
export function buildPaymentGroups(occurrences: MonthlyOccurrence[], profiles: PaymentProfile[], month = occurrences[0]?.referenceMonth ?? "", categoryNames: ReadonlyMap<string, string> = new Map()): PaymentGroup[] {
  const groups = new Map<string, PaymentGroup>();
  const omittedDefaults = new Set<string>();
  for (const o of occurrences) {
    if (!o.considered || o.direction !== "expense" || o.amountCents <= 0) continue;
    const { settings, suggested } = resolveOrganization(o, profiles, categoryNames);
    const defaultName = defaultOrganization({ ...o, categoryName: o.categoryId ? categoryNames.get(o.categoryId) : null }).groupName;
    if (!suggested && defaultName && normalize(defaultName) !== normalize(settings.groupName)) omittedDefaults.add(normalize(defaultName));
    if (!settings.showAtMonthStart) {
      for (const name of [settings.groupName, defaultName]) if (name) omittedDefaults.add(normalize(name));
      continue;
    }
    if (!settings.groupName) continue;
    const id = paymentGroupId(settings);
    let group = groups.get(id);
    if (!group) {
      group = { id, label: settings.groupName, method: settings.method, dueDay: settings.dueDay, amountCents: 0, paid: false, fingerprint: "", projected: false, suggested, items: [] };
      groups.set(id, group);
    }
    group.amountCents = (group.amountCents ?? 0) + o.amountCents;
    group.projected ||= o.origin === "projected";
    group.suggested ||= suggested;
    // Um grupo pode reunir contas com vencimentos distintos: mostramos o primeiro dia conhecido.
    if (settings.dueDay !== null) group.dueDay = group.dueDay === null ? settings.dueDay : Math.min(group.dueDay, settings.dueDay);
    group.items.push({ id: o.id, description: o.description ?? "Sem descrição", amountCents: o.amountCents, origin: o.origin });
  }
  for (const label of MONTH_START_GROUPS) {
    if ((label === "Nubank" || label === "PicPay") && !cardIsVisible(label === "Nubank" ? "nubank" : "picpay", month, profiles)) continue;
    if (omittedDefaults.has(normalize(label))) continue;
    if ([...groups.values()].some((g) => normalize(g.label) === normalize(label))) continue;
    const method = label === "Nubank" ? "nubank" : label === "PicPay" ? "picpay" : "other";
    const settings = { method, groupName: label, showAtMonthStart: true, dueDay: null } satisfies PaymentOrganization;
    groups.set(paymentGroupId(settings), { id: paymentGroupId(settings), label, method, dueDay: null, amountCents: null, paid: false, fingerprint: "", projected: false, suggested: true, items: [] });
  }
  return [...groups.values()].sort((a, b) => (a.dueDay ?? 32) - (b.dueDay ?? 32) || a.label.localeCompare(b.label, "pt-BR"));
}
