"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { addMonths, formatMonthLabel } from "@/lib/utils/format";
import { cn } from "@/lib/utils/cn";

export function MonthSelector({
  month,
  onChange,
  isPending,
}: {
  month: string;
  onChange: (month: string) => void;
  isPending?: boolean;
}) {
  return (
    <div
      className={cn(
        "flex items-center gap-1 rounded-(--radius-md) border border-(--color-border) bg-(--color-surface) px-1 py-1 transition-opacity",
        isPending && "opacity-60"
      )}
    >
      <button
        onClick={() => onChange(addMonths(month, -1))}
        className="rounded-(--radius-sm) p-1.5 hover:bg-black/5"
        aria-label="Mês anterior"
      >
        <ChevronLeft size={16} />
      </button>
      <span className="min-w-[140px] text-center text-sm font-medium">{formatMonthLabel(month)}</span>
      <button
        onClick={() => onChange(addMonths(month, 1))}
        className="rounded-(--radius-sm) p-1.5 hover:bg-black/5"
        aria-label="Próximo mês"
      >
        <ChevronRight size={16} />
      </button>
    </div>
  );
}
