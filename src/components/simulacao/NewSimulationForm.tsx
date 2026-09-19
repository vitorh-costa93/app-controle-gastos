"use client";

import { useState, useTransition } from "react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { FieldGroup, Input } from "@/components/ui/Field";
import { CurrencyInput } from "@/components/ui/CurrencyInput";
import { createSimulation } from "@/lib/data/simulations";
import { Simulation } from "@/types/domain";
import { toISODate } from "@/lib/utils/format";

export function NewSimulationForm({ onCreated }: { onCreated: (s: Simulation) => void }) {
  const [description, setDescription] = useState("");
  const [totalAmountCents, setTotalAmountCents] = useState(0);
  const [installments, setInstallments] = useState(1);
  const [startDate, setStartDate] = useState(toISODate(new Date()));
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function clear() {
    setDescription("");
    setTotalAmountCents(0);
    setInstallments(1);
    setStartDate(toISODate(new Date()));
    setError(null);
  }

  function handleAdd() {
    setError(null);
    startTransition(async () => {
      const result = await createSimulation({ description, totalAmountCents, installments, startDate });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      onCreated(result.data);
      clear();
    });
  }

  const canSave = description.trim().length > 0 && totalAmountCents > 0 && installments >= 1;

  return (
    <Card className="p-5">
      <h3 className="mb-4 text-[15px] font-semibold">Nova simulação</h3>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <FieldGroup label="Descrição">
          <Input
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Ex.: Viagem para Gramado"
          />
        </FieldGroup>
        <FieldGroup label="Valor total">
          <CurrencyInput valueCents={totalAmountCents} onChange={setTotalAmountCents} />
        </FieldGroup>
        <FieldGroup label="Parcelas">
          <Input
            type="number"
            min={1}
            value={installments}
            onChange={(e) => setInstallments(Number(e.target.value) || 1)}
          />
        </FieldGroup>
        <FieldGroup label="Data de início">
          <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
        </FieldGroup>
      </div>

      {error && <p className="mt-3 text-sm text-(--color-negative)">{error}</p>}

      <div className="mt-4 flex justify-end gap-2">
        <Button variant="secondary" onClick={clear} type="button">
          Limpar
        </Button>
        <Button onClick={handleAdd} disabled={!canSave || isPending} type="button">
          Adicionar
        </Button>
      </div>
    </Card>
  );
}
