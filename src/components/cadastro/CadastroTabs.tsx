"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useInterface } from "@/components/layout/InterfaceProvider";
import { cn } from "@/lib/utils/cn";

export type CadastroTab = "lancamentos" | "recorrencias" | "atencao";

const TABS: { key: CadastroTab; label: string; href: string }[] = [
  { key: "lancamentos", label: "Lançamentos", href: "/cadastro" },
  { key: "recorrencias", label: "Recorrências", href: "/cadastro?tab=recorrencias" },
  { key: "atencao", label: "Pontos de atenção", href: "/cadastro?tab=atencao" },
];

export function CadastroTabs({ active, attentionCount }: { active: CadastroTab; attentionCount?: number }) {
  const params = useSearchParams();
  const { isModern } = useInterface();
  const scopedHref = (href: string) => {
    if (!isModern) return href;
    const [path, query] = href.split("?");
    const next = new URLSearchParams(query);
    for (const key of ["personId", "month"]) { const value = params.get(key); if (value) next.set(key, value); }
    return `${path}${next.size ? `?${next}` : ""}`;
  };
  return (
    <div className="mb-6 flex gap-1 overflow-x-auto border-b border-(--color-border)">
      {TABS.map((tab) => (
        <Link
          key={tab.key}
          href={scopedHref(tab.href)}
          className={cn(
            "-mb-px whitespace-nowrap border-b-2 px-4 py-2 text-sm font-medium transition-colors",
            active === tab.key
              ? "border-(--color-primary) text-(--color-primary)"
              : "border-transparent text-(--color-text-secondary) hover:text-(--color-text-primary)"
          )}
        >
          {tab.label}
          {tab.key === "atencao" && attentionCount ? (
            <span className="ml-1.5 rounded-full bg-(--color-warning)/15 px-1.5 py-0.5 text-xs text-(--color-warning)">
              {attentionCount}
            </span>
          ) : null}
        </Link>
      ))}
    </div>
  );
}
