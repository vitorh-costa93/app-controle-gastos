import { NextRequest, NextResponse } from "next/server";
import { refreshMultipleSimulationsTracking } from "@/lib/data/price-tracking";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(request: NextRequest) {
  // Se CRON_SECRET estiver configurado no ambiente, valida o header Authorization
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    const authHeader = request.headers.get("authorization");
    if (authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }
  }

  try {
    const result = await refreshMultipleSimulationsTracking();
    return NextResponse.json({
      ok: true,
      checkedAt: new Date().toISOString(),
      updatedCount: result.updatedSimulations.length,
      alertsTriggered: result.newAlerts.length,
      simulations: result.updatedSimulations.map((s) => ({
        id: s.id,
        description: s.description,
        category: s.category,
        cashPriceCents: s.cashPriceCents,
        totalAmountCents: s.totalAmountCents,
        installments: s.installments,
        storeOrProvider: s.bestOfferMeta?.storeOrProvider ?? null,
      })),
    });
  } catch (error) {
    console.error("Cron price-tracking failed:", error);
    return NextResponse.json({ ok: false, error: "Failed to run price tracking cron" }, { status: 500 });
  }
}
