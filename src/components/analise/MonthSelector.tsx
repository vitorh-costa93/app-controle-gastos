"use client";

import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { addMonths, formatMonthLabel } from "@/lib/utils/format";

export function MonthSelector({ month }: { month: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  function go(target: string) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("month", target);
    router.push(`${pathname}?${params.toString()}`);
  }

  return (
    <div className="flex items-center gap-1 rounded-(--radius-md) border border-(--color-border) bg-(--color-surface) px-1 py-1">
      <button
        onClick={() => go(addMonths(month, -1))}
        className="rounded-(--radius-sm) p-1.5 hover:bg-black/5"
        aria-label="Mês anterior"
      >
        <ChevronLeft size={16} />
      </button>
      <span className="min-w-[140px] text-center text-sm font-medium">{formatMonthLabel(month)}</span>
      <button
        onClick={() => go(addMonths(month, 1))}
        className="rounded-(--radius-sm) p-1.5 hover:bg-black/5"
        aria-label="Próximo mês"
      >
        <ChevronRight size={16} />
      </button>
    </div>
  );
}
