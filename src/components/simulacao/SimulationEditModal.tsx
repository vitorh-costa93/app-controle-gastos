"use client";

import { useState, useTransition } from "react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { FieldGroup, Input } from "@/components/ui/Field";
import { CurrencyInput } from "@/components/ui/CurrencyInput";
import { updateSimulation } from "@/lib/data/simulations";
import { Simulation } from "@/types/domain";

export function SimulationEditModal({
  simulation,
  onClose,
  onSaved,
}: {
  simulation: Simulation;
  onClose: () => void;
  onSaved: (s: Simulation) => void;
}) {
  const [description, setDescription] = useState(simulation.description);
  const [totalAmountCents, setTotalAmountCents] = useState(simulation.totalAmountCents);
  const [installments, setInstallments] = useState(simulation.installments);
  const [startDate, setStartDate] = useState(simulation.startDate);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const canSave = description.trim().length > 0 && totalAmountCents > 0 && installments >= 1;

  function handleSave() {
    setError(null);
    startTransition(async () => {
      const result = await updateSimulation(simulation.id, { description, totalAmountCents, installments, startDate });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      onSaved(result.data);
    });
  }

  return (
    <Modal open onClose={onClose} title="Editar simulação">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <FieldGroup label="Descrição">
          <Input value={description} onChange={(e) => setDescription(e.target.value)} />
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
        <Button variant="secondary" onClick={onClose} type="button">
          Cancelar
        </Button>
        <Button onClick={handleSave} disabled={!canSave || isPending} type="button">
          Salvar
        </Button>
      </div>
    </Modal>
  );
}
