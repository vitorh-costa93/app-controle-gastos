/**
 * Regras de IPVA fixas no código (decisão do usuário): São Paulo, carro de passeio.
 * Alíquota de 4% sobre o valor FIPE, até 3 cotas mensais. O desconto à vista começa em 0% —
 * ajuste `cashDiscountPct` aqui se o estado voltar a conceder desconto no pagamento em cota única.
 */
export const IPVA_RULES = {
  uf: "SP",
  rate: 0.04,
  maxInstallments: 3,
  cashDiscountPct: 0,
  /** Mês (1-12) do vencimento da cota única / 1ª cota; o final da placa define o dia, que aqui é aproximado. */
  firstDueMonth: 1,
  dueDay: 15,
} as const;

export interface IpvaPlan {
  /** IPVA cheio (alíquota × FIPE), sem desconto. */
  fullCents: number;
  /** Valor à vista, já com o desconto (se houver). */
  cashCents: number;
  /** Valor de cada cota no parcelamento; a última absorve o resto dos centavos. */
  installmentCents: number[];
}

export function computeIpva(fipeCents: number): IpvaPlan {
  const fullCents = Math.round(fipeCents * IPVA_RULES.rate);
  const cashCents = Math.round(fullCents * (1 - IPVA_RULES.cashDiscountPct / 100));
  const base = Math.floor(fullCents / IPVA_RULES.maxInstallments);
  const installmentCents = Array.from({ length: IPVA_RULES.maxInstallments }, (_, i) =>
    i === IPVA_RULES.maxInstallments - 1 ? fullCents - base * (IPVA_RULES.maxInstallments - 1) : base
  );
  return { fullCents, cashCents, installmentCents };
}

/** Ano do próximo vencimento: depois de março, o IPVA que falta pagar é o do ano seguinte. */
export function nextIpvaYear(now: Date): number {
  return now.getMonth() + 1 > 3 ? now.getFullYear() + 1 : now.getFullYear();
}

/** Data (ISO) da cota `index` (0-based): uma por mês a partir do mês do primeiro vencimento. */
export function ipvaDueDate(year: number, index: number): string {
  const month = IPVA_RULES.firstDueMonth + index;
  return `${year}-${String(month).padStart(2, "0")}-${String(IPVA_RULES.dueDay).padStart(2, "0")}`;
}
