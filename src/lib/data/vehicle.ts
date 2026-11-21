"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  computeIpva,
  ipvaDueDate,
  licensingDueDate as defaultLicensingDueDate,
  nextIpvaYear,
  splitInstallments,
  IPVA_RULES,
} from "@/lib/domain/ipva";
import { extractPdfText } from "@/lib/pdf/extract";
import { extractVehicleLicensingFromPdfText, isAiConfigured } from "@/lib/ai/openai";
import { createSimulation, deleteSimulation } from "./simulations";
import { createRecurrenceRule } from "./recurrence";

const VEHICLE_KEY = "vehicle";
const FIPE_BASE = "https://parallelum.com.br/fipe/api/v1/carros/marcas";

export interface FipeOption {
  code: string;
  name: string;
}

export type IpvaChoiceOption = "cash" | "cash_discount" | "cash_full" | "installments";

/** Veículo escolhido em Configurações e o último valor FIPE consultado. */
export interface VehicleSettings {
  brandId: string;
  brandName: string;
  modelId: string;
  modelName: string;
  yearId: string;
  yearName: string;
  fipeCents: number;
  /** Mês de referência da tabela FIPE (ex.: "outubro de 2026"). */
  fipeMonth: string;
  fipeCode: string;
  fetchedAt: string;
  /** Simulações do IPVA ainda não decididas (à vista e parcelado). */
  ipvaSimulationIds: string[];
  /** Decisão já tomada: opção e ano, para não simular de novo sem querer. */
  ipvaChosen: { option: IpvaChoiceOption; year: number } | null;
}

export interface VehiclePdfAnalysis {
  vehicleSummary: string;
  plate: string | null;
  plateFinalDigit: number | null;
  uf: string;
  year: number;
  fipeCents: number | null;
  fipeMatched: boolean;
  cashWithDiscountCents: number | null;
  cashWithoutDiscountCents: number | null;
  installmentCount: number;
  installmentCents: number[] | null;
  licensingCents: number;
  licensingFromPdf: boolean;
  ipvaFirstDueDate: string;
  licensingDueDate: string;
  notes: string;
  vehicle: VehicleSettings | null;
}

async function fipeGet<T>(path: string): Promise<T> {
  const res = await fetch(`${FIPE_BASE}${path}`, {
    next: { revalidate: 86_400 },
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw new Error("Não foi possível consultar a tabela FIPE agora.");
  const json = (await res.json()) as T & { error?: string };
  if (json && typeof json === "object" && "error" in json && json.error) {
    throw new Error("A tabela FIPE não encontrou esse veículo.");
  }
  return json;
}

export async function listFipeBrands(): Promise<FipeOption[]> {
  const rows = await fipeGet<{ codigo: string; nome: string }[]>("");
  return rows.map((r) => ({ code: String(r.codigo), name: r.nome }));
}

export async function listFipeModels(brandId: string): Promise<FipeOption[]> {
  const data = await fipeGet<{ modelos: { codigo: number | string; nome: string }[] }>(`/${brandId}/modelos`);
  return data.modelos.map((r) => ({ code: String(r.codigo), name: r.nome }));
}

export async function listFipeYears(brandId: string, modelId: string): Promise<FipeOption[]> {
  const rows = await fipeGet<{ codigo: string; nome: string }[]>(`/${brandId}/modelos/${modelId}/anos`);
  return rows.map((r) => ({ code: String(r.codigo), name: r.nome }));
}

/** "R$ 45.000,00" → 4500000 */
function parseBRLToCents(value: string): number {
  const normalized = value.replace(/[^\d,]/g, "").replace(",", ".");
  return Math.round(parseFloat(normalized) * 100);
}

function normalizeText(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const BRAND_ALIASES: Record<string, string> = {
  gm: "chevrolet",
  vw: "volkswagen",
  mb: "mercedes benz",
  mmc: "mitsubishi",
  caoa: "chery",
};

async function tryMatchFipeVehicle(
  brandRaw: string | null,
  modelRaw: string | null,
  yearModel: number | null,
  fuelRaw: string | null
): Promise<VehicleSettings | null> {
  if (!brandRaw || !modelRaw) return null;
  try {
    const brands = await listFipeBrands();
    const normBrand = normalizeText(brandRaw);
    const aliasedBrand = BRAND_ALIASES[normBrand] ?? normBrand;
    const brand =
      brands.find((b) => normalizeText(b.name) === aliasedBrand) ??
      brands.find((b) => normalizeText(b.name).includes(aliasedBrand) || aliasedBrand.includes(normalizeText(b.name)));
    if (!brand) return null;

    const models = await listFipeModels(brand.code);
    const modelTokens = normalizeText(modelRaw).split(" ").filter((t) => t.length >= 2);
    if (modelTokens.length === 0) return null;

    let bestModel: FipeOption | null = null;
    let bestScore = 0;
    for (const m of models) {
      const mNorm = normalizeText(m.name);
      let score = 0;
      for (const token of modelTokens) {
        if (mNorm.includes(token)) score += token.length;
      }
      if (score > bestScore) {
        bestScore = score;
        bestModel = m;
      }
    }
    if (!bestModel || bestScore === 0) return null;

    const years = await listFipeYears(brand.code, bestModel.code);
    if (years.length === 0) return null;

    const yearStr = yearModel ? String(yearModel) : "";
    const fuelNorm = fuelRaw ? normalizeText(fuelRaw) : "";
    const year =
      years.find((y) => yearStr && y.name.includes(yearStr) && (!fuelNorm || normalizeText(y.name).includes(fuelNorm))) ??
      years.find((y) => yearStr && y.name.includes(yearStr)) ??
      years[0];
    if (!year) return null;

    const saved = await saveVehicle({
      brandId: brand.code,
      brandName: brand.name,
      modelId: bestModel.code,
      modelName: bestModel.name,
      yearId: year.code,
      yearName: year.name,
    });
    return saved.ok ? saved.vehicle : null;
  } catch {
    return null;
  }
}

export async function getVehicle(): Promise<VehicleSettings | null> {
  const { data, error } = await createAdminClient()
    .from("app_settings")
    .select("value")
    .eq("key", VEHICLE_KEY)
    .maybeSingle();
  if (error || !data?.value) return null;
  const v = data.value as Partial<VehicleSettings>;
  if (!v.brandId || !v.modelId || !v.yearId || typeof v.fipeCents !== "number") return null;
  return { ...(v as VehicleSettings), ipvaSimulationIds: v.ipvaSimulationIds ?? [], ipvaChosen: v.ipvaChosen ?? null };
}

async function writeVehicle(vehicle: VehicleSettings): Promise<boolean> {
  const { error } = await createAdminClient()
    .from("app_settings")
    .upsert({ key: VEHICLE_KEY, value: vehicle, updated_at: new Date().toISOString() });
  if (error) console.error("writeVehicle failed:", error);
  return !error;
}

/** Salva o veículo e busca o valor FIPE atual dele. Também serve para "atualizar o valor". */
export async function saveVehicle(selection: {
  brandId: string;
  brandName: string;
  modelId: string;
  modelName: string;
  yearId: string;
  yearName: string;
}): Promise<{ ok: true; vehicle: VehicleSettings } | { ok: false; error: string }> {
  try {
    const price = await fipeGet<{ Valor: string; MesReferencia: string; CodigoFipe: string }>(
      `/${selection.brandId}/modelos/${selection.modelId}/anos/${selection.yearId}`
    );
    const fipeCents = parseBRLToCents(price.Valor);
    if (!Number.isFinite(fipeCents) || fipeCents <= 0) return { ok: false, error: "Valor FIPE inválido." };

    const previous = await getVehicle();
    const sameVehicle =
      previous?.brandId === selection.brandId &&
      previous.modelId === selection.modelId &&
      previous.yearId === selection.yearId;
    const vehicle: VehicleSettings = {
      ...selection,
      fipeCents,
      fipeMonth: price.MesReferencia.trim(),
      fipeCode: price.CodigoFipe,
      fetchedAt: new Date().toISOString(),
      ipvaSimulationIds: sameVehicle ? previous.ipvaSimulationIds : [],
      ipvaChosen: sameVehicle ? previous.ipvaChosen : null,
    };
    if (!(await writeVehicle(vehicle))) return { ok: false, error: "Não foi possível salvar o veículo." };
    revalidatePath("/configuracoes");
    return { ok: true, vehicle };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Não foi possível consultar a FIPE." };
  }
}

/**
 * Recebe o PDF do licenciamento (CRLV-e ou guia de IPVA), extrai os dados via IA,
 * consulta a FIPE quando necessário e calcula à vista c/ desconto, à vista s/ desconto,
 * parcelado e licenciamento.
 */
export async function analyzeVehiclePdf(
  formData: FormData
): Promise<{ ok: true; analysis: VehiclePdfAnalysis } | { ok: false; error: string }> {
  if (!isAiConfigured()) {
    return { ok: false, error: "IA não configurada (OPENAI_API_KEY ausente)." };
  }
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return { ok: false, error: "Selecione um arquivo PDF válido." };
  }
  if (file.size > 10 * 1024 * 1024) {
    return { ok: false, error: "O PDF ultrapassa o limite de 10 MB." };
  }

  try {
    const buffer = Buffer.from(await file.arrayBuffer());
    const parsed = await extractPdfText(buffer);
    if (parsed.text.trim().length < 20) {
      return {
        ok: false,
        error:
          "Não foi possível ler texto desse PDF (ele pode ser uma imagem escaneada). Tente outro PDF ou selecione o carro manualmente.",
      };
    }

    const extracted = await extractVehicleLicensingFromPdfText(parsed.text);
    const matchedVehicle = await tryMatchFipeVehicle(
      extracted.brand,
      extracted.model,
      extracted.year_model,
      extracted.fuel
    );

    const pdfFipeCents =
      extracted.fipe_value_brl && extracted.fipe_value_brl > 0 ? Math.round(extracted.fipe_value_brl * 100) : null;
    const fipeCents = matchedVehicle?.fipeCents ?? pdfFipeCents;

    const year = extracted.exercise_year && extracted.exercise_year >= 2024 ? extracted.exercise_year : nextIpvaYear(new Date());
    const uf = (extracted.uf || IPVA_RULES.uf).toUpperCase();
    const plateDigit = extracted.plate_final_digit;

    const plan = fipeCents ? computeIpva(fipeCents) : null;

    const cashWithoutDiscountCents =
      extracted.ipva_cash_without_discount_brl && extracted.ipva_cash_without_discount_brl > 0
        ? Math.round(extracted.ipva_cash_without_discount_brl * 100)
        : plan?.fullCents ?? null;

    const cashWithDiscountCents =
      extracted.ipva_cash_with_discount_brl && extracted.ipva_cash_with_discount_brl > 0
        ? Math.round(extracted.ipva_cash_with_discount_brl * 100)
        : cashWithoutDiscountCents !== null
          ? Math.round(cashWithoutDiscountCents * (1 - IPVA_RULES.cashDiscountPct / 100))
          : null;

    const installmentCount =
      extracted.ipva_installment_count && extracted.ipva_installment_count > 1
        ? Math.round(extracted.ipva_installment_count)
        : IPVA_RULES.maxInstallments;

    let installmentCents: number[] | null = null;
    if (extracted.ipva_installment_amount_brl && extracted.ipva_installment_amount_brl > 0) {
      const perInstallment = Math.round(extracted.ipva_installment_amount_brl * 100);
      installmentCents = Array.from({ length: installmentCount }, () => perInstallment);
    } else if (cashWithoutDiscountCents !== null) {
      installmentCents = splitInstallments(cashWithoutDiscountCents, installmentCount);
    }

    const licensingFromPdf = Boolean(extracted.licensing_fee_brl && extracted.licensing_fee_brl > 0);
    const licensingCents = licensingFromPdf
      ? Math.round((extracted.licensing_fee_brl ?? 0) * 100)
      : IPVA_RULES.licensingCents;

    const ipvaFirstDueDate = extracted.ipva_first_due_date || ipvaDueDate(year, 0, plateDigit);
    const licensingDueDate = extracted.licensing_due_date || defaultLicensingDueDate(year, plateDigit);

    return {
      ok: true,
      analysis: {
        vehicleSummary: matchedVehicle
          ? `${matchedVehicle.brandName} ${matchedVehicle.modelName} · ${matchedVehicle.yearName}`
          : extracted.vehicle_summary,
        plate: extracted.plate,
        plateFinalDigit: plateDigit,
        uf,
        year,
        fipeCents,
        fipeMatched: Boolean(matchedVehicle),
        cashWithDiscountCents,
        cashWithoutDiscountCents,
        installmentCount,
        installmentCents,
        licensingCents,
        licensingFromPdf,
        ipvaFirstDueDate,
        licensingDueDate,
        notes: extracted.notes,
        vehicle: matchedVehicle,
      },
    };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Não foi possível analisar o PDF do licenciamento.",
    };
  }
}

/** Cria dois cenários em Simulação — IPVA à vista e IPVA parcelado — para comparar antes de escolher. */
export async function simulateIpva(): Promise<
  { ok: true; vehicle: VehicleSettings } | { ok: false; error: string }
> {
  const vehicle = await getVehicle();
  if (!vehicle) return { ok: false, error: "Escolha o veículo primeiro." };

  // Refazer a simulação troca as anteriores (que ficam arquivadas e podem ser restauradas).
  for (const id of vehicle.ipvaSimulationIds) await deleteSimulation(id);

  const plan = computeIpva(vehicle.fipeCents);
  const year = nextIpvaYear(new Date());
  const label = `IPVA ${year} — ${vehicle.modelName}`;

  const cash = await createSimulation({
    description: `${label} (à vista c/ desconto)`,
    totalAmountCents: plan.cashCents,
    installments: 1,
    startDate: ipvaDueDate(year, 0),
    skipImage: true,
  });
  if (!cash.ok) return { ok: false, error: cash.error };
  const split = await createSimulation({
    description: `${label} (${IPVA_RULES.maxInstallments}x)`,
    totalAmountCents: plan.fullCents,
    installments: IPVA_RULES.maxInstallments,
    startDate: ipvaDueDate(year, 0),
    skipImage: true,
  });
  if (!split.ok) {
    await deleteSimulation(cash.data.id);
    return { ok: false, error: split.error };
  }

  const next: VehicleSettings = { ...vehicle, ipvaSimulationIds: [cash.data.id, split.data.id], ipvaChosen: null };
  if (!(await writeVehicle(next))) return { ok: false, error: "Não foi possível salvar a simulação." };
  revalidatePath("/configuracoes");
  revalidatePath("/simulacao");
  return { ok: true, vehicle: next };
}

function addMonthsISO(isoDate: string, monthsToAdd: number): string {
  const [y, m, d] = isoDate.split("-").map(Number);
  if (!y || !m || !d) return isoDate;
  const totalMonths = y * 12 + (m - 1) + monthsToAdd;
  const nextYear = Math.floor(totalMonths / 12);
  const nextMonth = (totalMonths % 12) + 1;
  return `${nextYear}-${String(nextMonth).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

export interface ChooseIpvaOverride {
  cashWithDiscountCents?: number;
  cashWithoutDiscountCents?: number;
  installmentCents?: number[];
  licensingCents?: number;
  includeLicensing?: boolean;
  year?: number;
  plateFinalDigit?: number | null;
  ipvaFirstDueDate?: string | null;
  licensingDueDate?: string | null;
}

/**
 * Escolhida a forma de pagamento, o IPVA vira saída anual: uma recorrência anual (à vista) ou uma por
 * cota, em meses seguidos (parcelado). Se `includeLicensing` estiver ativo, lança também o licenciamento anual.
 */
export async function chooseIpva(
  option: IpvaChoiceOption,
  personId: string,
  typeId: string | null,
  categoryId: string | null,
  override?: ChooseIpvaOverride
): Promise<{ ok: true; vehicle: VehicleSettings | null } | { ok: false; error: string }> {
  const vehicle = await getVehicle();
  if (!vehicle && !override) return { ok: false, error: "Escolha o veículo ou envie o PDF primeiro." };
  if (!personId) return { ok: false, error: "Escolha de quem é o IPVA." };

  const plan = vehicle ? computeIpva(vehicle.fipeCents) : null;
  const year = override?.year ?? nextIpvaYear(new Date());
  const plateDigit = override?.plateFinalDigit ?? null;

  let amounts: number[];
  if (option === "cash_discount" || option === "cash") {
    const val = override?.cashWithDiscountCents ?? plan?.cashCents;
    if (!val || val <= 0) return { ok: false, error: "Valor à vista com desconto inválido." };
    amounts = [val];
  } else if (option === "cash_full") {
    const val = override?.cashWithoutDiscountCents ?? plan?.fullCents;
    if (!val || val <= 0) return { ok: false, error: "Valor à vista sem desconto inválido." };
    amounts = [val];
  } else {
    const list = override?.installmentCents ?? plan?.installmentCents;
    if (!list || list.length === 0) return { ok: false, error: "Valores das parcelas inválidos." };
    amounts = list;
  }

  const firstDue = override?.ipvaFirstDueDate || ipvaDueDate(year, 0, plateDigit);

  for (let i = 0; i < amounts.length; i++) {
    const description =
      option === "cash_discount"
        ? "IPVA (à vista c/ desconto)"
        : option === "cash_full"
          ? "IPVA (à vista s/ desconto)"
          : option === "cash"
            ? "IPVA (à vista)"
            : `IPVA cota ${i + 1}/${amounts.length}`;

    const result = await createRecurrenceRule({
      description,
      personId,
      direction: "expense",
      typeId,
      categoryId,
      amountCents: amounts[i],
      startDate: i === 0 ? firstDue : addMonthsISO(firstDue, i),
      endDate: null,
      frequency: "annual",
    });
    if (!result.ok) return { ok: false, error: result.error };
  }

  if (override?.includeLicensing && (override.licensingCents ?? 0) > 0) {
    const licensingResult = await createRecurrenceRule({
      description: "Licenciamento anual",
      personId,
      direction: "expense",
      typeId,
      categoryId,
      amountCents: override.licensingCents!,
      startDate: override.licensingDueDate || defaultLicensingDueDate(year, plateDigit),
      endDate: null,
      frequency: "annual",
    });
    if (!licensingResult.ok) return { ok: false, error: licensingResult.error };
  }

  if (vehicle) {
    for (const id of vehicle.ipvaSimulationIds) await deleteSimulation(id);
    const next: VehicleSettings = { ...vehicle, ipvaSimulationIds: [], ipvaChosen: { option, year } };
    if (!(await writeVehicle(next))) {
      return { ok: false, error: "Os lançamentos foram criados, mas não foi possível registrar a escolha." };
    }
    revalidatePath("/configuracoes");
    revalidatePath("/simulacao");
    revalidatePath("/cadastro");
    revalidatePath("/analise");
    return { ok: true, vehicle: next };
  }

  revalidatePath("/configuracoes");
  revalidatePath("/cadastro");
  revalidatePath("/analise");
  return { ok: true, vehicle: null };
}
