"use client";

import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { Person, TransactionType } from "@/types/db";
import { cn } from "@/lib/utils/cn";

const TABS = [
  { value: "", label: "Todas" },
  { value: "income", label: "Entradas" },
  { value: "expense", label: "Saídas" },
] as const;

export function FiltersBar({ people, types }: { people: Person[]; types: TransactionType[] }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  function setParam(key: string, value: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (value) params.set(key, value);
    else params.delete(key);
    params.delete("page");
    router.push(`${pathname}?${params.toString()}`);
  }

  const direction = searchParams.get("direction") ?? "";
  const month = searchParams.get("month") ?? "";
  const personId = searchParams.get("personId") ?? "";
  const typeId = searchParams.get("typeId") ?? "";

  return (
    <div className="mb-4 flex flex-col gap-3">
      <div className="inline-flex w-fit rounded-(--radius-md) bg-black/5 p-1">
        {TABS.map((tab) => (
          <button
            key={tab.value}
            onClick={() => setParam("direction", tab.value)}
            className={cn(
              "rounded-(--radius-sm) px-3.5 py-1.5 text-sm font-medium transition-colors",
              direction === tab.value
                ? "bg-(--color-surface) text-(--color-text-primary) shadow-(--shadow-sm)"
                : "text-(--color-text-secondary)"
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className="flex flex-wrap gap-2">
        <input
          type="month"
          value={month}
          onChange={(e) => setParam("month", e.target.value)}
          className="h-9 rounded-(--radius-md) border border-(--color-border) bg-(--color-surface) px-3 text-sm"
        />
        <select
          value={personId}
          onChange={(e) => setParam("personId", e.target.value)}
          className="h-9 rounded-(--radius-md) border border-(--color-border) bg-(--color-surface) px-3 text-sm"
        >
          <option value="">Todas as origens</option>
          {people.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
        <select
          value={typeId}
          onChange={(e) => setParam("typeId", e.target.value)}
          className="h-9 rounded-(--radius-md) border border-(--color-border) bg-(--color-surface) px-3 text-sm"
        >
          <option value="">Todos os tipos</option>
          {types.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}
