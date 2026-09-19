"use client";

import { useTransition } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { addMonths, formatMonthLabel } from "@/lib/utils/format";
import { cn } from "@/lib/utils/cn";

export function MonthSelector({ month }: { month: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();

  function go(target: string) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("month", target);
    // useTransition dá feedback instantâneo (opacidade) no clique — sem isso o botão
    // ficava "morto" até a navegação inteira terminar, parecendo travado.
    startTransition(() => {
      router.push(`${pathname}?${params.toString()}`);
    });
  }

  return (
    <div
      className={cn(
        "flex items-center gap-1 rounded-(--radius-md) border border-(--color-border) bg-(--color-surface) px-1 py-1 transition-opacity",
        isPending && "opacity-60"
      )}
    >
      <button
        onClick={() => go(addMonths(month, -1))}
        disabled={isPending}
        className="rounded-(--radius-sm) p-1.5 hover:bg-black/5 disabled:cursor-wait"
        aria-label="Mês anterior"
      >
        <ChevronLeft size={16} />
      </button>
      <span className="min-w-[140px] text-center text-sm font-medium">{formatMonthLabel(month)}</span>
      <button
        onClick={() => go(addMonths(month, 1))}
        disabled={isPending}
        className="rounded-(--radius-sm) p-1.5 hover:bg-black/5 disabled:cursor-wait"
        aria-label="Próximo mês"
      >
        <ChevronRight size={16} />
      </button>
    </div>
  );
}
