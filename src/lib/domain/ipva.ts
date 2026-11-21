/**
 * Regras de IPVA fixas no código (decisão do usuário): São Paulo, carro de passeio.
 * Alíquota de 4% sobre o valor FIPE, até 5 cotas mensais (jan–mai, sem desconto; calendário Sefaz-SP).
 * Cota única em janeiro em SP tem 3% de desconto; cota única em fevereiro é sem desconto.
 */
export const IPVA_RULES = {
  uf: "SP",
  rate: 0.04,
  maxInstallments: 5,
  cashDiscountPct: 3,
  /** Taxa anual de licenciamento (CRLV-e) de referência em SP (R$ 167,74). */
  licensingCents: 16774,
  /** Mês (1-12) do vencimento da cota única / 1ª cota; o final da placa define o dia. */
  firstDueMonth: 1,
} as const;

export interface IpvaPlan {
  /** IPVA cheio (alíquota × FIPE), à vista sem desconto. */
  fullCents: number;
  /** Valor à vista com desconto. */
  cashCents: number;
  /** Valor de referência do licenciamento anual. */
  licensingCents: number;
}

export function splitInstallments(totalCents: number, count: number): number[] {
  const safeCount = Math.max(1, Math.round(count));
  const base = Math.floor(totalCents / safeCount);
  return Array.from({ length: safeCount }, (_, i) =>
    i === safeCount - 1 ? totalCents - base * (safeCount - 1) : base
  );
}

/** Todas as opções de parcelamento (2x até o máximo), sobre o valor cheio. */
export function installmentOptions(fullCents: number): { count: number; cents: number[] }[] {
  return Array.from({ length: IPVA_RULES.maxInstallments - 1 }, (_, i) => {
    const count = i + 2;
    return { count, cents: splitInstallments(fullCents, count) };
  });
}

export function computeIpva(fipeCents: number, discountPct: number = IPVA_RULES.cashDiscountPct): IpvaPlan {
  const fullCents = Math.round(fipeCents * IPVA_RULES.rate);
  const cashCents = Math.round(fullCents * (1 - discountPct / 100));
  
  return { fullCents, cashCents, licensingCents: IPVA_RULES.licensingCents };
}

/** Ano do próximo vencimento: depois de março, o IPVA que falta pagar é o do ano seguinte. */
export function nextIpvaYear(now: Date): number {
  return now.getMonth() + 1 > 3 ? now.getFullYear() + 1 : now.getFullYear();
}

/**
 * Dia do vencimento da cota única/1ª cota em SP: dias úteis consecutivos a partir da 2ª segunda-feira
 * de janeiro (final 1 = 1º dia útil ... final 0 = 10º). Ex.: 2027 → 11 a 22/01. Feriados são ignorados;
 * o PDF/guia, quando traz a data, prevalece.
 */
function ipvaJanuaryDay(year: number, plateFinalDigit?: number | null): number {
  const digit =
    plateFinalDigit === null || plateFinalDigit === undefined || !Number.isInteger(plateFinalDigit)
      ? 5
      : ((plateFinalDigit % 10) + 10) % 10;
  const nth = digit === 0 ? 10 : digit;
  const d = new Date(Date.UTC(year, 0, 11));
  while (d.getUTCDay() !== 1) d.setUTCDate(d.getUTCDate() + 1);
  let counted = 1;
  while (counted < nth) {
    d.setUTCDate(d.getUTCDate() + 1);
    if (d.getUTCDay() !== 0 && d.getUTCDay() !== 6) counted++;
  }
  return d.getUTCDate();
}

/** Data (ISO) da cota `index` (0-based): uma por mês a partir de janeiro; o final da placa define o dia. */
export function ipvaDueDate(year: number, index: number, plateFinalDigit?: number | null): string {
  const month = IPVA_RULES.firstDueMonth + index;
  const day = ipvaJanuaryDay(year, plateFinalDigit);
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/**
 * Data (ISO) aproximada do licenciamento anual em SP conforme o final da placa:
 * 1-2 → julho, 3-4 → agosto, 5-6 → setembro, 7-8 → outubro, 9 → novembro, 0 → dezembro.
 */
export function licensingDueDate(year: number, plateFinalDigit?: number | null): string {
  let month = 9;
  if (plateFinalDigit !== null && plateFinalDigit !== undefined && Number.isInteger(plateFinalDigit)) {
    const d = ((plateFinalDigit % 10) + 10) % 10;
    if (d === 1 || d === 2) month = 7;
    else if (d === 3 || d === 4) month = 8;
    else if (d === 5 || d === 6) month = 9;
    else if (d === 7 || d === 8) month = 10;
    else if (d === 9) month = 11;
    else month = 12;
  }
  return `${year}-${String(month).padStart(2, "0")}-28`;
}
