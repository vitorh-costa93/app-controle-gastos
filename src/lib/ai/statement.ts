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
