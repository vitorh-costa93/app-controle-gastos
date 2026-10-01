"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { computeIpva, ipvaDueDate, nextIpvaYear, IPVA_RULES } from "@/lib/domain/ipva";
import { createSimulation, deleteSimulation } from "./simulations";
import { createRecurrenceRule } from "./recurrence";

const VEHICLE_KEY = "vehicle";
const FIPE_BASE = "https://parallelum.com.br/fipe/api/v1/carros/marcas";

export interface FipeOption {
  code: string;
  name: string;
}

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
  ipvaChosen: { option: "cash" | "installments"; year: number } | null;
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
    description: `${label} (à vista)`,
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

/**
 * Escolhida a forma de pagamento, o IPVA vira saída anual: uma recorrência anual (à vista) ou uma por
 * cota, em meses seguidos (parcelado). Os dois cenários da simulação são arquivados.
 */
export async function chooseIpva(
  option: "cash" | "installments",
  personId: string,
  typeId: string | null,
  categoryId: string | null
): Promise<{ ok: true; vehicle: VehicleSettings } | { ok: false; error: string }> {
  const vehicle = await getVehicle();
  if (!vehicle) return { ok: false, error: "Escolha o veículo primeiro." };
  if (!personId) return { ok: false, error: "Escolha de quem é o IPVA." };

  const plan = computeIpva(vehicle.fipeCents);
  const year = nextIpvaYear(new Date());
  const amounts = option === "cash" ? [plan.cashCents] : plan.installmentCents;

  for (let i = 0; i < amounts.length; i++) {
    const result = await createRecurrenceRule({
      description: option === "cash" ? "IPVA (à vista)" : `IPVA cota ${i + 1}/${amounts.length}`,
      personId,
      direction: "expense",
      typeId,
      categoryId,
      amountCents: amounts[i],
      startDate: ipvaDueDate(year, i),
      endDate: null,
      frequency: "annual",
    });
    if (!result.ok) return { ok: false, error: result.error };
  }

  for (const id of vehicle.ipvaSimulationIds) await deleteSimulation(id);
  const next: VehicleSettings = { ...vehicle, ipvaSimulationIds: [], ipvaChosen: { option, year } };
  if (!(await writeVehicle(next))) return { ok: false, error: "O IPVA foi lançado, mas não foi possível registrar a escolha." };
  revalidatePath("/configuracoes");
  revalidatePath("/simulacao");
  return { ok: true, vehicle: next };
}
