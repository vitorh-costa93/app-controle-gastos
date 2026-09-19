"use client";

import { useTransition } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { Person } from "@/types/db";
import { cn } from "@/lib/utils/cn";

export function PersonFilter({ people, personId }: { people: Person[]; personId: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();

  function go(target: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (target) params.set("personId", target);
    else params.delete("personId");
    startTransition(() => {
      router.push(`${pathname}?${params.toString()}`);
    });
  }

  return (
    <div
      className={cn(
        "inline-flex w-fit rounded-(--radius-md) bg-black/5 p-1 transition-opacity",
        isPending && "opacity-60"
      )}
    >
      <button
        onClick={() => go("")}
        disabled={isPending}
        className={cn(
          "rounded-(--radius-sm) px-3.5 py-1.5 text-sm font-medium transition-colors disabled:cursor-wait",
          personId === ""
            ? "bg-(--color-surface) text-(--color-text-primary) shadow-(--shadow-sm)"
            : "text-(--color-text-secondary)"
        )}
      >
        Tudo
      </button>
      {people.map((p) => (
        <button
          key={p.id}
          onClick={() => go(p.id)}
          disabled={isPending}
          className={cn(
            "rounded-(--radius-sm) px-3.5 py-1.5 text-sm font-medium transition-colors disabled:cursor-wait",
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
