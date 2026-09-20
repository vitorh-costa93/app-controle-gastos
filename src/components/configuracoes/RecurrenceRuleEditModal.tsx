"use client";

import { useState, useTransition } from "react";
import { RecurrenceRule } from "@/types/domain";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { FieldGroup, Input } from "@/components/ui/Field";
import { CurrencyInput } from "@/components/ui/CurrencyInput";
import { addRecurrenceAmountVersion, setRecurrenceMonthOverride } from "@/lib/data/recurrence";
import { formatCurrencyBRL, formatReferenceMonthShort, toReferenceMonth } from "@/lib/utils/format";

export function RecurrenceRuleEditModal({
  rule,
  onClose,
  onChanged,
}: {
  rule: RecurrenceRule;
  onClose: () => void;
  onChanged: () => void;
}) {
  const now = toReferenceMonth(new Date());

  const [newAmountCents, setNewAmountCents] = useState(rule.amountCents);
  const [effectiveFrom, setEffectiveFrom] = useState(now);
  const [isPending, startTransition] = useTransition();
  const [savedVersion, setSavedVersion] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [overrideMonth, setOverrideMonth] = useState(now);
  const [overrideAmountCents, setOverrideAmountCents] = useState(rule.amountCents);
  const [isOverridePending, startOverrideTransition] = useTransition();
  const [savedOverride, setSavedOverride] = useState(false);
  const [overrideError, setOverrideError] = useState<string | null>(null);

  const [history, setHistory] = useState(rule.amountHistory);
  const sortedHistory = [...history].sort((a, b) => b.effectiveFrom.localeCompare(a.effectiveFrom));

  function handleSaveVersion() {
    setError(null);
    setSavedVersion(false);
    startTransition(async () => {
      const result = await addRecurrenceAmountVersion(rule.id, effectiveFrom, newAmountCents);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setHistory((prev) => [...prev.filter((v) => v.effectiveFrom !== effectiveFrom), { effectiveFrom, amountCents: newAmountCents }]);
      setSavedVersion(true);
      onChanged();
    });
  }

  function handleSaveOverride() {
    setOverrideError(null);
    setSavedOverride(false);
    startOverrideTransition(async () => {
      const result = await setRecurrenceMonthOverride(rule.id, overrideMonth, overrideAmountCents);
      if (!result.ok) {
        setOverrideError(result.error);
        return;
      }
      setSavedOverride(true);
      onChanged();
    });
  }

  return (
    <Modal open onClose={onClose} title={rule.description}>
      <div className="flex flex-col gap-6">
        <section>
          <h4 className="mb-1 text-sm font-semibold">Alterar valor a partir de um mês</h4>
          <p className="mb-3 text-xs text-(--color-text-tertiary)">
            Nunca retroativo — os meses anteriores ao escolhido continuam com o valor que já estava vigente.
          </p>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_1fr_auto]">
            <FieldGroup label="Novo valor">
              <CurrencyInput valueCents={newAmountCents} onChange={setNewAmountCents} />
            </FieldGroup>
            <FieldGroup label="A partir de">
              <Input type="month" value={effectiveFrom} onChange={(e) => setEffectiveFrom(e.target.value)} />
            </FieldGroup>
            <div className="flex items-end">
              <Button onClick={handleSaveVersion} disabled={isPending || newAmountCents <= 0} type="button">
                Salvar
              </Button>
            </div>
          </div>
          {error && <p className="mt-2 text-xs text-(--color-negative)">{error}</p>}
          {savedVersion && <p className="mt-2 text-xs text-(--color-positive)">Novo valor salvo.</p>}
        </section>

        <section className="border-t border-(--color-border) pt-4">
          <h4 className="mb-1 text-sm font-semibold">Valor real de um mês específico</h4>
          <p className="mb-3 text-xs text-(--color-text-tertiary)">
            Ex.: valor real da conta que veio diferente da estimativa. Vale só para esse mês — os demais continuam
            com o valor estimado (inclusive na simulação).
          </p>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_1fr_auto]">
            <FieldGroup label="Valor real">
              <CurrencyInput valueCents={overrideAmountCents} onChange={setOverrideAmountCents} />
            </FieldGroup>
            <FieldGroup label="Mês">
              <Input type="month" value={overrideMonth} onChange={(e) => setOverrideMonth(e.target.value)} />
            </FieldGroup>
            <div className="flex items-end">
              <Button
                onClick={handleSaveOverride}
                disabled={isOverridePending || overrideAmountCents <= 0}
                type="button"
                variant="secondary"
              >
                Salvar
              </Button>
            </div>
          </div>
          {overrideError && <p className="mt-2 text-xs text-(--color-negative)">{overrideError}</p>}
          {savedOverride && (
            <p className="mt-2 text-xs text-(--color-positive)">
              Valor lançado. Edite ou remova em Cadastro se precisar corrigir.
            </p>
          )}
        </section>

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

        <div className="flex justify-end border-t border-(--color-border) pt-4">
          <Button variant="secondary" onClick={onClose} type="button">
            Fechar
          </Button>
        </div>
      </div>
    </Modal>
  );
}
