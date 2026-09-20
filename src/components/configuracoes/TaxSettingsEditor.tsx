"use client";

import { useState, useTransition } from "react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { FieldGroup, Input } from "@/components/ui/Field";
import { setFixedSalaryTaxRate } from "@/lib/data/settings";
import { syncComputedTaxTransactions } from "@/lib/data/taxes";
import { Person } from "@/types/db";

export function TaxSettingsEditor({
  fixedSalaryPerson,
  fixedSalaryTaxRate,
  hasVariableSalaryPerson,
}: {
  fixedSalaryPerson: Person | null;
  fixedSalaryTaxRate: number;
  hasVariableSalaryPerson: boolean;
}) {
  const [ratePercent, setRatePercent] = useState((fixedSalaryTaxRate * 100).toFixed(2).replace(".", ","));
  const [isPending, startTransition] = useTransition();
  const [syncing, startSyncTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);

  function handleSaveRate() {
    const rate = Number(ratePercent.replace(",", ".")) / 100;
    if (!Number.isFinite(rate) || rate < 0) return;
    startTransition(async () => {
      const result = await setFixedSalaryTaxRate(rate);
      if (result.ok) setMessage("Alíquota salva.");
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

  return (
    <Card className="p-5">
      <h3 className="mb-1 text-[15px] font-semibold">Impostos</h3>
      <p className="mb-4 text-xs text-(--color-text-tertiary)">
        O imposto passa a existir como um lançamento real (tipo &quot;Imposto&quot;), aparecendo em Análise,
        Cadastro e Simulação. Uma vez criado, editar o valor em Cadastro nunca é sobrescrito automaticamente.
        {hasVariableSalaryPerson &&
          " Salário variável: DAS (Simples Nacional, Anexo V) + INSS (11% sobre 28% do faturamento), lançado no mês seguinte ao do faturamento."}
      </p>

      {fixedSalaryPerson && (
        <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-[1fr_auto]">
          <FieldGroup label={`Alíquota estimada — ${fixedSalaryPerson.name} (trabalho para o exterior)`}>
            <div className="flex items-center gap-2">
              <Input value={ratePercent} onChange={(e) => setRatePercent(e.target.value)} className="max-w-28" />
              <span className="text-sm text-(--color-text-tertiary)">%</span>
            </div>
          </FieldGroup>
          <div className="flex items-end">
            <Button onClick={handleSaveRate} disabled={isPending} type="button">
              Salvar alíquota
            </Button>
          </div>
        </div>
      )}

      <Button variant="secondary" onClick={handleSync} disabled={syncing} type="button">
        {syncing ? "Sincronizando..." : "Recalcular impostos agora"}
      </Button>

      {message && <p className="mt-2 text-xs text-(--color-text-secondary)">{message}</p>}
    </Card>
  );
}
