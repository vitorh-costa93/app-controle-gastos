import { Person, Category, TransactionType, FieldConfidence } from "@/types/db";
import { ExtractedTransactionData } from "@/types/db";
import { RawExtractedTransaction } from "./openai";

function findByName<T extends { id: string; name: string }>(
  items: T[],
  name: string | null
): T | undefined {
  if (!name) return undefined;
  const normalized = name.trim().toLowerCase();
  return (
    items.find((i) => i.name.toLowerCase() === normalized) ??
    items.find((i) => i.name.toLowerCase().includes(normalized) || normalized.includes(i.name.toLowerCase()))
  );
}

function findPersonByName(people: Person[], name: string | null) {
  return findByName(people, name);
}

function toFieldConfidence(value: string | undefined): FieldConfidence {
  return value === "alta" || value === "media" || value === "baixa" ? value : "baixa";
}

/** Resolve nomes sugeridos pela IA para ids reais do banco, sem nunca inventar. */
export function resolveExtractedTransaction(
  raw: RawExtractedTransaction,
  refs: { people: Person[]; categories: Category[]; types: TransactionType[] },
  options?: { referenceMonth?: string | null }
): { data: ExtractedTransactionData; confidence: Record<string, FieldConfidence> } {
  const person = findPersonByName(refs.people, raw.person_name);
  const category = findByName(refs.categories, raw.category_name);
  const type = findByName(refs.types, raw.type_name);

  const confidence: Record<string, FieldConfidence> = {
    date: toFieldConfidence(raw.confidence?.date),
    amount: toFieldConfidence(raw.confidence?.amount),
    category: category ? toFieldConfidence(raw.confidence?.category) : "baixa",
    origin: person ? toFieldConfidence(raw.confidence?.origin) : "baixa",
  };

  const registrationDate = raw.registration_date;
  // Fatura de cartão: o mês de referência é o do vencimento da fatura, não o da data da compra.
  const referenceMonth = options?.referenceMonth ?? (registrationDate ? registrationDate.slice(0, 7) : null);

  const data: ExtractedTransactionData = {
    registration_date: registrationDate,
    reference_month: referenceMonth,
    person_id: person?.id ?? null,
    person_name: raw.person_name,
    direction: raw.direction,
    fixed_variable: raw.fixed_variable,
    type_id: type?.id ?? null,
    type_name: raw.type_name,
    category_id: category?.id ?? null,
    category_name: raw.category_name,
    installment_current: raw.installment_current ?? 1,
    installment_total: raw.installment_total ?? 1,
    amount: raw.amount,
    description: raw.description,
  };

  return { data, confidence };
}
