"use client";

import { FieldGroup, Input } from "@/components/ui/Field";
import { CurrencyInput } from "@/components/ui/CurrencyInput";
import { Info } from "lucide-react";
import { Simulation } from "@/types/domain";
import type { SimulationInput } from "@/lib/data/simulations";
import { impliedInstallmentRate, netMonthlyYieldRate } from "@/lib/domain/cash-vs-installments";
import { addMonths, formatCurrencyBRL, formatMonthLabel, toISODate } from "@/lib/utils/format";

/** Campos do formulário de simulação: preço à vista (padrão) e, opcionalmente, o parcelado. */
export interface SimulationFormValue {
  description: string;
  cashPriceCents: number;
  useInstallments: boolean;
  installmentTotalCents: number;
  installments: number;
  startDate: string;
}

export function emptySimulationForm(): SimulationFormValue {
  return {
    description: "",
    cashPriceCents: 0,
    useInstallments: false,
    installmentTotalCents: 0,
    installments: 10,
    startDate: toISODate(new Date()),
  };
}

export function formFromSimulation(sim: Simulation): SimulationFormValue {
  const hasInstallments = sim.installments > 1;
  return {
    description: sim.description,
    // Simulações antigas não têm preço à vista: sem parcelas, o total é o próprio preço à vista.
    cashPriceCents: sim.cashPriceCents ?? (hasInstallments ? 0 : sim.totalAmountCents),
    useInstallments: hasInstallments,
    installmentTotalCents: hasInstallments ? sim.totalAmountCents : 0,
    installments: hasInstallments ? sim.installments : 10,
    startDate: sim.startDate,
  };
}

export function isSimulationFormValid(v: SimulationFormValue): boolean {
  if (!v.description.trim() || v.cashPriceCents <= 0) return false;
  return !v.useInstallments || (v.installmentTotalCents > 0 && v.installments >= 2);
}

export function simulationFormToInput(v: SimulationFormValue): SimulationInput {
  return {
    description: v.description.trim(),
    cashPriceCents: v.cashPriceCents,
    // Sem parcelado, o orçamento é impactado pelo preço à vista, em uma vez.
    totalAmountCents: v.useInstallments ? v.installmentTotalCents : v.cashPriceCents,
    installments: v.useInstallments ? v.installments : 1,
    startDate: v.startDate,
  };
}

export function SimulationFormFields({
  value,
  onChange,
  cdiAnnualPercent,
  percentOfCdi,
}: {
  value: SimulationFormValue;
  onChange: (next: SimulationFormValue) => void;
  cdiAnnualPercent: number;
  percentOfCdi: number;
}) {
  const set = (patch: Partial<SimulationFormValue>) => onChange({ ...value, ...patch });
  const installmentAmountCents =
    value.useInstallments && value.installments >= 2 ? Math.round(value.installmentTotalCents / value.installments) : 0;

  const preview =
    value.useInstallments && value.cashPriceCents > 0 && value.installmentTotalCents > 0 && value.installments >= 2
      ? {
          impliedMonthlyRate: impliedInstallmentRate(value.cashPriceCents, value.installmentTotalCents, value.installments),
          netMonthlyRate: netMonthlyYieldRate(cdiAnnualPercent, percentOfCdi, value.installments),
        }
      : null;
  const extraCents = value.installmentTotalCents - value.cashPriceCents;

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      <div className="sm:col-span-2">
        <FieldGroup label="Descrição">
          <Input
            value={value.description}
            onChange={(e) => set({ description: e.target.value })}
            placeholder="Ex.: Viagem para Gramado"
          />
        </FieldGroup>
      </div>

      <div className="sm:col-span-2">
        <FieldGroup label="Preço à vista">
          <CurrencyInput valueCents={value.cashPriceCents} onChange={(cents) => set({ cashPriceCents: cents })} />
        </FieldGroup>
      </div>

      <div className="space-y-3 rounded-(--radius-lg) border border-dashed border-(--color-border) p-4 sm:col-span-2">
        <label className="flex cursor-pointer items-start justify-between gap-3">
          <span>
            <span className="block text-sm font-medium">Também vou considerar parcelar</span>
            <span className="block text-xs text-(--color-text-tertiary)">
              Opcional — ativa o comparativo à vista × parcelado
            </span>
          </span>
          <input
            type="checkbox"
            role="switch"
            checked={value.useInstallments}
            onChange={(e) => set({ useInstallments: e.target.checked })}
            className="mt-1 h-4 w-4 accent-(--color-primary)"
          />
        </label>

        {value.useInstallments && (
          <>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <FieldGroup label="Valor total parcelado">
                <CurrencyInput
                  valueCents={value.installmentTotalCents}
                  onChange={(cents) => set({ installmentTotalCents: cents })}
                />
              </FieldGroup>
              <FieldGroup label="Nº de parcelas">
                <Input
                  type="number"
                  min={2}
                  value={value.installments}
                  onChange={(e) => set({ installments: Math.max(2, Number(e.target.value) || 2) })}
                />
              </FieldGroup>
              <FieldGroup label="Valor da parcela">
                <Input
                  readOnly
                  value={installmentAmountCents ? formatCurrencyBRL(installmentAmountCents) : "—"}
                  className="bg-black/[0.03] text-(--color-text-secondary)"
                />
              </FieldGroup>
            </div>
            {preview && (
              <p className="flex items-start gap-2 rounded-(--radius-md) bg-(--color-warning-soft) px-3 py-2 text-xs text-(--color-text-secondary)">
                <Info size={14} className="mt-0.5 shrink-0 text-(--color-warning)" />
                <span>
                  {extraCents > 0 ? (
                    <>
                      Parcelar custa <b>{formatCurrencyBRL(extraCents)} a mais</b> (juros implícitos de{" "}
                      <b>{(preview.impliedMonthlyRate * 100).toFixed(2).replace(".", ",")}% a.m.</b>).
                    </>
                  ) : (
                    <>Parcelar não tem juros embutidos neste valor.</>
                  )}{" "}
                  A Caixinha rende {(preview.netMonthlyRate * 100).toFixed(2).replace(".", ",")}% a.m. líquido de IR.
                </span>
              </p>
            )}
          </>
        )}
      </div>

      <FieldGroup label="Data de início">
        <Input type="date" value={value.startDate} onChange={(e) => set({ startDate: e.target.value })} />
      </FieldGroup>
      {value.useInstallments && (
        <FieldGroup label="1ª parcela">
          <Input
            readOnly
            value={`${formatMonthLabel(addMonths(value.startDate.slice(0, 7), 1))} · 30 dias depois`}
            className="bg-black/[0.03] text-(--color-text-secondary)"
          />
        </FieldGroup>
      )}
    </div>
  );
}
