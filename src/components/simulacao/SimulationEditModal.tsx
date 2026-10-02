"use client";

import { useState, useTransition } from "react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { updateSimulation } from "@/lib/data/simulations";
import { Simulation } from "@/types/domain";
import {
  SimulationFormFields,
  SimulationFormValue,
  formFromSimulation,
  isSimulationFormValid,
  simulationFormToInput,
} from "./SimulationFormFields";

export function SimulationEditModal({
  simulation,
  onClose,
  onSaved,
  cdiAnnualPercent,
  percentOfCdi,
}: {
  simulation: Simulation;
  onClose: () => void;
  onSaved: (s: Simulation) => void;
  cdiAnnualPercent: number;
  percentOfCdi: number;
}) {
  const [form, setForm] = useState<SimulationFormValue>(() => formFromSimulation(simulation));
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleSave() {
    setError(null);
    startTransition(async () => {
      const result = await updateSimulation(simulation.id, simulationFormToInput(form));
      if (!result.ok) {
        setError(result.error);
        return;
      }
      onSaved(result.data);
    });
  }

  return (
    <Modal open onClose={onClose} title="Editar simulação">
      <SimulationFormFields
        value={form}
        onChange={setForm}
        cdiAnnualPercent={cdiAnnualPercent}
        percentOfCdi={percentOfCdi}
      />
      {error && <p className="mt-3 text-sm text-(--color-negative)">{error}</p>}
      <div className="mt-4 flex justify-end gap-2">
        <Button variant="secondary" onClick={onClose} type="button">
          Cancelar
        </Button>
        <Button onClick={handleSave} disabled={!isSimulationFormValid(form) || isPending} type="button">
          Salvar
        </Button>
      </div>
    </Modal>
  );
}
