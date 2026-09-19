"use client";

import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { cn } from "@/lib/utils/cn";

export function Pagination({ page, pageSize, total }: { page: number; pageSize: number; total: number }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  function goTo(p: number) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("page", String(p));
    router.push(`${pathname}?${params.toString()}`);
  }

  if (total === 0) return null;

  const from = (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, total);

  return (
    <div className="mt-4 flex items-center justify-between text-sm text-(--color-text-secondary)">
      <span>
        Mostrando {from}–{to} de {total} registros
      </span>
      <div className="flex items-center gap-1">
        <button
          disabled={page <= 1}
          onClick={() => goTo(page - 1)}
          className="rounded-(--radius-sm) px-2 py-1 disabled:opacity-30"
        >
          ‹
        </button>
        {Array.from({ length: totalPages }, (_, i) => i + 1)
          .slice(0, 6)
          .map((p) => (
            <button
              key={p}
              onClick={() => goTo(p)}
              className={cn(
                "h-7 w-7 rounded-(--radius-sm) text-sm",
                p === page ? "bg-(--color-primary) text-white" : "hover:bg-black/5"
              )}
            >
              {p}
            </button>
          ))}
        <button
          disabled={page >= totalPages}
          onClick={() => goTo(page + 1)}
          className="rounded-(--radius-sm) px-2 py-1 disabled:opacity-30"
        >
          ›
        </button>
      </div>
    </div>
  );
}
