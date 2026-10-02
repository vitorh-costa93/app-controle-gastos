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
  /**
   * Compra parcelada repetida inteira: o par mostrado é o da primeira parcela (a que gera as outras) e a decisão vale
   * para o grupo todo — aprovar marca os pares de todas as parcelas, recusar exclui todas as parcelas do grupo repetido.
   */
  group?: { suspectGroupId: string; originalGroupId: string; installments: number; keys: string[] };
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
 * Cópias idênticas viram um par por cópia extra (contra a mais antiga) e uma compra parcelada repetida vira um card só,
 * na primeira parcela.
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

  const raw: DuplicatePair[] = [];
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
        raw.push({ key, original, suspect, reason });
      }
    }
  }
  return collapseGroupPairs(clusterPairs(raw, approvedKeys)).sort((x, y) => y.suspect.createdAt.localeCompare(x.suspect.createdAt));
}

/**
 * N cópias idênticas geram N·(N−1)/2 pares; basta um par por cópia extra, contra a mais antiga do conjunto
 * (decidir sobre a original já resolve as demais).
 */
function clusterPairs(raw: DuplicatePair[], approvedKeys: Set<string>): DuplicatePair[] {
  const parent = new Map<string, string>();
  const find = (id: string): string => {
    let root = parent.get(id) ?? id;
    while ((parent.get(root) ?? root) !== root) root = parent.get(root) ?? root;
    parent.set(id, root);
    return root;
  };
  const byId = new Map<string, Transaction>();
  for (const p of raw) {
    byId.set(p.original.id, p.original);
    byId.set(p.suspect.id, p.suspect);
    parent.set(find(p.original.id), find(p.suspect.id));
  }

  const components = new Map<string, Transaction[]>();
  for (const t of byId.values()) {
    const root = find(t.id);
    const list = components.get(root);
    if (list) list.push(t);
    else components.set(root, [t]);
  }

  const out: DuplicatePair[] = [];
  for (const members of components.values()) {
    members.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    const [original, ...rest] = members;
    for (const suspect of rest) {
      const key = pairKey(original.id, suspect.id);
      if (approvedKeys.has(key)) continue; // já aprovado: o conjunto pode reaparecer por outros pares ainda pendentes
      const source =
        raw.find((p) => p.key === key) ?? raw.find((p) => p.suspect.id === suspect.id || p.original.id === suspect.id);
      out.push({ key, original, suspect, reason: source?.reason ?? "Possível duplicado" });
    }
  }
  return out;
}

/** Compra parcelada repetida: um card só, na primeira parcela, valendo para todas as parcelas do grupo repetido. */
function collapseGroupPairs(pairs: DuplicatePair[]): DuplicatePair[] {
  const groups = new Map<string, DuplicatePair[]>();
  const rest: DuplicatePair[] = [];
  for (const p of pairs) {
    const { original, suspect } = p;
    if (
      suspect.installmentTotal > 1 &&
      original.installmentGroupId &&
      suspect.installmentGroupId &&
      original.installmentGroupId !== suspect.installmentGroupId
    ) {
      const groupKey = `${original.installmentGroupId}|${suspect.installmentGroupId}`;
      const list = groups.get(groupKey);
      if (list) list.push(p);
      else groups.set(groupKey, [p]);
    } else {
      rest.push(p);
    }
  }

  for (const list of groups.values()) {
    const first = list.reduce((a, b) => (b.suspect.installmentCurrent < a.suspect.installmentCurrent ? b : a));
    const count = list.length;
    rest.push({
      ...first,
      reason: `Compra parcelada repetida (${count} ${count === 1 ? "parcela" : "parcelas"}), a partir da parcela ${first.suspect.installmentCurrent}/${first.suspect.installmentTotal}`,
      group: {
        suspectGroupId: first.suspect.installmentGroupId as string,
        originalGroupId: first.original.installmentGroupId as string,
        installments: count,
        keys: list.map((p) => p.key),
      },
    });
  }
  return rest;
}
