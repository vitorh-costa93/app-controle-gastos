"use server";

import { createHash } from "node:crypto";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { listConsideredTransactionsInRange } from "./transactions";
import { listActiveRecurrenceRules } from "./recurrence";
import { buildMonthOccurrences } from "@/lib/domain/recurrence";
import { buildPaymentGroups, isCardMethod, normalizeOrganization, PAYMENT_METHODS, resolveOrganization, type PaymentOrganization, type PaymentProfile, type PaymentTarget } from "@/lib/domain/payments";
import type { MonthlyOccurrence } from "@/types/domain";

const monthSchema = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/);
const targetSchema = z.object({ kind: z.enum(["transaction", "recurrence"]), id: z.string().uuid(), month: monthSchema });
const organizationSchema = z.object({ method: z.enum(PAYMENT_METHODS), groupName: z.string().trim().max(80), showAtMonthStart: z.boolean(), dueDay: z.number().int().min(1).max(31).nullable() });
const profileSchema = z.object({ kind: z.enum(["transaction", "recurrence", "installment", "card"]), id: z.string(), month: monthSchema, scope: z.enum(["month", "following"]), settings: organizationSchema }).refine((p) => p.kind === "card" ? isCardMethod(p.id) : z.string().uuid().safeParse(p.id).success);
type Client = ReturnType<typeof createAdminClient>;

async function loadSettings(client: Client, prefix: string) {
  const result: { key: string; value: unknown }[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await client.from("app_settings").select("key,value").like("key", `${prefix}%`).order("key").range(from, from + 999);
    if (error) throw new Error("Não foi possível carregar a organização dos pagamentos.");
    result.push(...data);
    if (data.length < 1000) return result;
  }
}
async function loadProfiles(client: Client) {
  const rows = await loadSettings(client, "payment_org:");
  return rows.map((row) => profileSchema.safeParse(row.value)).filter((result) => result.success).map((result) => result.data!) as PaymentProfile[];
}
async function resolveTarget(client: Client, target: PaymentTarget): Promise<{ occurrence: MonthlyOccurrence; kind: PaymentProfile["kind"]; id: string }> {
  if (target.kind === "recurrence") {
    const { data, error } = await client.from("recurrence_rules").select("id,bank,description,direction,person_id,amount,active,start_date,end_date").eq("id", target.id).single();
    if (error || !data || !data.active || data.direction !== "expense") throw new Error("A recorrência não está disponível para organizar pagamentos.");
    const occurrence = { id: data.id, recurrenceRuleId: data.id, referenceMonth: target.month, bank: data.bank, description: data.description } as MonthlyOccurrence;
    return { occurrence, kind: "recurrence", id: data.id };
  }
  const { data, error } = await client.from("transactions").select("id,bank,description,direction,reference_month,recurrence_rule_id,installment_group_id").eq("id", target.id).is("deleted_at", null).single();
  // A leitura também serve à prévia de outro mês no editor; a gravação valida
  // novamente o mês real do lançamento antes de aceitar a organização.
  if (error || !data || data.direction !== "expense") throw new Error("O lançamento não está disponível ou não é uma despesa.");
  const occurrence = { id: data.id, referenceMonth: target.month, bank: data.bank, description: data.description, recurrenceRuleId: data.recurrence_rule_id, installmentGroupId: data.installment_group_id } as MonthlyOccurrence;
  return { occurrence, kind: data.recurrence_rule_id ? "recurrence" : data.installment_group_id ? "installment" : "transaction", id: data.recurrence_rule_id ?? data.installment_group_id ?? data.id };
}
export async function getPaymentOrganization(target: PaymentTarget): Promise<{ ok: true; settings: PaymentOrganization } | { ok: false; error: string }> {
  const parsed = targetSchema.safeParse(target);
  if (!parsed.success) return { ok: false, error: "Lançamento ou mês inválido." };
  try {
    const client = createAdminClient();
    const [resolved, profiles] = await Promise.all([resolveTarget(client, parsed.data), loadProfiles(client)]);
    return { ok: true, settings: resolveOrganization(resolved.occurrence, profiles).settings };
  } catch (error) { return { ok: false, error: error instanceof Error ? error.message : "Não foi possível carregar a organização." }; }
}
export async function savePaymentOrganization(input: { targets: PaymentTarget[]; settings: PaymentOrganization; scope: "month" | "following" }): Promise<{ ok: true } | { ok: false; error: string }> {
  const parsed = z.object({ targets: z.array(targetSchema).min(1).max(500), settings: organizationSchema, scope: z.enum(["month", "following"]) }).safeParse(input);
  if (!parsed.success) return { ok: false, error: "Confira a organização, os vencimentos e os registros selecionados (máximo de 500)." };
  const settings = normalizeOrganization(parsed.data.settings);
  if (settings.showAtMonthStart && !settings.groupName) return { ok: false, error: "Informe um nome para o grupo de pagamento." };
  try {
    const client = createAdminClient();
    // Todos os alvos são validados antes de uma única gravação em lote, sem sucesso parcial.
    const resolved: { target: PaymentTarget; kind: PaymentProfile["kind"]; id: string }[] = [];
    for (const kind of ["transaction", "recurrence"] as const) {
      const targets = parsed.data.targets.filter((target) => target.kind === kind);
      const uniqueIds = [...new Set(targets.map((target) => target.id))];
      const records = new Map<string, { id: string; direction: string; reference_month?: string; recurrence_rule_id?: string | null; installment_group_id?: string | null; active?: boolean }>();
      for (let offset = 0; offset < uniqueIds.length; offset += 100) {
        const query = kind === "transaction"
          ? client.from("transactions").select("id,direction,reference_month,recurrence_rule_id,installment_group_id").is("deleted_at", null)
          : client.from("recurrence_rules").select("id,direction,active");
        const { data, error } = await query.in("id", uniqueIds.slice(offset, offset + 100));
        if (error) throw new Error("Não foi possível validar os pagamentos. Nenhuma organização foi alterada.");
        for (const record of data) records.set(record.id, record);
      }
      for (const target of targets) {
        const record = records.get(target.id);
        if (!record || record.direction !== "expense" || (kind === "transaction" ? record.reference_month !== target.month : !record.active)) throw new Error("Um lançamento mudou ou não é uma despesa. Atualize a lista.");
        resolved.push({ target, kind: record.recurrence_rule_id ? "recurrence" : record.installment_group_id ? "installment" : kind, id: record.recurrence_rule_id ?? record.installment_group_id ?? record.id });
      }
    }
    const writes = new Map<string, { key: string; value: PaymentProfile; updated_at: string }>();
    for (const { target, kind, id } of resolved) {
      const value: PaymentProfile = { kind, id, month: target.month, scope: parsed.data.scope, settings };
      const key = `payment_org:${kind}:${id}:${value.scope}:${target.month}`;
      writes.set(key, { key, value, updated_at: new Date().toISOString() });
      // Uma nova decisão "neste mês e seguintes" substitui a exceção do próprio mês,
      // sem apagar exceções que o usuário configurou explicitamente em outros meses.
      if (value.scope === "following") {
        const current = { ...value, scope: "month" as const };
        const currentKey = `payment_org:${kind}:${id}:month:${target.month}`;
        writes.set(currentKey, { key: currentKey, value: current, updated_at: new Date().toISOString() });
      }
      if (isCardMethod(settings.method)) {
        // Exibir/ocultar afeta o cartão inteiro; os itens não são parcialmente
        // excluídos de uma fatura que continua visível no resumo.
        for (const scope of value.scope === "following" ? ["following", "month"] as const : ["month"] as const) {
          const card: PaymentProfile = { kind: "card", id: settings.method, month: target.month, scope, settings };
          const key = `payment_org:card:${settings.method}:${scope}:${target.month}`;
          writes.set(key, { key, value: card, updated_at: new Date().toISOString() });
        }
      }
    }
    const { error } = await client.from("app_settings").upsert([...writes.values()]);
    if (error) return { ok: false, error: "Não foi possível salvar a organização dos pagamentos." };
    revalidatePath("/cadastro"); revalidatePath("/analise");
    return { ok: true };
  } catch (error) { return { ok: false, error: error instanceof Error ? error.message : "Não foi possível salvar a organização." }; }
}
export async function getMonthlyPayments(month: string) {
  if (!monthSchema.safeParse(month).success) return { ok: false as const, error: "Mês inválido." };
  try {
    const client = createAdminClient();
    const [transactions, rules, profiles, paidRows] = await Promise.all([
      listConsideredTransactionsInRange(month, month), listActiveRecurrenceRules(), loadProfiles(client), loadSettings(client, `payment_paid:${month}:`),
    ]);
    const occurrences = buildMonthOccurrences(month, transactions, rules);
    const groups = buildPaymentGroups(occurrences, profiles, month);
    for (const group of groups) {
      const canonical = JSON.stringify(group.items.map((item) => [item.id, item.amountCents, item.origin]).sort((a, b) => String(a[0]).localeCompare(String(b[0]))));
      group.fingerprint = createHash("sha256").update(canonical).digest("hex");
      const stored = paidRows.find((row) => row.key === `payment_paid:${month}:${group.id}`)?.value as { paid?: boolean; fingerprint?: string } | undefined;
      group.paid = group.items.length > 0 && stored?.paid === true && stored.fingerprint === group.fingerprint;
    }
    return { ok: true as const, groups, totalCents: groups.reduce((sum, group) => sum + (group.amountCents ?? 0), 0), pendingCents: groups.reduce((sum, group) => sum + (group.paid ? 0 : group.amountCents ?? 0), 0), configuredCount: groups.filter((group) => group.items.length > 0).length };
  } catch { return { ok: false as const, error: "Não foi possível carregar as contas deste mês. Tente novamente." }; }
}
export async function setMonthlyPaymentPaid(input: { month: string; groupId: string; paid: boolean; fingerprint: string }): Promise<{ ok: true } | { ok: false; error: string }> {
  const parsed = z.object({ month: monthSchema, groupId: z.string().min(1).max(160), paid: z.boolean(), fingerprint: z.string().regex(/^[a-f0-9]{64}$/) }).safeParse(input);
  if (!parsed.success) return { ok: false, error: "Pagamento inválido." };
  const current = await getMonthlyPayments(parsed.data.month);
  if (!current.ok) return current;
  const group = current.groups.find((item) => item.id === parsed.data.groupId);
  if (!group?.items.length || group.fingerprint !== parsed.data.fingerprint) return { ok: false, error: "Os valores da conta mudaram. Atualize a lista antes de confirmar o pagamento." };
  const { error } = await createAdminClient().from("app_settings").upsert({ key: `payment_paid:${parsed.data.month}:${group.id}`, value: { paid: parsed.data.paid, fingerprint: group.fingerprint, paidAt: parsed.data.paid ? new Date().toISOString() : null }, updated_at: new Date().toISOString() });
  if (error) return { ok: false, error: "Não foi possível atualizar o pagamento." };
  revalidatePath("/analise");
  return { ok: true };
}
