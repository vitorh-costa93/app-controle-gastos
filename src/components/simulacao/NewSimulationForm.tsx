"use client";

import { useState, useTransition } from "react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { createSimulation } from "@/lib/data/simulations";
import { Simulation } from "@/types/domain";
import {
  SimulationFormFields,
  SimulationFormValue,
  emptySimulationForm,
  isSimulationFormValid,
  simulationFormToInput,
} from "./SimulationFormFields";

export function NewSimulationForm({
  onCreated,
  cdiAnnualPercent,
  percentOfCdi,
}: {
  onCreated: (s: Simulation) => void;
  cdiAnnualPercent: number;
  percentOfCdi: number;
}) {
  const [form, setForm] = useState<SimulationFormValue>(emptySimulationForm);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function clear() {
    setForm(emptySimulationForm());
    setError(null);
  }

  function handleAdd() {
    setError(null);
    startTransition(async () => {
      const result = await createSimulation(simulationFormToInput(form));
      if (!result.ok) {
        setError(result.error);
        return;
      }
      onCreated(result.data);
      clear();
    });
  }

  return (
    <Card className="p-5">
      <h3 className="mb-4 text-[15px] font-semibold">Nova simulação</h3>
      <SimulationFormFields
        value={form}
        onChange={setForm}
        cdiAnnualPercent={cdiAnnualPercent}
        percentOfCdi={percentOfCdi}
      />

      {error && <p className="mt-3 text-sm text-(--color-negative)">{error}</p>}

      <div className="mt-4 flex justify-end gap-2">
        <Button variant="secondary" onClick={clear} type="button">
          Limpar
        </Button>
        <Button onClick={handleAdd} disabled={!isSimulationFormValid(form) || isPending} type="button">
          Adicionar
        </Button>
      </div>
    </Card>
  );
}
