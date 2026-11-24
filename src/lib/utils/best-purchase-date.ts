import type { Simulation } from "@/types/domain";

export interface PurchaseFeasibility {
  label: string;
  tone: "positive" | "info" | "warning";
}

const SHORT_MONTHS_PT = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];

function formatShortMonth(monthStr: string): string {
  const parts = monthStr.split("-");
  if (parts.length < 2) return monthStr;
  const year = parts[0].slice(-2);
  const mIdx = Number(parts[1]) - 1;
  const label = SHORT_MONTHS_PT[mIdx] ?? parts[1];
  return `${label}/${year}`;
}

export interface AccumulatedPointLike {
  referenceMonth?: string;
  month?: string;
  accumulatedCents: number;
}

function canAffordCashFrom(
  series: AccumulatedPointLike[],
  startIndex: number,
  cashCents: number
): boolean {
  for (let i = startIndex; i < series.length; i++) {
    if (series[i].accumulatedCents - cashCents < 0) return false;
  }
  return true;
}

function canAffordInstallmentsFrom(
  series: AccumulatedPointLike[],
  startIndex: number,
  totalAmountCents: number,
  installments: number
): boolean {
  const n = Math.max(1, installments);
  const perMonth = Math.round(totalAmountCents / n);
  for (let i = startIndex; i < series.length; i++) {
    const paidCount = Math.min(n, i - startIndex + 1);
    const cumulativeCost = paidCount === n ? totalAmountCents : paidCount * perMonth;
    if (series[i].accumulatedCents - cumulativeCost < 0) return false;
  }
  return true;
}

/**
 * Avalia em qual mês do horizonte projetado o cenário cabe à vista ou parcelado
 * sem negativar o saldo acumulado futuro.
 */
export function computePurchaseFeasibility(
  sim: Pick<Simulation, "cashPriceCents" | "totalAmountCents" | "installments" | "startDate">,
  baseAccumulated: AccumulatedPointLike[]
): PurchaseFeasibility | null {
  if (!baseAccumulated || baseAccumulated.length === 0) return null;

  const cashCents = sim.cashPriceCents && sim.cashPriceCents > 0 ? sim.cashPriceCents : sim.totalAmountCents;
  const installments = Math.max(1, sim.installments || 1);

  let firstCashIdx = -1;
  for (let i = 0; i < baseAccumulated.length; i++) {
    if (canAffordCashFrom(baseAccumulated, i, cashCents)) {
      firstCashIdx = i;
      break;
    }
  }

  let firstInstallmentIdx = -1;
  for (let i = 0; i < baseAccumulated.length; i++) {
    if (canAffordInstallmentsFrom(baseAccumulated, i, sim.totalAmountCents, installments)) {
      firstInstallmentIdx = i;
      break;
    }
  }

  const monthOf = (idx: number) =>
    formatShortMonth(baseAccumulated[idx]?.referenceMonth ?? baseAccumulated[idx]?.month ?? "");

  if (firstCashIdx === 0) {
    return { label: "Viável à vista agora", tone: "positive" };
  }

  if (firstInstallmentIdx === 0 && firstCashIdx > 0) {
    return {
      label: `Cabe em ${installments}x agora · à vista em ${monthOf(firstCashIdx)}`,
      tone: "info",
    };
  }

  if (firstInstallmentIdx === 0) {
    return { label: `Cabe em ${installments}x agora`, tone: "info" };
  }

  if (firstCashIdx > 0) {
    return {
      label: `Viável à vista em ${monthOf(firstCashIdx)}`,
      tone: "info",
    };
  }

  if (firstInstallmentIdx > 0) {
    return {
      label: `Melhor data: ${monthOf(firstInstallmentIdx)} (${installments}x)`,
      tone: "warning",
    };
  }

  return { label: "Aperto no horizonte atual", tone: "warning" };
}
