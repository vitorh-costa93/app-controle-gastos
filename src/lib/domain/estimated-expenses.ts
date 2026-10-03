/**
 * Gastos estimados (supermercado, combustível...): valem a média dos dois últimos meses fechados.
 *
 * "Fechado" = o mês atual do calendário e os anteriores (o app trata o mês corrente como já consolidado; o mês em
 * evolução é o seguinte). Onde a estimativa aparece:
 * - mês atual e anteriores: nunca (só o real);
 * - mês seguinte ao atual: só na Simulação, e vale o maior entre o real até agora e a estimativa;
 * - dois meses à frente em diante: na Análise e na Simulação, também pelo maior entre o real e a estimativa.
 * Sem imports para poder ser testado isoladamente.
 */

export type EstimateScope = "analysis" | "simulation";
export type EstimateMode = "none" | "simulation" | "both";

function nextMonth(referenceMonth: string): string {
  const [year, month] = referenceMonth.split("-").map(Number);
  const date = new Date(Date.UTC(year, month, 1));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

/** Em quais telas a estimativa de um mês vale, dado o mês atual do calendário. */
export function estimateModeFor(month: string, currentMonth: string): EstimateMode {
  if (month <= currentMonth) return "none";
  if (month === nextMonth(currentMonth)) return "simulation";
  return "both";
}

export function isEstimateVisible(mode: EstimateMode, scope: EstimateScope): boolean {
  return mode === "both" || (mode === "simulation" && scope === "simulation");
}

/** Média (em centavos) dos dois meses fechados. */
export function averageOfTwoMonths(a: number, b: number): number {
  return Math.round((a + b) / 2);
}

/** Quanto falta somar ao real do mês para chegar à estimativa — o maior entre os dois. */
export function estimateTopUpCents(averageCents: number, realCents: number): number {
  return Math.max(averageCents - realCents, 0);
}
