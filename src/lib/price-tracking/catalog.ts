import { SimulationCategory, TravelTrackerConfig, ProductTrackerConfig } from "@/types/db";

export interface AirportOption {
  code: string;
  city: string;
  state: string;
  label: string;
  distanceFromAraraquaraKm?: number;
  estimatedGroundCostCents?: number;
}

/** Aeroportos de origem próximos a Araraquara-SP */
export const ORIGIN_AIRPORTS: AirportOption[] = [
  {
    code: "RAO",
    city: "Ribeirão Preto",
    state: "SP",
    label: "Ribeirão Preto (RAO) · ~90 km",
    distanceFromAraraquaraKm: 90,
    estimatedGroundCostCents: 12000, // ~R$ 120 combustível/pedágio
  },
  {
    code: "VCP",
    city: "Campinas",
    state: "SP",
    label: "Campinas / Viracopos (VCP) · ~185 km",
    distanceFromAraraquaraKm: 185,
    estimatedGroundCostCents: 26000, // ~R$ 260 combustível/pedágio
  },
  {
    code: "CGH",
    city: "São Paulo (Congonhas)",
    state: "SP",
    label: "São Paulo / Congonhas (CGH) · ~275 km",
    distanceFromAraraquaraKm: 275,
    estimatedGroundCostCents: 42000,
  },
  {
    code: "GRU",
    city: "Guarulhos",
    state: "SP",
    label: "São Paulo / Guarulhos (GRU) · ~295 km",
    distanceFromAraraquaraKm: 295,
    estimatedGroundCostCents: 45000,
  },
];

/** Principais aeroportos de destino turístico no Brasil */
export const DESTINATION_AIRPORTS: AirportOption[] = [
  { code: "MCZ", city: "Maceió", state: "AL", label: "Maceió - AL (MCZ) · Japaratinga / Maragogi / São Miguel" },
  { code: "REC", city: "Recife", state: "PE", label: "Recife - PE (REC) · Porto de Galinhas / Maragogi / Carneiros" },
  { code: "BPS", city: "Porto Seguro", state: "BA", label: "Porto Seguro - BA (BPS) · Trancoso / Arraial d'Ajuda" },
  { code: "SSA", city: "Salvador", state: "BA", label: "Salvador - BA (SSA) · Praia do Forte / Costa do Sauípe" },
  { code: "NAT", city: "Natal", state: "RN", label: "Natal - RN (NAT) · Pipa / Ponta Negra" },
  { code: "FOR", city: "Fortaleza", state: "CE", label: "Fortaleza - CE (FOR) · Beach Park / Cumbuco" },
  { code: "JJD", city: "Jericoacoara", state: "CE", label: "Jericoacoara - CE (JJD)" },
  { code: "IOS", city: "Ilhéus", state: "BA", label: "Ilhéus - BA (IOS) · Itacaré / Cana Brava" },
  { code: "FLN", city: "Florianópolis", state: "SC", label: "Florianópolis - SC (FLN)" },
  { code: "NVT", city: "Navegantes", state: "SC", label: "Navegantes - SC (NVT) · Balneário Camboriú / Beto Carrero" },
  { code: "POA", city: "Porto Alegre", state: "RS", label: "Porto Alegre - RS (POA) · Gramado / Canela" },
  { code: "SDU", city: "Rio de Janeiro", state: "RJ", label: "Rio de Janeiro (SDU/GIG) · Búzios / Angra" },
  { code: "IGU", city: "Foz do Iguaçu", state: "PR", label: "Foz do Iguaçu - PR (IGU)" },
];

/** Termos universais proibidos na Camada 2 (Condição 100% Novo) */
export const FORBIDDEN_CONDITION_TERMS = [
  "usado",
  "seminovo",
  "semi-novo",
  "semi novo",
  "reembalado",
  "open box",
  "openbox",
  "vitrine",
  "mostruário",
  "mostruario",
  "refurbished",
  "recondicionado",
  "outlet",
  "defeito",
  "para peças",
  "retirada de peças",
  "caixa vazia",
  "apenas caixa",
];

/** Termos proibidos quando o usuário busca um console/aparelho principal (Camada 1 Anti-Acessório) */
export const CONSOLE_ACCESSORY_EXCLUSIONS = [
  "apenas controle",
  "controle avulso",
  "capa protetora",
  "película",
  "pelicula",
  "skin adesivo",
  "suporte vertical",
  "suporte parede",
  "base de carregamento",
  "cabo hdmi",
  "ventilador cooler",
  "bolsa transporte",
  "maleta",
  "conta primária",
  "conta secundaria",
  "aluguel",
  "locação",
];

/** Lojas e provedores oficiais homologados na Camada 4 */
export const OFFICIAL_PRODUCT_STORES = [
  "KaBuM!",
  "Amazon.com.br (Vendido e entregue por Amazon)",
  "Magazine Luiza (Vendido e entregue por Magalu)",
  "Mercado Livre (Loja Oficial)",
  "Fast Shop Oficial",
  "Sony Store Oficial",
  "Carrefour (Vendido por Carrefour)",
  "Casas Bahia (Vendido por Casas Bahia)",
];

export function inferCategoryFromDescription(description: string): SimulationCategory {
  const lower = description.toLocaleLowerCase("pt-BR");
  const travelHints = [
    "viagem",
    "japaratinga",
    "salinas",
    "maragogi",
    "maceió",
    "maceio",
    "resort",
    "hotel",
    "pousada",
    "gramado",
    "porto de galinhas",
    "recife",
    "natal",
    "fortaleza",
    "porto seguro",
    "trancoso",
    "salvador",
    "praia do forte",
    "all inclusive",
    "passagem",
    "voo",
    "férias",
    "ferias",
  ];
  return travelHints.some((h) => lower.includes(h)) ? "travel" : "product";
}

export function buildDefaultProductTrackerConfig(description: string): ProductTrackerConfig {
  const lower = description.toLocaleLowerCase("pt-BR");
  const isPs5 = lower.includes("playstation 5") || lower.includes("ps5");
  return {
    query: description.trim() || "PlayStation 5",
    mustInclude: isPs5 ? ["playstation 5", "ps5"] : [description.trim().split(" ")[0] ?? ""],
    mustExclude: isPs5
      ? [...FORBIDDEN_CONDITION_TERMS, ...CONSOLE_ACCESSORY_EXCLUSIONS]
      : [...FORBIDDEN_CONDITION_TERMS],
    minSanityPriceCents: isPs5 ? 260000 : 10000,
    targetCashCents: null,
    highFrequencyBlackFriday: true,
    customUrls: [],
  };
}

export function buildDefaultTravelTrackerConfig(description: string, startDate: string): TravelTrackerConfig {
  const lower = description.toLocaleLowerCase("pt-BR");
  let destinationAirport = "MCZ";
  let destinationLabel = "Maceió - AL (MCZ)";
  let accommodationName = description.trim() || "Japaratinga Lounge Resort";

  if (lower.includes("japaratinga")) {
    destinationAirport = "MCZ";
    destinationLabel = "Maceió - AL (MCZ)";
    accommodationName = "Japaratinga Lounge Resort";
  } else if (lower.includes("salinas") || lower.includes("maragogi")) {
    destinationAirport = "MCZ";
    destinationLabel = "Maceió - AL (MCZ)";
    accommodationName = "Salinas Maragogi All Inclusive Resort";
  } else if (lower.includes("gramado") || lower.includes("canela")) {
    destinationAirport = "POA";
    destinationLabel = "Porto Alegre - RS (POA)";
  } else if (lower.includes("porto de galinhas") || lower.includes("carneiros") || lower.includes("recife")) {
    destinationAirport = "REC";
    destinationLabel = "Recife - PE (REC)";
  } else if (lower.includes("porto seguro") || lower.includes("trancoso") || lower.includes("arraial")) {
    destinationAirport = "BPS";
    destinationLabel = "Porto Seguro - BA (BPS)";
  } else if (lower.includes("natal") || lower.includes("pipa")) {
    destinationAirport = "NAT";
    destinationLabel = "Natal - RN (NAT)";
  } else if (lower.includes("fortaleza") || lower.includes("beach park")) {
    destinationAirport = "FOR";
    destinationLabel = "Fortaleza - CE (FOR)";
  }

  // Padrão de 5 noites a partir da data de início
  const baseDate = /^\d{4}-\d{2}-\d{2}$/.test(startDate) ? startDate : new Date().toISOString().slice(0, 10);
  const outObj = new Date(`${baseDate}T12:00:00Z`);
  const retObj = new Date(outObj.getTime() + 5 * 86400000);
  const returnDate = retObj.toISOString().slice(0, 10);

  return {
    destinationAirport,
    destinationLabel,
    originAirports: ["RAO", "VCP"],
    accommodationName,
    outboundDate: baseDate,
    returnDate,
    adults: 2,
    children: 0,
    pets: 0,
    allowStops: true,
    highFrequencyBlackFriday: true,
    targetTotalCents: null,
    customUrls: [],
  };
}

export function formatTravelersSummary(adults = 2, children = 0, pets = 0): string {
  const parts = [`${adults} ${adults === 1 ? "adulto" : "adultos"}`];
  if (children > 0) parts.push(`${children} ${children === 1 ? "criança" : "crianças"}`);
  if (pets > 0) parts.push(`${pets} ${pets === 1 ? "pet" : "pets"}`);
  return parts.join(" · ");
}
