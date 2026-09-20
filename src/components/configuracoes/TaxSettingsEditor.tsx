"use client";

import { useState, useTransition } from "react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { FieldGroup } from "@/components/ui/Field";
import { CurrencyInput } from "@/components/ui/CurrencyInput";
import { setFixedSalaryTaxAmountCents } from "@/lib/data/settings";
import { syncComputedTaxTransactions, resetComputedTaxTransactions } from "@/lib/data/taxes";
import { Person } from "@/types/db";

export function TaxSettingsEditor({
  fixedSalaryPerson,
  fixedSalaryTaxAmountCents,
  hasVariableSalaryPerson,
}: {
  fixedSalaryPerson: Person | null;
  fixedSalaryTaxAmountCents: number;
  hasVariableSalaryPerson: boolean;
}) {
  const [amountCents, setAmountCents] = useState(fixedSalaryTaxAmountCents);
  const [isPending, startTransition] = useTransition();
  const [syncing, startSyncTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);

  function handleSaveAmount() {
    startTransition(async () => {
      const result = await setFixedSalaryTaxAmountCents(amountCents);
      if (result.ok) setMessage("Valor salvo.");
    });
  }

  function handleSync() {
    setMessage(null);
    startSyncTransition(async () => {
      const result = await syncComputedTaxTransactions();
      if (!result.ok) {
        setMessage(result.error);
        return;
      }
      setMessage(
        result.created > 0
          ? `${result.created} lançamento${result.created === 1 ? "" : "s"} de imposto criado${result.created === 1 ? "" : "s"}.`
          : "Nada novo pra criar — os lançamentos já existentes não são alterados."
      );
    });
  }

  function handleResetAndSync() {
    setMessage(null);
    startSyncTransition(async () => {
      const resetResult = await resetComputedTaxTransactions();
      if (!resetResult.ok) {
        setMessage(resetResult.error);
        return;
      }
      const syncResult = await syncComputedTaxTransactions();
      if (!syncResult.ok) {
        setMessage(syncResult.error);
        return;
      }
      setMessage(
        `${resetResult.deleted} apagado${resetResult.deleted === 1 ? "" : "s"} e ${syncResult.created} recriado${syncResult.created === 1 ? "" : "s"} com os valores atuais.`
      );
    });
  }

  return (
    <Card className="p-5">
      <h3 className="mb-1 text-[15px] font-semibold">Impostos</h3>
      <p className="mb-4 text-xs text-(--color-text-tertiary)">
        O imposto passa a existir como um lançamento real (tipo &quot;Imposto&quot;), aparecendo em Análise,
        Cadastro e Simulação. Uma vez criado, editar o valor em Cadastro nunca é sobrescrito automaticamente.
        {hasVariableSalaryPerson &&
          " Salário variável: DAS (Simples Nacional, Anexo III) + INSS (11% sobre 28% do faturamento), lançado no mês seguinte ao do faturamento."}
      </p>

      {fixedSalaryPerson && (
        <div className="mb-4">
          <p className="mb-2 text-xs font-medium text-(--color-text-secondary)">
            Imposto mensal — {fixedSalaryPerson.name} (trabalho para o exterior)
          </p>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_auto]">
            <FieldGroup label="Valor fixo (DAS + DARF)">
              <CurrencyInput valueCents={amountCents} onChange={setAmountCents} />
            </FieldGroup>
            <div className="flex items-end">
              <Button onClick={handleSaveAmount} disabled={isPending} type="button">
                Salvar valor
              </Button>
            </div>
          </div>
          <p className="mt-2 text-xs text-(--color-text-tertiary)">
            Valor fixo em vez de calculado — ajuste aqui sempre que houver mudança salarial.
          </p>
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        <Button variant="secondary" onClick={handleSync} disabled={syncing} type="button">
          {syncing ? "Sincronizando..." : "Recalcular impostos agora"}
        </Button>
        <Button variant="ghost" onClick={handleResetAndSync} disabled={syncing} type="button">
          Apagar e recalcular do zero
        </Button>
      </div>
      <p className="mt-2 text-xs text-(--color-text-tertiary)">
        &quot;Apagar e recalcular&quot; some só com os lançamentos automáticos que você nunca editou — útil depois de
        corrigir um valor ou fórmula errada.
      </p>

      {message && <p className="mt-2 text-xs text-(--color-text-secondary)">{message}</p>}
    </Card>
  );
}
