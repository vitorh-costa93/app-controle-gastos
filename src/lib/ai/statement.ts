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
// Fatura em PDF: só a lista de lançamentos vai para a IA
// ---------------------------------------------------------------------------

const DUE_DATE_PATTERN = /Vencimento(?:\s+em)?\s*:?\s*(\d{2})[-/](\d{2})[-/](\d{4})/i;
const LIST_PAGE_PATTERN = /Transa[çc][õo]es\s+Nacionais|Subtotal\s+dos\s+lan[çc]amentos|Data\s+Estabelecimento/i;
const TRANSACTION_LINE = /^(\d{2})\/(\d{2})\s+(.+?)\s+(-?\d{1,3}(?:\.\d{3})*,\d{2})$/;

export interface PreparedStatement {
  /** Texto para a IA: só as linhas de compra (ou o texto original, se não parecer uma fatura). */
  text: string;
  /** Vencimento lido direto do texto do PDF (YYYY-MM-DD), sem depender da IA. */
  dueDate: string | null;
  isStatement: boolean;
}

/**
 * Fatura de cartão em PDF (PicPay etc.): a lista de compras fica numa página específica (no PicPay,
 * depois do resumo e do boleto) — as demais páginas são resumo, boleto e avisos. Escolhe as páginas
 * pelo conteúdo ("Transações Nacionais", "Subtotal dos lançamentos"), não por número fixo, e monta um
 * texto limpo: uma linha por compra (dia/mês, estabelecimento, valor), sem pagamento da fatura anterior,
 * subtotais nem créditos/estornos (o estorno cancela a compra original de mesmo valor).
 */
export function prepareStatementPdf(pages: { num: number; text: string }[], fullText: string): PreparedStatement {
  const due = fullText.match(DUE_DATE_PATTERN);
  const dueDate = due ? `${due[3]}-${due[2]}-${due[1]}` : null;

  const listPages = pages.filter((p) => LIST_PAGE_PATTERN.test(p.text));
  if (listPages.length === 0) return { text: fullText, dueDate, isStatement: false };

  const charges: { day: string; month: string; description: string; amount: string; cents: number }[] = [];
  const credits: { description: string; cents: number }[] = [];
  for (const page of listPages) {
    for (const rawLine of page.text.split(/\r?\n/)) {
      const match = rawLine.trim().match(TRANSACTION_LINE);
      if (!match) continue;
      const [, day, month, description, amount] = match;
      if (/PAGAMENTO\s+DE\s+FATURA|PAGAMENTO\s+RECEBIDO/i.test(description)) continue;
      const cents = Math.round(parseFloat(amount.replace(/\./g, "").replace(",", ".")) * 100);
      if (cents < 0) credits.push({ description, cents: Math.abs(cents) });
      else charges.push({ day, month, description, amount, cents });
    }
  }

  // Estorno: remove uma compra de mesmo estabelecimento e valor para cada crédito.
  for (const credit of credits) {
    const i = charges.findIndex((c) => c.description === credit.description && c.cents === credit.cents);
    if (i >= 0) charges.splice(i, 1);
  }

  const holder = fullText.split(/\r?\n/).map((l) => l.trim()).find((l) => /^[A-Za-zÀ-ú ]+,$/.test(l));
  const header = [
    "Fatura de cartão de crédito. Todas as linhas abaixo são compras no cartão (direction: expense, type_name: Cartão de crédito).",
    dueDate ? `Vencimento da fatura: ${dueDate}.` : null,
    holder ? `Titular do cartão: ${holder.replace(/,$/, "")}.` : null,
    "Formato de cada linha: DD/MM estabelecimento valor. \"PARC07/10\" no nome significa parcela 7 de 10.",
  ]
    .filter(Boolean)
    .join("\n");

  const lines = charges.map((c) => `${c.day}/${c.month} ${c.description} ${c.amount}`);
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
