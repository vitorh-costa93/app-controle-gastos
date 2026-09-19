"use client";

import { useState, useTransition } from "react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { FieldGroup, Input } from "@/components/ui/Field";
import { CurrencyInput } from "@/components/ui/CurrencyInput";
import { formatCurrencyBRL, formatReferenceMonthShort } from "@/lib/utils/format";
import { setStartingBalance, StartingBalance } from "@/lib/data/settings";

export function StartingBalanceEditor({ startingBalance }: { startingBalance: StartingBalance | null }) {
  const [month, setMonth] = useState(startingBalance?.month ?? "");
  const [amountCents, setAmountCents] = useState(startingBalance?.amountCents ?? 0);
  const [isPending, startTransition] = useTransition();
  const [saved, setSaved] = useState(false);

  function handleSave() {
    setSaved(false);
    startTransition(async () => {
      const result = await setStartingBalance(month, amountCents);
      if (result.ok) setSaved(true);
    });
  }

  return (
    <Card className="p-5">
      <h3 className="mb-1 text-[15px] font-semibold">Saldo inicial</h3>
      <p className="mb-4 text-xs text-(--color-text-tertiary)">
        Saldo real já fechado num mês (ex.: extrato do banco). O saldo acumulado projetado em Simulação parte
        exatamente desse valor nesse mês, e soma a sobra de cada mês seguinte a partir dele.
      </p>

      <div className="mb-3 grid grid-cols-1 gap-3 sm:grid-cols-[1fr_1fr_auto]">
        <FieldGroup label="Mês de referência">
          <Input type="month" value={month} onChange={(e) => setMonth(e.target.value)} />
        </FieldGroup>
        <FieldGroup label="Saldo no fim desse mês">
          <CurrencyInput valueCents={amountCents} onChange={setAmountCents} />
        </FieldGroup>
        <div className="flex items-end">
          <Button onClick={handleSave} disabled={isPending || !month} type="button">
            Salvar
          </Button>
        </div>
      </div>

      {startingBalance && (
        <p className="text-xs text-(--color-text-tertiary)">
          Atual: {formatReferenceMonthShort(startingBalance.month)} fecha em{" "}
          {formatCurrencyBRL(startingBalance.amountCents)}.
        </p>
      )}
      {saved && <p className="mt-1 text-xs text-(--color-positive)">Saldo inicial salvo.</p>}
    </Card>
  );
}
