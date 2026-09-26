import { RawExtractedTransaction } from "./openai";

/**
 * Faturas de cartão (Nubank, PicPay, Inter etc.): a data de VENCIMENTO da fatura define o mês de
 * referência de todos os lançamentos, e as compras vêm só com dia/mês — o ano é deduzido a partir do
 * vencimento (compra num mês depois do mês do vencimento = ano anterior; ex.: compra em dezembro numa
 * fatura que vence em janeiro). Feito em código, e não deixado para a IA, para não depender de palpite.
 */
export function applyStatementDueDate(
  rows: RawExtractedTransaction[],
  dueDate: string | null
): { rows: RawExtractedTransaction[]; referenceMonth: string | null } {
  const match = dueDate?.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return { rows, referenceMonth: null };
  const dueYear = Number(match[1]);
  const dueMonth = Number(match[2]);

  const fixed = rows.map((row) => {
    const date = row.registration_date?.match(/^\d{4}-(\d{2})-(\d{2})$/);
    if (!date) return row;
    const month = Number(date[1]);
    const day = Number(date[2]);
    const year = month <= dueMonth ? dueYear : dueYear - 1;
    // Dia inexistente naquele ano (ex.: 29/02 num ano não bissexto) mantém a data original.
    const candidate = new Date(Date.UTC(year, month - 1, day));
    if (candidate.getUTCMonth() !== month - 1) return row;
    return { ...row, registration_date: candidate.toISOString().slice(0, 10) };
  });

  return { rows: fixed, referenceMonth: `${match[1]}-${match[2]}` };
}

// ---------------------------------------------------------------------------
// Fatura em PDF: só a lista de lançamentos vai para a IA (qualquer banco)
// ---------------------------------------------------------------------------

const MONTH_ABBREVIATIONS: Record<string, string> = {
  jan: "01", fev: "02", mar: "03", abr: "04", mai: "05", jun: "06",
  jul: "07", ago: "08", set: "09", out: "10", nov: "11", dez: "12",
};
const MONTH_PATTERN = "jan|fev|mar|abr|mai|jun|jul|ago|set|out|nov|dez";

// "Vencimento: 05-11-2025", "Data de vencimento 10/11/2025", "Vence em 05/11/2025", "VENCIMENTO 10 NOV 2025"
const DUE_LABEL = "(?:data\\s+de\\s+)?(?:vencimento(?:\\s+em)?|vence(?:\\s+em)?)";
const DUE_NUMERIC = new RegExp(DUE_LABEL + "\\s*(?:da\\s+fatura)?\\s*:?\\s*(\\d{2})[-/.](\\d{2})[-/.](\\d{4})", "i");
const DUE_TEXTUAL = new RegExp(DUE_LABEL + "\\s*:?\\s*(\\d{1,2})\\s*(?:de\\s+)?(" + MONTH_PATTERN + ")[a-zç]*\\.?\\s*(?:de\\s+)?(\\d{4})", "i");

// Cabeçalho do PicPay em algumas extrações: "05-02-2026 | 29-01-2026" vem ANTES dos rótulos "Vencimento: Fechamento:".
const DUE_HEADER_DATES_FIRST = /(\d{2})-(\d{2})-(\d{4})\s*\|\s*\d{2}-\d{2}-\d{4}\s*Vencimento/i;

/** Vencimento da fatura (YYYY-MM-DD) lido do texto: vale para qualquer banco que imprima "Vencimento ...". */
export function detectDueDate(text: string): string | null {
  const datesFirst = text.match(DUE_HEADER_DATES_FIRST);
  if (datesFirst) return `${datesFirst[3]}-${datesFirst[2]}-${datesFirst[1]}`;
  const numeric = text.match(DUE_NUMERIC);
  if (numeric) return `${numeric[3]}-${numeric[2]}-${numeric[1]}`;
  const textual = text.match(DUE_TEXTUAL);
  if (textual) {
    const month = MONTH_ABBREVIATIONS[textual[2].toLowerCase()];
    return `${textual[3]}-${month}-${textual[1].padStart(2, "0")}`;
  }
  return null;
}

// Linha de compra: data no início (DD/MM, DD/MM/AAAA ou "12 SET") e valor no fim (com ou sem R$, sinal antes/depois, CR).
const LINE_START = new RegExp(
  "^(?:(\\d{2})/(\\d{2})(?:/(?:\\d{4}|\\d{2}))?|(\\d{1,2})\\s+(" + MONTH_PATTERN + ")\\.?(?:\\s+\\d{4})?)\\s+",
  "i"
);
const AMOUNT_END = /(-?\s*(?:R\$)?\s*-?\d{1,3}(?:\.\d{3})*,\d{2}\s*-?(?:\s*CR)?)\s*$/i;
const NON_PURCHASE = /pagamento|pagto|pgto|saldo\s+anterior|total|subtotal|cr[eé]dito\s+de|estorno\s+de\s+pagamento/i;

export interface PreparedStatement {
  /** Texto para a IA: só as linhas de compra (ou o texto original, se não parecer uma fatura). */
  text: string;
  /** Vencimento lido direto do texto do PDF (YYYY-MM-DD), sem depender da IA. */
  dueDate: string | null;
  isStatement: boolean;
}

interface StatementLine {
  day: string;
  month: string;
  description: string;
  amountText: string;
  cents: number;
}

function parseStatementLine(rawLine: string): StatementLine | null {
  const line = rawLine.trim();
  const start = line.match(LINE_START);
  const amount = line.match(AMOUNT_END);
  if (!start || !amount) return null;
  const description = line.slice(start[0].length, line.length - amount[0].length).trim();
  if (!description) return null;

  const day = (start[1] ?? start[3]).padStart(2, "0");
  const month = start[2] ?? MONTH_ABBREVIATIONS[start[4].toLowerCase()];
  const negative = /-|CR/i.test(amount[1]);
  const digits = amount[1].match(/\d{1,3}(?:\.\d{3})*,\d{2}/)![0];
  const cents = Math.round(parseFloat(digits.replace(/\./g, "").replace(",", ".")) * 100) * (negative ? -1 : 1);
  return { day, month, description, amountText: digits, cents };
}

/**
 * Fatura de cartão em PDF (PicPay, Nubank, Inter, Itaú, C6, Santander...): a lista de compras fica em
 * algumas páginas — as demais são resumo, boleto e avisos. Acha as páginas pelo conteúdo (várias linhas
 * "data + estabelecimento + valor"), não por número fixo, e monta um texto limpo: uma linha por compra,
 * sem pagamento da fatura anterior, saldo, subtotais e créditos/estornos (o estorno cancela a compra
 * original de mesmo valor). Se o layout não for reconhecido, devolve o texto original e a IA se vira
 * como antes — só o vencimento continua sendo lido do texto.
 */
export function prepareStatementPdf(pages: { num: number; text: string }[], fullText: string): PreparedStatement {
  const dueDate = detectDueDate(fullText);

  const charges: StatementLine[] = [];
  const credits: StatementLine[] = [];
  let listPageCount = 0;
  for (const page of pages) {
    const parsed = page.text
      .split(/\r?\n/)
      .map(parseStatementLine)
      .filter((l): l is StatementLine => l !== null);
    if (parsed.length < 3) continue; // página de resumo/boleto/avisos
    listPageCount += 1;
    for (const line of parsed) {
      if (NON_PURCHASE.test(line.description)) continue;
      if (line.cents < 0) credits.push({ ...line, cents: -line.cents });
      else charges.push(line);
    }
  }
  if (listPageCount === 0 || charges.length < 3) return { text: fullText, dueDate, isStatement: false };

  // Estorno: remove uma compra de mesmo estabelecimento e valor para cada crédito.
  for (const credit of credits) {
    const i = charges.findIndex((c) => c.description === credit.description && c.cents === credit.cents);
    if (i >= 0) charges.splice(i, 1);
  }

  const holder = fullText
    .split(/\r?\n/)
    .map((l) => l.trim())
    .find((l) => /^[A-Za-zÀ-ú ]+,$/.test(l));
  const header = [
    "Fatura de cartão de crédito. Todas as linhas abaixo são compras no cartão (direction: expense, type_name: Cartão de crédito).",
    dueDate ? `Vencimento da fatura: ${dueDate}.` : null,
    holder ? `Titular do cartão: ${holder.replace(/,$/, "")}.` : null,
    'Formato de cada linha: DD/MM estabelecimento valor. "PARC07/10" ou "Parcela 7/10" no nome significa parcela 7 de 10.',
  ]
    .filter(Boolean)
    .join("\n");

  const lines = charges.map((c) => `${c.day}/${c.month} ${c.description} ${c.amountText}`);
  return { text: `${header}\n\n${lines.join("\n")}`, dueDate, isStatement: true };
}

/** "PARC07/10", "PARCELA 3/12", "3/12" no fim do nome: preenche a parcela quando a IA não preencheu. */
export function applyInstallmentHints(rows: RawExtractedTransaction[]): RawExtractedTransaction[] {
  return rows.map((row) => {
    if ((row.installment_total ?? 1) > 1) return row;
    const match = row.description?.match(/PARC(?:ELA)?\s*(\d{1,2})\s*\/\s*(\d{1,2})/i);
    if (!match) return row;
    const current = Number(match[1]);
    const total = Number(match[2]);
    if (total < 2 || current < 1 || current > total) return row;
    return { ...row, installment_current: current, installment_total: total };
  });
}
