export function formatCurrencyBRL(amountInCents: number): string {
  return (amountInCents / 100).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

export function formatCompactPercent(value: number, digits = 1): string {
  const sign = value > 0 ? "+" : value < 0 ? "" : "";
  return `${sign}${value.toFixed(digits).replace(".", ",")}%`;
}

export function formatMonthLabel(referenceMonth: string): string {
  const [year, month] = referenceMonth.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, 1));
  const label = date.toLocaleDateString("pt-BR", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
  return label.charAt(0).toUpperCase() + label.slice(1);
}

export function formatMonthShort(referenceMonth: string): string {
  const [year, month] = referenceMonth.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, 1));
  const label = date.toLocaleDateString("pt-BR", {
    month: "short",
    timeZone: "UTC",
  });
  return label.replace(".", "").replace(/^\w/, (c) => c.toUpperCase());
}

/**
 * "2027-11" -> "Nov/27" — usado em gráficos com horizonte de mais de 12 meses
 * (Simulação), onde o mesmo mês abreviado ("Out", "Dez"...) aparece mais de uma vez
 * sem indicar o ano, deixando o eixo ambíguo sobre a ordem cronológica dos pontos.
 */
export function formatMonthShortWithYear(referenceMonth: string): string {
  const [year] = referenceMonth.split("-");
  return `${formatMonthShort(referenceMonth)}/${year.slice(2)}`;
}

export function formatDateBR(isoDate: string): string {
  const [year, month, day] = isoDate.split("-").map(Number);
  return `${String(day).padStart(2, "0")}/${String(month).padStart(2, "0")}/${year}`;
}

/** "2026-09-12" -> "09/2026" (reference month already stored as "2026-09") */
export function formatReferenceMonthShort(referenceMonth: string): string {
  const [year, month] = referenceMonth.split("-");
  return `${month}/${year}`;
}

/** Adds `count` months to a "YYYY-MM" reference month string. */
export function addMonths(referenceMonth: string, count: number): string {
  const [year, month] = referenceMonth.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1 + count, 1));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

/** Returns "YYYY-MM" for a given Date (UTC-safe, uses local calendar fields). */
export function toReferenceMonth(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

export function toISODate(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

/** Soma meses a uma data "YYYY-MM-DD", limitando o dia ao último dia do mês de destino (31/01 + 1 → 28/02). */
export function addMonthsToISODate(isoDate: string, count: number): string {
  const [year, month, day] = isoDate.split("-").map(Number);
  const target = new Date(Date.UTC(year, month - 1 + count, 1));
  const lastDay = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  return `${target.getUTCFullYear()}-${String(target.getUTCMonth() + 1).padStart(2, "0")}-${String(
    Math.min(day, lastDay)
  ).padStart(2, "0")}`;
}
