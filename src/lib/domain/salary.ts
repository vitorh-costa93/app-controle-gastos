import { addMonths } from "@/lib/utils/format";
import { Person } from "@/types/db";
import { MonthlyOccurrence } from "@/types/domain";

export interface SalaryEntry {
  referenceMonth: string; // "YYYY-MM"
  amountCents: number;
}

/** Identifica a pessoa de salário variável pelo nome cadastrado (mesmo critério usado em Configurações). */
export function findVariableSalaryPerson(people: Person[]): Person | null {
  return people.find((p) => p.name.toLowerCase().includes("jaqueline")) ?? null;
}

// ---------------------------------------------------------------------------
// Dias úteis (feriados nacionais fixos + móveis via Domingo de Páscoa)
// ---------------------------------------------------------------------------

function isoDateUTC(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function addDaysUTC(date: Date, days: number): Date {
  const d = new Date(date);
  d.setUTCDate(d.getUTCDate() + days);
  return d;
}

/** Algoritmo de Gauss para o Domingo de Páscoa. */
function easterSunday(year: number): Date {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(Date.UTC(year, month - 1, day));
}

function nationalHolidays(year: number): Set<string> {
  const easter = easterSunday(year);
  const movable = [
    addDaysUTC(easter, -47), // Carnaval (terça)
    addDaysUTC(easter, -2), // Sexta-feira Santa
    addDaysUTC(easter, 60), // Corpus Christi
  ];
  const fixed = [
    [1, 1],
    [4, 21],
    [5, 1],
    [9, 7],
    [10, 12],
    [11, 2],
    [11, 15],
    [11, 20],
    [12, 25],
  ].map(([m, d]) => new Date(Date.UTC(year, m - 1, d)));
  return new Set([...movable, ...fixed].map(isoDateUTC));
}

/** Dias úteis (seg-sex, excluindo feriados nacionais) de um mês "YYYY-MM". */
export function countBusinessDaysInMonth(referenceMonth: string): number {
  const [year, month] = referenceMonth.split("-").map(Number);
  const holidays = nationalHolidays(year);
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  let count = 0;
  for (let day = 1; day <= daysInMonth; day++) {
    const date = new Date(Date.UTC(year, month - 1, day));
    const dow = date.getUTCDay();
    if (dow === 0 || dow === 6) continue;
    if (holidays.has(isoDateUTC(date))) continue;
    count++;
  }
  return count;
}

// ---------------------------------------------------------------------------
// Projeção por média móvel (janela de até 12 meses, crescendo até completar)
// ---------------------------------------------------------------------------

/** Valor médio por dia útil, usando os meses reais cadastrados antes de `asOfMonth` (até 12). */
export function computeRollingAverageCentsPerDay(entries: SalaryEntry[], asOfMonth: string): number {
  const sorted = [...entries]
    .filter((e) => e.referenceMonth < asOfMonth)
    .sort((a, b) => a.referenceMonth.localeCompare(b.referenceMonth));
  const windowEntries = sorted.slice(-12);
  if (windowEntries.length === 0) return 0;

  const totalCents = windowEntries.reduce((sum, e) => sum + e.amountCents, 0);
  const totalDays = windowEntries.reduce((sum, e) => sum + countBusinessDaysInMonth(e.referenceMonth), 0);
  if (totalDays === 0) return 0;
  return totalCents / totalDays;
}

/** Valor bruto de um mês: real se já cadastrado, senão projetado pela média móvel × dias úteis do mês alvo. */
export function projectSalaryForMonth(entries: SalaryEntry[], targetMonth: string): number {
  const real = entries.find((e) => e.referenceMonth === targetMonth);
  if (real) return real.amountCents;
  const ratePerDay = computeRollingAverageCentsPerDay(entries, targetMonth);
  const days = countBusinessDaysInMonth(targetMonth);
  return Math.round(ratePerDay * days);
}

/**
 * Gera lançamentos projetados de salário variável para os meses futuros que ainda não
 * têm um lançamento real registrado — sem isso, Análise e Simulação simplesmente não
 * enxergavam a receita da pessoa de salário variável nos meses que ela ainda não fechou.
 * O mês seguinte ao atual nunca é projetado: por acordo, esse mês é sempre digitado
 * manualmente antes de fechar, então não deve aparecer nenhum valor estimado nele.
 */
export function buildProjectedSalaryOccurrences(params: {
  months: string[];
  currentMonth: string;
  personId: string;
  typeId: string | null;
  salaryEntries: SalaryEntry[];
  monthsWithRealIncome: Set<string>;
}): MonthlyOccurrence[] {
  const { months, currentMonth, personId, typeId, salaryEntries, monthsWithRealIncome } = params;
  const firstProjectableMonth = addMonths(currentMonth, 2);

  return months
    .filter((m) => m >= firstProjectableMonth && !monthsWithRealIncome.has(m))
    .map((m) => ({
      id: `projected-salary:${personId}:${m}`,
      origin: "projected" as const,
      registrationDate: `${m}-01`,
      referenceMonth: m,
      personId,
      direction: "income" as const,
      fixedVariable: "variable" as const,
      typeId,
      categoryId: null,
      installmentCurrent: 1,
      installmentTotal: 1,
      amountCents: projectSalaryForMonth(salaryEntries, m),
      description: "Salário estimado (projeção por dias úteis)",
      considered: true,
      recurrenceRuleId: null,
    }));
}

/** Receita bruta dos 12 meses anteriores a `targetMonth` (RBT12, não inclui o próprio mês) — real onde houver, projetada onde faltar. */
export function sumRevenueLast12Months(entries: SalaryEntry[], targetMonth: string): number {
  let sum = 0;
  let cursor = targetMonth;
  for (let i = 0; i < 12; i++) {
    cursor = addMonths(cursor, -1);
    sum += projectSalaryForMonth(entries, cursor);
  }
  return sum;
}

// ---------------------------------------------------------------------------
// Simples Nacional — Anexo V (LC 123/2006, atualizada pela LC 155/2016)
// ---------------------------------------------------------------------------

interface AnexoVBracket {
  limitCents: number;
  rate: number;
  deductionCents: number;
}

const ANEXO_V_BRACKETS: AnexoVBracket[] = [
  { limitCents: 180_000_00, rate: 0.155, deductionCents: 0 },
  { limitCents: 360_000_00, rate: 0.18, deductionCents: 4_500_00 },
  { limitCents: 720_000_00, rate: 0.195, deductionCents: 9_900_00 },
  { limitCents: 1_800_000_00, rate: 0.205, deductionCents: 17_100_00 },
  { limitCents: 3_600_000_00, rate: 0.23, deductionCents: 62_100_00 },
  { limitCents: 4_800_000_00, rate: 0.305, deductionCents: 540_000_00 },
];

/** Alíquota efetiva do Anexo V dado o RBT12 (receita bruta acumulada últimos 12 meses). */
export function calcAnexoVEffectiveRate(rbt12Cents: number): number {
  if (rbt12Cents <= 0) return ANEXO_V_BRACKETS[0].rate;
  const bracket =
    ANEXO_V_BRACKETS.find((b) => rbt12Cents <= b.limitCents) ?? ANEXO_V_BRACKETS[ANEXO_V_BRACKETS.length - 1];
  const effective = (rbt12Cents * bracket.rate - bracket.deductionCents) / rbt12Cents;
  return Math.max(effective, 0);
}

/** Imposto do mês (Simples Nacional, Anexo V) = receita do mês × alíquota efetiva do RBT12. */
export function calcAnexoVTaxCents(monthRevenueCents: number, rbt12Cents: number): number {
  const rate = calcAnexoVEffectiveRate(rbt12Cents);
  return Math.round(monthRevenueCents * rate);
}
