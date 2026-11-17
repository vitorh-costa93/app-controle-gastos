"use client";

import { useEffect, useState, useTransition } from "react";
import { RecurrenceRule, RecurrenceFrequency } from "@/types/domain";
import { RECURRENCE_FREQUENCIES } from "@/lib/domain/recurrence";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { FieldGroup, Input, Select } from "@/components/ui/Field";
import { CurrencyInput } from "@/components/ui/CurrencyInput";
import {
  addRecurrenceAmountVersion,
  setRecurrenceMonthOverride,
  setRecurrenceEndDate,
  setRecurrenceFrequency,
  updateRecurrenceAmountAllMonths,
  deleteRecurringOccurrence,
} from "@/lib/data/recurrence";
import { defaultOrganization, type PaymentOrganization } from "@/lib/domain/payments";
import { getPaymentOrganization, savePaymentOrganization } from "@/lib/data/payments";
import { PaymentOrganizationFields } from "@/components/payments/PaymentOrganizationFields";
import { ScopeConfirmModal } from "@/components/cadastro/ScopeConfirmModal";
import type { EditScope } from "@/lib/data/transactions";
import { formatCurrencyBRL, formatReferenceMonthShort, toReferenceMonth } from "@/lib/utils/format";

export function RecurrenceRuleEditModal({
  rule,
  onClose,
  onChanged,
  initialMonth,
}: {
  rule: RecurrenceRule;
  onClose: () => void;
  onChanged: () => void;
  /** Mês em contexto (ex.: o mês aberto no Cadastro) — pré-preenche "a partir de" e o mês do valor real. */
  initialMonth?: string;
}) {
  const now = initialMonth ?? toReferenceMonth(new Date());

  const [newAmountCents, setNewAmountCents] = useState(rule.amountCents);
  const [frequency, setFrequency] = useState<RecurrenceFrequency>(rule.frequency ?? "monthly");
  const [endMonth, setEndMonth] = useState(rule.endDate ? rule.endDate.slice(0, 7) : "");
  const [history, setHistory] = useState(rule.amountHistory);
  const sortedHistory = [...history].sort((a, b) => b.effectiveFrom.localeCompare(a.effectiveFrom));

  const isExpense = rule.direction === "expense";
  const [payment, setPayment] = useState<PaymentOrganization>(() =>
    defaultOrganization({ bank: rule.bank ?? null, description: rule.description })
  );
  const [paymentDirty, setPaymentDirty] = useState(false);
  const [paymentLoading, setPaymentLoading] = useState(isExpense);

  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [confirmMode, setConfirmMode] = useState<"save" | "delete" | null>(null);

  useEffect(() => {
    if (!isExpense) return;
    let active = true;
    void getPaymentOrganization({ kind: "recurrence", id: rule.id, month: now })
      .then((res) => {
        if (!active) return;
        if (res.ok) setPayment(res.settings);
      })
      .finally(() => {
        if (active) setPaymentLoading(false);
      });
    return () => { active = false; };
  }, [isExpense, rule.id, now]);

  function executeConfirm(scope: EditScope) {
    setError(null);
    startTransition(async () => {
      if (confirmMode === "delete") {
        const res = await deleteRecurringOccurrence(rule.id, now, scope);
        if (!res.ok) {
          setError(res.error);
          setConfirmMode(null);
          return;
        }
        setConfirmMode(null);
        onChanged();
        onClose();
        return;
      }

      if (scope === "month") {
        if (newAmountCents !== rule.amountCents || !paymentDirty) {
          const res = await setRecurrenceMonthOverride(rule.id, now, newAmountCents);
          if (!res.ok) {
            setError(res.error);
            setConfirmMode(null);
            return;
          }
        }
      } else if (scope === "following") {
        if (newAmountCents !== rule.amountCents) {
          const res = await addRecurrenceAmountVersion(rule.id, now, newAmountCents);
          if (!res.ok) {
            setError(res.error);
            setConfirmMode(null);
            return;
          }
          setHistory((prev) => [...prev.filter((v) => v.effectiveFrom !== now), { effectiveFrom: now, amountCents: newAmountCents }]);
        }
      } else {
        if (newAmountCents !== rule.amountCents) {
          const res = await updateRecurrenceAmountAllMonths(rule.id, newAmountCents);
          if (!res.ok) {
            setError(res.error);
            setConfirmMode(null);
            return;
          }
          setHistory([{ effectiveFrom: rule.startDate.slice(0, 7), amountCents: newAmountCents }]);
        }
      }

      if (scope !== "month") {
        if (frequency !== (rule.frequency ?? "monthly")) {
          const freqRes = await setRecurrenceFrequency(rule.id, frequency);
          if (!freqRes.ok) {
            setError(freqRes.error);
            setConfirmMode(null);
            return;
          }
        }
        const initialEnd = rule.endDate ? rule.endDate.slice(0, 7) : "";
        if (endMonth !== initialEnd) {
          const endRes = await setRecurrenceEndDate(rule.id, endMonth ? `${endMonth}-01` : null);
          if (!endRes.ok) {
            setError(endRes.error);
            setConfirmMode(null);
            return;
          }
        }
      }

      if (isExpense && paymentDirty) {
        const payRes = await savePaymentOrganization({
          targets: [{ kind: "recurrence", id: rule.id, month: now }],
          settings: payment,
          scope,
        });
        if (!payRes.ok) {
          setError(payRes.error);
          setConfirmMode(null);
          return;
        }
      }

      setConfirmMode(null);
      onChanged();
      onClose();
    });
  }

  return (
    <Modal open onClose={onClose} title={rule.description} size="lg">
      <div className="flex flex-col gap-5">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <FieldGroup label="Valor">
            <CurrencyInput valueCents={newAmountCents} onChange={setNewAmountCents} />
          </FieldGroup>
          <FieldGroup label="Frequência">
            <Select value={frequency} onChange={(e) => setFrequency(e.target.value as RecurrenceFrequency)}>
              {RECURRENCE_FREQUENCIES.map((f) => (
                <option key={f.value} value={f.value}>
                  {f.label}
                </option>
              ))}
            </Select>
          </FieldGroup>
          <FieldGroup label="Mês final (opcional)">
            <Input type="month" value={endMonth} onChange={(e) => setEndMonth(e.target.value)} />
          </FieldGroup>
        </div>

        {isExpense && (
          <div>
            <h3 className="modern-editor-section-title">Organização do pagamento</h3>
            {paymentLoading ? (
              <p className="text-sm text-(--color-text-tertiary)">Carregando organização de pagamento...</p>
            ) : (
              <PaymentOrganizationFields
                value={payment}
                onChange={(value) => { setPayment(value); setPaymentDirty(true); }}
                disabled={isPending}
              />
            )}
          </div>
        )}

        <section className="border-t border-(--color-border) pt-4">
          <h4 className="mb-2 text-sm font-semibold">Histórico de valores</h4>
          {sortedHistory.length === 0 ? (
            <p className="text-xs text-(--color-text-tertiary)">
              Nunca mudou de valor — sempre foi {formatCurrencyBRL(rule.amountCents)}.
            </p>
          ) : (
            <ul className="space-y-1 text-sm">
              {sortedHistory.map((v) => (
                <li key={v.effectiveFrom} className="flex items-center justify-between">
                  <span className="text-(--color-text-secondary)">
                    A partir de {formatReferenceMonthShort(v.effectiveFrom)}
                  </span>
                  <span className="font-medium tabular-nums">{formatCurrencyBRL(v.amountCents)}</span>
                </li>
              ))}
            </ul>
          )}
        </section>

        {error && <p className="text-sm text-(--color-negative)">{error}</p>}

        <div className="flex items-center justify-between gap-2 border-t border-(--color-border) pt-4">
          <Button
            variant="ghost"
            type="button"
            disabled={isPending}
            className="text-(--color-negative) hover:bg-(--color-negative-soft)"
            onClick={() => setConfirmMode("delete")}
          >
            Excluir
          </Button>
          <div className="flex gap-2">
            <Button variant="secondary" onClick={onClose} type="button" disabled={isPending}>
              Cancelar
            </Button>
            <Button
              type="button"
              disabled={isPending || newAmountCents <= 0 || paymentLoading}
              onClick={() => setConfirmMode("save")}
            >
              Salvar
            </Button>
          </div>
        </div>
      </div>

      {confirmMode && (
        <ScopeConfirmModal
          open
          mode={confirmMode}
          allowMultiMonth
          busy={isPending}
          onClose={() => setConfirmMode(null)}
          onConfirm={executeConfirm}
        />
      )}
    </Modal>
  );
}
