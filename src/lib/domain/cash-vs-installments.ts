/**
 * Comparativo "à vista × parcelado" usando o rendimento da Caixinha do Nubank (RDB com resgate imediato).
 *
 * Premissas:
 * - O rendimento é o % do CDI informado (100% padrão; 115%/120% nas Turbo), capitalizado ao mês a partir do CDI anual.
 * - Parcelado: o dinheiro do preço à vista fica aplicado e cada parcela é resgatada 30 dias após a anterior; a 1ª
 *   parcela vence 30 dias depois da data da compra (que seria o pagamento à vista).
 * - IR regressivo só sobre o rendimento: 22,5% até 180 dias, 20% de 181 a 360, 17,5% de 361 a 720, 15% acima.
 *   IOF (resgate em menos de 30 dias) não entra: todo resgate aqui é de 30 dias ou mais.
 * - Se o saldo aplicado acabar antes da última parcela, o que faltar sai do orçamento (não rende nem custa juros).
 *
 * Tudo em centavos (arredondado só na saída). Arquivo sem imports para poder ser testado isoladamente.
 */

export interface CashVsInstallmentInput {
  cashPriceCents: number;
  /** Total pago no parcelado (soma das parcelas). */
  installmentTotalCents: number;
  installments: number;
  /** CDI anual em %, ex.: 13.65. */
  cdiAnnualPercent: number;
  /** Percentual do CDI que a Caixinha paga, ex.: 100, 115, 120. */
  percentOfCdi: number;
}

export interface CashVsInstallmentMonth {
  /** 1 = primeira parcela (30 dias depois da compra). */
  index: number;
  installmentCents: number;
  /** Saldo na Caixinha depois de pagar a parcela (negativo = faltou dinheiro aplicado; sai do orçamento). */
  balanceCents: number;
  yieldCents: number;
  /** Rendimento líquido de IR já realizado até esta parcela. */
  accumulatedNetYieldCents: number;
  /** Juros embutidos acumulados no parcelamento (linha reta, proporcional às parcelas pagas). */
  accumulatedInterestCents: number;
}

export interface IdleMilestone {
  months: number;
  netYieldCents: number;
  irRate: number;
}

export interface CashVsInstallmentResult {
  monthlyRate: number;
  monthsHorizon: number;
  /** Se o dinheiro não for gasto: fica aplicado durante o mesmo período. */
  idle: {
    grossYieldCents: number;
    irCents: number;
    irRate: number;
    netYieldCents: number;
    finalCents: number;
    series: { month: number; netBalanceCents: number }[];
    milestones: IdleMilestone[];
  };
  cash: { totalPaidCents: number; realCostCents: number };
  installment: {
    totalPaidCents: number;
    interestCents: number;
    netYieldCents: number;
    netCostCents: number;
    realCostCents: number;
    impliedMonthlyRate: number;
    impliedAnnualRate: number;
    months: CashVsInstallmentMonth[];
  };
  /** Positivo: à vista economiza esse valor. Negativo: parcelar economiza. */
  advantageCashCents: number;
  winner: "cash" | "installment" | "tie";
  /** Maior total parcelado que ainda empata com o à vista (mesmo nº de parcelas). */
  breakEvenTotalCents: number;
  breakEvenInstallmentCents: number;
  breakEvenMonthlyRate: number;
}

const DAYS_PER_MONTH = 30;

export function irRateForDays(days: number): number {
  if (days <= 180) return 0.225;
  if (days <= 360) return 0.2;
  if (days <= 720) return 0.175;
  return 0.15;
}

export function monthlyYieldRate(cdiAnnualPercent: number, percentOfCdi: number): number {
  const cdiMonthly = Math.pow(1 + cdiAnnualPercent / 100, 1 / 12) - 1;
  return cdiMonthly * (percentOfCdi / 100);
}

/** Rendimento líquido de um depósito único resgatado depois de `months` meses. */
function idleNetYield(principal: number, months: number, rate: number) {
  const gross = principal * (Math.pow(1 + rate, months) - 1);
  const irRate = irRateForDays(months * DAYS_PER_MONTH);
  return { gross, irRate, ir: gross * irRate, net: gross * (1 - irRate) };
}

/** Simula o parcelado: dinheiro aplicado, resgatando uma parcela por mês (IR sobre a fatia de rendimento de cada resgate). */
function simulateInstallments(cashPrice: number, total: number, installments: number, rate: number) {
  const installment = total / installments;
  let balance = cashPrice;
  let principalLeft = cashPrice;
  let netYield = 0;
  const months: CashVsInstallmentMonth[] = [];

  for (let k = 1; k <= installments; k++) {
    const yieldThisMonth = balance > 0 ? balance * rate : 0;
    balance += yieldThisMonth;

    const withdrawn = Math.min(installment, Math.max(balance, 0));
    if (withdrawn > 0 && balance > 0) {
      const yieldShare = Math.max(balance - principalLeft, 0) / balance;
      const irRate = irRateForDays(k * DAYS_PER_MONTH);
      netYield += withdrawn * yieldShare * (1 - irRate);
      principalLeft -= withdrawn * (1 - yieldShare);
    }
    balance -= installment;

    months.push({
      index: k,
      installmentCents: installment,
      balanceCents: balance,
      yieldCents: yieldThisMonth,
      accumulatedNetYieldCents: netYield,
      accumulatedInterestCents: ((total - cashPrice) * k) / installments,
    });
  }
  return { netYield, months };
}

/** Taxa mensal (equivalente a juros compostos) embutida no parcelado em relação ao preço à vista. */
function impliedRate(cashPrice: number, total: number, installments: number): number {
  const installment = total / installments;
  let lo = -0.2;
  let hi = 0.5;
  for (let i = 0; i < 80; i++) {
    const mid = (lo + hi) / 2;
    let pv = 0;
    for (let k = 1; k <= installments; k++) pv += installment / Math.pow(1 + mid, k);
    if (pv > cashPrice) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}

function breakEvenTotal(cashPrice: number, installments: number, rate: number): number {
  let lo = cashPrice;
  let hi = cashPrice * 2;
  for (let i = 0; i < 60; i++) {
    const mid = (lo + hi) / 2;
    const gain = simulateInstallments(cashPrice, mid, installments, rate).netYield;
    if (mid - cashPrice > gain) hi = mid;
    else lo = mid;
  }
  return (lo + hi) / 2;
}

export function compareCashVsInstallments(input: CashVsInstallmentInput): CashVsInstallmentResult {
  const { cashPriceCents: cash, installmentTotalCents: total, installments } = input;
  const rate = monthlyYieldRate(input.cdiAnnualPercent, input.percentOfCdi);
  const horizon = installments > 1 ? installments : 12;

  const idle = idleNetYield(cash, horizon, rate);
  const series = Array.from({ length: horizon + 1 }, (_, k) => ({
    month: k,
    netBalanceCents: Math.round(idleNetYield(cash, k, rate).net),
  }));
  const milestoneMonths = [...new Set([3, 6, 12, horizon])].sort((a, b) => a - b);
  const milestones = milestoneMonths.map((months) => {
    const y = idleNetYield(cash, months, rate);
    return { months, netYieldCents: Math.round(y.net), irRate: y.irRate };
  });

  const sim = simulateInstallments(cash, total, installments, rate);
  const interest = total - cash;
  const installmentNetCost = total - sim.netYield;
  const cashRealCost = cash + idle.net;
  const installmentRealCost = total + (idle.net - sim.netYield);
  const advantage = installmentRealCost - cashRealCost;
  const implied = impliedRate(cash, total, installments);
  const breakEven = breakEvenTotal(cash, installments, rate);

  return {
    monthlyRate: rate,
    monthsHorizon: horizon,
    idle: {
      grossYieldCents: Math.round(idle.gross),
      irCents: Math.round(idle.ir),
      irRate: idle.irRate,
      netYieldCents: Math.round(idle.net),
      finalCents: Math.round(cash + idle.net),
      series,
      milestones,
    },
    cash: { totalPaidCents: cash, realCostCents: Math.round(cashRealCost) },
    installment: {
      totalPaidCents: total,
      interestCents: Math.round(interest),
      netYieldCents: Math.round(sim.netYield),
      netCostCents: Math.round(installmentNetCost),
      realCostCents: Math.round(installmentRealCost),
      impliedMonthlyRate: implied,
      impliedAnnualRate: Math.pow(1 + implied, 12) - 1,
      months: sim.months.map((m) => ({
        ...m,
        installmentCents: Math.round(m.installmentCents),
        balanceCents: Math.round(m.balanceCents),
        yieldCents: Math.round(m.yieldCents),
        accumulatedNetYieldCents: Math.round(m.accumulatedNetYieldCents),
        accumulatedInterestCents: Math.round(m.accumulatedInterestCents),
      })),
    },
    advantageCashCents: Math.round(advantage),
    winner: Math.abs(advantage) < 100 ? "tie" : advantage > 0 ? "cash" : "installment",
    breakEvenTotalCents: Math.round(breakEven),
    breakEvenInstallmentCents: Math.round(breakEven / installments),
    breakEvenMonthlyRate: impliedRate(cash, breakEven, installments),
  };
}
