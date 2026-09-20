export const dynamic = "force-dynamic";

import { fetchAnalysisPageData, getMonthInsight } from "@/lib/data/analysis";
import { toReferenceMonth, addMonths } from "@/lib/utils/format";
import { AnalisePageClient } from "@/components/analise/AnalisePageClient";

export default async function AnalisePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  // Painel abre por padrão no mês seguinte ao atual (ex.: hoje em setembro → outubro).
  const month = typeof sp.month === "string" ? sp.month : addMonths(toReferenceMonth(new Date()), 1);
  const personId = typeof sp.personId === "string" ? sp.personId : "";

  const [{ data, transactions }, insight] = await Promise.all([
    fetchAnalysisPageData(month, personId || undefined),
    getMonthInsight(month, personId || undefined),
  ]);

  return (
    <AnalisePageClient
      initialMonth={month}
      initialPersonId={personId}
      initialData={data}
      initialTransactions={transactions}
      initialInsight={insight}
    />
  );
}
