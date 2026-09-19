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
