export type DescriptionSymbol = {
  key: "nails" | "eyebrows" | "trainer" | "gym" | "hair" | "beauty" | "massage" | "pilates" | "nutrition" | "therapy" | "dentist" | "physio" | "cleaning" | "repair" | "pet" | "fuel" | "market" | "food" | "internet" | "phone" | "insurance" | "transport" | "pharmacy" | "energy" | "water";
  tone: "rose" | "violet" | "blue" | "green" | "amber";
};

/** Visual hints only. Never changes classification, amount, person or bank. */
export function getDescriptionSymbol(description: string): DescriptionSymbol | null {
  const value = description.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  if (/\bunhas?\b|\bmanicure\b|\bpedicure\b|\besmaltacao\b/.test(value)) return { key: "nails", tone: "rose" };
  if (/\bsobrancelhas?\b/.test(value)) return { key: "eyebrows", tone: "rose" };
  if (/\bpersonal(?:[\s-]+trainer)?\b|\btreinador(?:a)?\b/.test(value)) return { key: "trainer", tone: "violet" };
  if (/\bcabel(?:o|os|eireir[ao])\b|\bbarbeir[ao]\b|\bbarbearia\b|\bcorte de cabelo\b/.test(value)) return { key: "hair", tone: "violet" };
  if (/\bmassag(?:em|ens|ista)\b/.test(value)) return { key: "massage", tone: "rose" };
  if (/\bpilates\b|\byoga\b|\bioga\b/.test(value)) return { key: "pilates", tone: "violet" };
  if (/\bnutri(?:cionista|cao)?\b/.test(value)) return { key: "nutrition", tone: "green" };
  if (/\bterapia\b|\bpsicolog\w*\b/.test(value)) return { key: "therapy", tone: "rose" };
  if (/\bdentist[ao]\b|\bodontolog\w*\b|\b(?:limpeza|aparelho) dental\b/.test(value)) return { key: "dentist", tone: "blue" };
  if (/\bfisio(?:terapia|terapeuta)?\b/.test(value)) return { key: "physio", tone: "blue" };
  if (/\bacademia\b|\bmusculacao\b|\bfitness\b/.test(value)) return { key: "gym", tone: "violet" };
  if (/\bdepilacao\b|\bestetica\b|\bcuidados esteticos\b|\bbeleza\b|\bskincare\b|\blimpeza de pele\b/.test(value)) return { key: "beauty", tone: "rose" };
  if (/\bfaxina\b|\bdiarista\b|\blimpeza (?:da casa|residencial)\b/.test(value)) return { key: "cleaning", tone: "blue" };
  if (/\bencanador\b|\beletricista\b|\bconserto\b|\breparo\b/.test(value)) return { key: "repair", tone: "amber" };
  if (/\bpet(?:shop)?\b|\bveterinari[ao]\b|\bracao\b|\bbanho e tosa\b/.test(value)) return { key: "pet", tone: "amber" };
  if (/\bdrogaria\b|\bfarmacia\b|\bmedicamento\b/.test(value)) return { key: "pharmacy", tone: "rose" };
  if (/\bcombustivel\b|\bgasolina\b|\betanol\b|\babastecimento\b/.test(value)) return { key: "fuel", tone: "green" };
  if (/\buber\b|\b99\b|\btaxi\b/.test(value)) return { key: "transport", tone: "green" };
  if (/\bsupermercado\b|\bmercado\b|\batacadao\b/.test(value)) return { key: "market", tone: "green" };
  if (/\brestaurante\b|\bdelivery\b|\blanchonete\b|\balmoco\b|\bjantar\b/.test(value)) return { key: "food", tone: "amber" };
  if (/\binternet\b|\bfibra\b/.test(value)) return { key: "internet", tone: "blue" };
  if (/\bcelular\b|\btelefonia\b/.test(value)) return { key: "phone", tone: "blue" };
  if (/\bluz\b|\benergia\b/.test(value)) return { key: "energy", tone: "amber" };
  if (/\bagua\b/.test(value)) return { key: "water", tone: "blue" };
  if (/\bseguro\b/.test(value)) return { key: "insurance", tone: "blue" };
  return null;
}
