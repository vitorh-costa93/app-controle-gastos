import "server-only";

export interface CdiRate {
  /** CDI anual em %, ex.: 13.65. */
  annualPercent: number;
  /** Data da taxa (YYYY-MM-DD). */
  asOf: string;
  source: "bcb" | "fallback";
}

// Último valor conhecido (Selic 13,75% desde 16/09/2026): usado se o Banco Central estiver fora do ar.
const FALLBACK: CdiRate = { annualPercent: 13.65, asOf: "2026-10-02", source: "fallback" };

// Série 4389 do SGS: CDI anualizado, base 252, valor diário em % a.a.
const BCB_CDI_URL = "https://api.bcb.gov.br/dados/serie/bcdata.sgs.4389/dados/ultimos/1?formato=json";

/** CDI do Banco Central (API pública, sem chave). Nunca lança: cai no último valor conhecido. */
export async function getCdiRate(): Promise<CdiRate> {
  try {
    const response = await fetch(BCB_CDI_URL, {
      signal: AbortSignal.timeout(5000),
      next: { revalidate: 60 * 60 * 12 },
    });
    if (!response.ok) return FALLBACK;
    const rows = (await response.json()) as { data: string; valor: string }[];
    const row = rows[0];
    const annualPercent = Number(row?.valor);
    const [day, month, year] = (row?.data ?? "").split("/");
    if (!Number.isFinite(annualPercent) || annualPercent <= 0 || annualPercent > 60 || !year) return FALLBACK;
    return { annualPercent, asOf: `${year}-${month}-${day}`, source: "bcb" };
  } catch {
    return FALLBACK;
  }
}
