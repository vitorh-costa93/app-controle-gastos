import "server-only";
import { unstable_cache } from "next/cache";

/**
 * "Valor Recebido" mensal do dashboard-psi (consultório da Jaqueline), lido direto do Supabase
 * daquele projeto — mesma regra do KPI (api/operational.js e lib/wellz.js do dashboard-psi):
 *   1. sessões: sessões cobradas × valor da sessão (com o mesmo fallback valor_final ÷ cobradas);
 *   2. Wellz semanal (tabela wellz_semanas, a partir de set/2026): quantidades × tarifa de cada tipo;
 *   3. Wellz histórico (tabela wellz_historico): valor mensal fixo.
 * É a fonte do salário variável, no lugar de digitar o valor todo mês.
 *
 * Só leitura. Sem PSI_SUPABASE_URL / PSI_SUPABASE_SERVICE_KEY configuradas (ou se o projeto do
 * psi estiver fora do ar), devolve um mapa vazio e o app segue usando os valores digitados.
 */
export function isPsiRevenueConfigured(): boolean {
  return Boolean(process.env.PSI_SUPABASE_URL && process.env.PSI_SUPABASE_SERVICE_KEY);
}

interface SessionRow {
  data_sessao: string;
  sessoes_cobradas: number | string | null;
  valor_sessao: number | string | null;
  valor_final: number | string | null;
}

interface WellzWeekRow {
  semana_ref: string;
  [key: string]: string | number | null;
}

interface WellzHistoryRow {
  mes: string;
  valor: number | string | null;
}

/** Tarifas por tipo de atendimento do Wellz — cópia de TARIFAS em lib/wellz.js do dashboard-psi. */
const WELLZ_TARIFAS: Record<string, number> = {
  faltas: 10,
  acolh_antes: 25,
  acolh_apos: 35,
  real_antes: 50,
  real_apos: 60,
};

async function fetchAllRows<T>(url: string, key: string, path: string, pageSize: number): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; ; from += pageSize) {
    const res = await fetch(`${url}/rest/v1/${path}`, {
      headers: { apikey: key, Authorization: `Bearer ${key}`, Range: `${from}-${from + pageSize - 1}` },
      cache: "no-store",
    });
    if (!res.ok) throw new Error(`dashboard-psi respondeu ${res.status} em ${path.split("?")[0]}`);
    const page = (await res.json()) as T[];
    rows.push(...page);
    if (page.length < pageSize) break;
  }
  return rows;
}

async function fetchMonthlyRevenueCents(): Promise<Record<string, number>> {
  const url = process.env.PSI_SUPABASE_URL;
  const key = process.env.PSI_SUPABASE_SERVICE_KEY;
  if (!url || !key) return {};

  const [sessions, weeks, history] = await Promise.all([
    fetchAllRows<SessionRow>(
      url,
      key,
      "sessoes?select=data_sessao,sessoes_cobradas,valor_sessao,valor_final,pacientes!inner(id)&order=data_sessao.asc",
      1000
    ),
    fetchAllRows<WellzWeekRow>(url, key, "wellz_semanas?select=*&order=semana_ref.asc", 1000),
    fetchAllRows<WellzHistoryRow>(url, key, "wellz_historico?select=*&order=mes.asc", 1000),
  ]);

  const byMonth: Record<string, number> = {};
  const add = (month: string, cents: number) => {
    if (/^\d{4}-\d{2}$/.test(month)) byMonth[month] = (byMonth[month] ?? 0) + cents;
  };

  for (const row of sessions) {
    const charged = Number(row.sessoes_cobradas ?? 0);
    const sessionValue = Number(row.valor_sessao ?? 0);
    const finalValue = Number(row.valor_final ?? 0);
    // Mesmo fallback do dashboard-psi quando o valor da sessão não foi preenchido.
    const unit = sessionValue > 0 ? sessionValue : charged > 0 && finalValue > 0 ? finalValue / charged : sessionValue;
    add(String(row.data_sessao ?? "").slice(0, 7), Math.round(charged * unit * 100));
  }
  for (const week of weeks) {
    const cents = Object.entries(WELLZ_TARIFAS).reduce(
      (sum, [type, rate]) => sum + (Number(week[type]) || 0) * rate * 100,
      0
    );
    add(String(week.semana_ref ?? "").slice(0, 7), cents);
  }
  for (const row of history) add(String(row.mes ?? "").slice(0, 7), Math.round((Number(row.valor) || 0) * 100));

  return byMonth;
}

const getCachedMonthlyRevenue = unstable_cache(fetchMonthlyRevenueCents, ["psi-monthly-revenue-v2"], {
  tags: ["psi-revenue"],
  revalidate: 300,
});

/** Valor recebido por mês ("YYYY-MM" → centavos), só meses com valor > 0. Falha silenciosa → {}. */
export async function getPsiMonthlyRevenueCents(): Promise<Record<string, number>> {
  if (!isPsiRevenueConfigured()) return {};
  try {
    const all = await getCachedMonthlyRevenue();
    return Object.fromEntries(Object.entries(all).filter(([, cents]) => cents > 0));
  } catch (error) {
    console.error("getPsiMonthlyRevenueCents failed:", error);
    return {};
  }
}
