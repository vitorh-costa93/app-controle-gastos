import { Sparkles } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { getMonthInsight } from "@/lib/data/analysis";

export async function AIInsightCard({ month, personId }: { month: string; personId?: string }) {
  const insight = await getMonthInsight(month, personId);

  return (
    <Card className="flex gap-3 bg-(--color-primary-soft)/40 p-4">
      <Sparkles size={18} className="mt-0.5 shrink-0 text-(--color-primary)" />
      <div>
        <p className="mb-1 text-sm font-semibold text-(--color-primary)">Insight da IA</p>
        <p className="text-sm text-(--color-text-secondary)">{insight}</p>
      </div>
    </Card>
  );
}

export function AIInsightCardSkeleton() {
  return (
    <Card className="flex gap-3 bg-(--color-primary-soft)/40 p-4">
      <Sparkles size={18} className="mt-0.5 shrink-0 text-(--color-primary)" />
      <div className="flex-1 space-y-2">
        <div className="h-3 w-24 animate-pulse rounded bg-black/10" />
        <div className="h-3 w-full animate-pulse rounded bg-black/10" />
        <div className="h-3 w-2/3 animate-pulse rounded bg-black/10" />
      </div>
    </Card>
  );
}
