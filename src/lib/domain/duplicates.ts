import { Transaction } from "@/types/domain";

/**
 * Nome do estabelecimento sem a marcação de parcela ("PARC03/06", "Parcela 3/6", "03/06") e sem
 * pontuação — a mesma compra parcelada muda só o número da parcela de uma fatura para a outra.
 */
export function normalizeMerchant(description: string | null): string {
  return (description ?? "")
    .toLowerCase()
    .replace(/parc(?:ela)?\s*\d{1,2}\s*\/\s*\d{1,2}/g, " ")
    .replace(/\b\d{1,2}\s*\/\s*\d{1,2}\b/g, " ")
    .replace(/[^a-z0-9à-ú]+/g, " ")
    .trim();
}

export function sameMerchant(a: string | null, b: string | null): boolean {
  const x = normalizeMerchant(a);
  const y = normalizeMerchant(b);
  if (!x || !y) return false;
  return x === y || (Math.min(x.length, y.length) >= 6 && (x.startsWith(y) || y.startsWith(x)));
}

export const DUPLICATE_WINDOW_DAYS = 10;

/** Um lançamento que parece repetido: `original` é o mais antigo no sistema, `suspect` o cadastrado depois. */
export interface DuplicatePair {
  key: string;
  original: Transaction;
  suspect: Transaction;
  reason: string;
}

export function pairKey(aId: string, bId: string): string {
  return aId < bId ? `${aId}|${bId}` : `${bId}|${aId}`;
}

const dayDiff = (a: string, b: string) => Math.abs(new Date(a).getTime() - new Date(b).getTime()) / 86_400_000;

/**
 * Procura saídas que parecem duplicadas entre lançamentos já gravados: mesma pessoa e valor, e
 * - compra parcelada: mesma parcela X/Y do mesmo estabelecimento (a data pode variar entre faturas);
 * - demais: mesmo estabelecimento (ou ambos sem descrição, na mesma data) em até 10 dias.
 * Lançamentos de recorrência fixa ficam de fora (repetem de propósito). Pares já aprovados são ignorados.
 */
export function findDuplicatePairs(transactions: Transaction[], approvedKeys: Set<string>): DuplicatePair[] {
  const candidates = transactions.filter((t) => t.direction === "expense" && !t.recurrenceRuleId);

  const buckets = new Map<string, Transaction[]>();
  for (const t of candidates) {
    const bucket = `${t.personId}|${t.amountCents}`;
    const list = buckets.get(bucket);
    if (list) list.push(t);
    else buckets.set(bucket, [t]);
  }

  const pairs: DuplicatePair[] = [];
  for (const list of buckets.values()) {
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        const [a, b] = [list[i], list[j]];
        const key = pairKey(a.id, b.id);
        if (approvedKeys.has(key)) continue;

        let reason: string | null = null;
        if (a.installmentTotal > 1 || b.installmentTotal > 1) {
          if (
            a.installmentTotal === b.installmentTotal &&
            a.installmentCurrent === b.installmentCurrent &&
            sameMerchant(a.description, b.description)
          ) {
            reason = `Mesma parcela ${a.installmentCurrent}/${a.installmentTotal} do mesmo estabelecimento e valor`;
          }
        } else if (dayDiff(a.registrationDate, b.registrationDate) <= DUPLICATE_WINDOW_DAYS) {
          const bothEmpty = !normalizeMerchant(a.description) && !normalizeMerchant(b.description);
          if (sameMerchant(a.description, b.description)) {
            reason = "Mesmo estabelecimento, valor e data próxima";
          } else if (bothEmpty && a.registrationDate === b.registrationDate) {
            reason = "Mesmo valor e mesma data, sem descrição";
          }
        }
        if (!reason) continue;

        const [original, suspect] = a.createdAt <= b.createdAt ? [a, b] : [b, a];
        pairs.push({ key, original, suspect, reason });
      }
    }
  }
  return pairs.sort((x, y) => y.suspect.createdAt.localeCompare(x.suspect.createdAt));
}
