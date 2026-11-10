"use client";

import { Person } from "@/types/db";
import { cn } from "@/lib/utils/cn";

export function PersonFilter({
  people,
  personId,
  onChange,
  isPending,
}: {
  people: Person[];
  personId: string;
  onChange: (personId: string) => void;
  isPending?: boolean;
}) {
  return (
    <div
      className={cn(
        "inline-flex w-fit rounded-(--radius-md) bg-black/5 p-1 transition-opacity",
        isPending && "opacity-60"
      )}
      role="group"
      aria-label="Pessoa dos lançamentos"
    >
      <button
        type="button"
        aria-pressed={personId === ""}
        onClick={() => onChange("")}
        className={cn(
          "rounded-(--radius-sm) px-3.5 py-1.5 text-sm font-medium transition-colors",
          personId === ""
            ? "bg-(--color-surface) text-(--color-text-primary) shadow-(--shadow-sm)"
            : "text-(--color-text-secondary)"
        )}
      >
        Casal
      </button>
      {people.map((p) => (
        <button
          type="button"
          aria-pressed={personId === p.id}
          key={p.id}
          onClick={() => onChange(p.id)}
          className={cn(
            "rounded-(--radius-sm) px-3.5 py-1.5 text-sm font-medium transition-colors",
            personId === p.id
              ? "bg-(--color-surface) text-(--color-text-primary) shadow-(--shadow-sm)"
              : "text-(--color-text-secondary)"
          )}
        >
          {p.name}
        </button>
      ))}
    </div>
  );
}
