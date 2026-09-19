export const dynamic = "force-dynamic";

import { fetchAnalysisPageData, getMonthInsight } from "@/lib/data/analysis";
import { toReferenceMonth } from "@/lib/utils/format";
import { AnalisePageClient } from "@/components/analise/AnalisePageClient";

export default async function AnalisePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const month = typeof sp.month === "string" ? sp.month : toReferenceMonth(new Date());
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
