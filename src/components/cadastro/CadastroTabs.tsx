import Link from "next/link";
import { cn } from "@/lib/utils/cn";

export type CadastroTab = "lancamentos" | "recorrencias";

const TABS: { key: CadastroTab; label: string; href: string }[] = [
  { key: "lancamentos", label: "Lançamentos", href: "/cadastro" },
  { key: "recorrencias", label: "Recorrências", href: "/cadastro?tab=recorrencias" },
];

export function CadastroTabs({ active }: { active: CadastroTab }) {
  return (
    <div className="mb-6 flex gap-1 border-b border-(--color-border)">
      {TABS.map((tab) => (
        <Link
          key={tab.key}
          href={tab.href}
          className={cn(
            "-mb-px border-b-2 px-4 py-2 text-sm font-medium transition-colors",
            active === tab.key
              ? "border-(--color-primary) text-(--color-primary)"
              : "border-transparent text-(--color-text-secondary) hover:text-(--color-text-primary)"
          )}
        >
          {tab.label}
        </Link>
      ))}
    </div>
  );
}
