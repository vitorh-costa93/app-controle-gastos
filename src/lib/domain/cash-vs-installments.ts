/**
 * Comparativo "não comprar × à vista × parcelado" sobre o saldo acumulado do orçamento, com o rendimento da
 * Caixinha do Nubank (RDB com resgate imediato).
 *
 * Modelo (mesma lógica do saldo acumulado da Análise, só que rendendo):
 * - Parte do saldo acumulado ao fim do mês anterior à compra e soma a sobra de cada mês.
 * - À vista: desconta o preço inteiro no mês da compra (mês 0). Parcelado: desconta uma parcela por mês, a partir de
 *   30 dias depois da compra (mês 1). As saídas acontecem no início do mês e a sobra entra no fim dele.
 * - Todo o saldo fica na Caixinha: rende o % do CDI informado, capitalizado ao mês, só sobre saldo positivo
 *   (saldo negativo não rende nem custa juros).
 * - IR regressivo só sobre o rendimento, por lote de dinheiro (cada sobra é um lote, o saldo inicial é o mais antigo) e
 *   com resgate do lote mais antigo primeiro: 22,5% até 180 dias, 20% de 181 a 360, 17,5% de 361 a 720, 15% acima.
 *   O IR de cada resgate sai do saldo (para receber R$ 100 líquidos resgata-se um pouco mais). O saldo final é calculado
 *   como se tudo fosse resgatado no último mês. IOF não entra: nada é resgatado com menos de 30 dias.
 *
 * Tudo em centavos (arredondado só na saída). Arquivo sem imports para poder ser testado isoladamente.
 */

export interface CashVsInstallmentInput {
  cashPriceCents: number;
  /** Total pago no parcelado (soma das parcelas). Ignorado quando installments <= 1. */
  installmentTotalCents: number;
  installments: number;
  /** CDI anual em %, ex.: 13.65. */
  cdiAnnualPercent: number;
  /** Percentual do CDI que a Caixinha paga, ex.: 100, 115, 120. */
  percentOfCdi: number;
  /** Saldo acumulado ao fim do mês anterior ao da compra. */
  openingBalanceCents: number;
  /**
   * Sobra do orçamento (sem nenhuma simulação) de cada mês, do mês da compra em diante: índice 0 = mês da compra.
   * null = mês desconhecido (além do horizonte do app): é completado com a média dos meses conhecidos.
   */
  monthlyLeftoverCents: (number | null)[];
}

export interface PortfolioScenario {
  /** Rendimento líquido de IR no período. */
  netYieldCents: number;
  irCents: number;
  /** Saldo acumulado (bruto, antes do IR do resgate final) ao fim de cada mês; índice 0 = mês da compra. */
  balanceSeriesCents: number[];
  /** Saldo final como se tudo fosse resgatado no último mês (já sem IR). */
  finalNetCents: number;
  lowestBalanceCents: number;
  /** Índice do primeiro mês com saldo negativo, ou null. */
  firstNegativeMonth: number | null;
}

export interface InstallmentAnalysis {
  scenario: PortfolioScenario;
  installmentCents: number;
  totalPaidCents: number;
  interestCents: number;
  /** Desconto do preço à vista em relação ao parcelado (0.1125 = 11,25%). */
  cashDiscount: number;
  impliedMonthlyRate: number;
  impliedAnnualRate: number;
  /** Quanto o parcelado rende a mais que o à vista (por manter o dinheiro aplicado por mais tempo). */
  extraYieldCents: number;
  /** Positivo: à vista deixa esse valor a mais no saldo final. Negativo: parcelar deixa a mais. */
  advantageCashCents: number;
  winner: "cash" | "installment" | "tie";
  /** Maior total parcelado que ainda empata com o à vista (mesmo nº de parcelas). */
  breakEvenTotalCents: number;
  breakEvenInstallmentCents: number;
  breakEvenMonthlyRate: number;
}

export interface CashVsInstallmentResult {
  /** Rendimento mensal bruto da Caixinha. */
  monthlyRate: number;
  /** Rendimento mensal depois do IR do prazo da simulação. */
  netMonthlyRate: number;
  /** Último índice de mês simulado (mês da compra = 0). */
  monthsHorizon: number;
  /** Sobra mensal usada (meses desconhecidos completados pela média); índice 0 = mês da compra. */
  leftoversCents: number[];
  none: PortfolioScenario;
  cash: PortfolioScenario;
  /** Rendimento que o à vista deixa de ganhar em relação a não comprar. */
  cashYieldLostCents: number;
  /** null quando a simulação não tem parcelado. */
  installment: (InstallmentAnalysis & { yieldLostCents: number }) | null;
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

/** Rendimento mensal líquido de IR para um prazo (em meses), na alíquota regressiva daquele prazo. */
export function netMonthlyYieldRate(cdiAnnualPercent: number, percentOfCdi: number, months: number): number {
  return monthlyYieldRate(cdiAnnualPercent, percentOfCdi) * (1 - irRateForDays(months * DAYS_PER_MONTH));
}

/** Taxa mensal (juros compostos) embutida no parcelado em relação ao preço à vista. */
export function impliedInstallmentRate(cashPriceCents: number, totalCents: number, installments: number): number {
  const installment = totalCents / installments;
  let lo = -0.2;
  let hi = 0.5;
  for (let i = 0; i < 80; i++) {
    const mid = (lo + hi) / 2;
    let pv = 0;
    for (let k = 1; k <= installments; k++) pv += installment / Math.pow(1 + mid, k);
    if (pv > cashPriceCents) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}

interface Lot {
  principal: number;
  yieldAccrued: number;
  ageMonths: number;
}

function simulatePortfolio(
  opening: number,
  leftovers: number[],
  outflows: number[],
  rate: number
): PortfolioScenario & { finalNet: number } {
  let lots: Lot[] = opening > 0 ? [{ principal: opening, yieldAccrued: 0, ageMonths: 0 }] : [];
  let deficit = opening < 0 ? -opening : 0;
  let grossYield = 0;
  let taxPaid = 0;
  const series: number[] = [];

  for (let m = 0; m < leftovers.length; m++) {
    // Saída da compra no início do mês: resgata dos lotes mais antigos; o IR do resgate também sai do saldo.
    let toPay = outflows[m] ?? 0;
    for (const lot of lots) {
      if (toPay <= 0) break;
      const balance = lot.principal + lot.yieldAccrued;
      if (balance <= 0) continue;
      const yieldShare = lot.yieldAccrued / balance;
      const irRate = irRateForDays(lot.ageMonths * DAYS_PER_MONTH);
      const netPerGross = 1 - yieldShare * irRate;
      const gross = Math.min(toPay / netPerGross, balance);
      const yieldPart = gross * yieldShare;
      taxPaid += yieldPart * irRate;
      lot.yieldAccrued -= yieldPart;
      lot.principal -= gross - yieldPart;
      toPay -= gross * netPerGross;
    }
    lots = lots.filter((lot) => lot.principal + lot.yieldAccrued > 0.005);
    deficit += toPay; // o que o saldo não cobriu vira saldo negativo

    for (const lot of lots) {
      const y = (lot.principal + lot.yieldAccrued) * rate;
      lot.yieldAccrued += y;
      grossYield += y;
      lot.ageMonths += 1;
    }

    // Sobra do mês entra no fim dele: primeiro cobre o saldo negativo, o resto vira um lote novo.
    let inflow = leftovers[m];
    if (inflow < 0) {
      deficit += -inflow;
      inflow = 0;
    }
    const covered = Math.min(deficit, inflow);
    deficit -= covered;
    inflow -= covered;
    if (inflow > 0) lots.push({ principal: inflow, yieldAccrued: 0, ageMonths: 0 });

    series.push(lots.reduce((sum, lot) => sum + lot.principal + lot.yieldAccrued, 0) - deficit);
  }

  const finalTax = lots.reduce(
    (sum, lot) => sum + lot.yieldAccrued * irRateForDays(lot.ageMonths * DAYS_PER_MONTH),
    0
  );
  const finalGross = series[series.length - 1] ?? opening;
  const firstNegative = series.findIndex((v) => v < 0);
  return {
    netYieldCents: grossYield - taxPaid - finalTax,
    irCents: taxPaid + finalTax,
    balanceSeriesCents: series,
    finalNetCents: finalGross - finalTax,
    finalNet: finalGross - finalTax,
    lowestBalanceCents: Math.min(...series),
    firstNegativeMonth: firstNegative >= 0 ? firstNegative : null,
  };
}

function round(scenario: PortfolioScenario): PortfolioScenario {
  return {
    netYieldCents: Math.round(scenario.netYieldCents),
    irCents: Math.round(scenario.irCents),
    balanceSeriesCents: scenario.balanceSeriesCents.map(Math.round),
    finalNetCents: Math.round(scenario.finalNetCents),
    lowestBalanceCents: Math.round(scenario.lowestBalanceCents),
    firstNegativeMonth: scenario.firstNegativeMonth,
  };
}

/** Completa meses desconhecidos (null) com a média dos conhecidos e garante horizon + 1 meses. */
function fillLeftovers(known: (number | null)[], length: number): number[] {
  const values = known.filter((v): v is number => v !== null);
  const average = values.length > 0 ? values.reduce((a, b) => a + b, 0) / values.length : 0;
  return Array.from({ length }, (_, i) => known[i] ?? average);
}

function installmentOutflows(totalCents: number, installments: number): number[] {
  return [0, ...Array.from({ length: installments }, () => totalCents / installments)];
}

export function compareCashVsInstallments(input: CashVsInstallmentInput): CashVsInstallmentResult {
  const { cashPriceCents: cash, installments } = input;
  const hasInstallments = installments > 1;
  const horizon = hasInstallments ? installments : 12;
  const rate = monthlyYieldRate(input.cdiAnnualPercent, input.percentOfCdi);
  const leftovers = fillLeftovers(input.monthlyLeftoverCents, horizon + 1);
  const opening = input.openingBalanceCents;

  const none = simulatePortfolio(opening, leftovers, [], rate);
  const cashScenario = simulatePortfolio(opening, leftovers, [cash], rate);

  let installment: CashVsInstallmentResult["installment"] = null;
  if (hasInstallments) {
    const total = input.installmentTotalCents;
    const inst = simulatePortfolio(opening, leftovers, installmentOutflows(total, installments), rate);
    const advantage = cashScenario.finalNet - inst.finalNet;
    const implied = impliedInstallmentRate(cash, total, installments);

    // Total que zera a vantagem: mais caro que isso, o à vista passa a ganhar.
    let lo = cash;
    let hi = Math.max(cash * 2, total * 2);
    for (let i = 0; i < 60; i++) {
      const mid = (lo + hi) / 2;
      const diff =
        cashScenario.finalNet -
        simulatePortfolio(opening, leftovers, installmentOutflows(mid, installments), rate).finalNet;
      if (diff > 0) hi = mid;
      else lo = mid;
    }
    const breakEven = (lo + hi) / 2;

    installment = {
      scenario: round(inst),
      yieldLostCents: Math.round(none.netYieldCents - inst.netYieldCents),
      installmentCents: Math.round(total / installments),
      totalPaidCents: total,
      interestCents: Math.round(total - cash),
      cashDiscount: total > 0 ? (total - cash) / total : 0,
      impliedMonthlyRate: implied,
      impliedAnnualRate: Math.pow(1 + implied, 12) - 1,
      extraYieldCents: Math.round(inst.netYieldCents - cashScenario.netYieldCents),
      advantageCashCents: Math.round(advantage),
      winner: Math.abs(advantage) < 100 ? "tie" : advantage > 0 ? "cash" : "installment",
      breakEvenTotalCents: Math.round(breakEven),
      breakEvenInstallmentCents: Math.round(breakEven / installments),
      breakEvenMonthlyRate: impliedInstallmentRate(cash, breakEven, installments),
    };
  }

  return {
    monthlyRate: rate,
    netMonthlyRate: netMonthlyYieldRate(input.cdiAnnualPercent, input.percentOfCdi, horizon),
    monthsHorizon: horizon,
    leftoversCents: leftovers.map(Math.round),
    none: round(none),
    cash: round(cashScenario),
    cashYieldLostCents: Math.round(none.netYieldCents - cashScenario.netYieldCents),
    installment,
  };
}
