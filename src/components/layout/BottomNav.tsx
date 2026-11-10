"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { LayoutGrid, List, Calculator } from "lucide-react";
import { useInterface } from "./InterfaceProvider";
import { cn } from "@/lib/utils/cn";
import { NAV_ITEMS, SETTINGS_ITEM } from "./nav-items";

const ITEMS = [...NAV_ITEMS, SETTINGS_ITEM];

export function BottomNav() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { isModern } = useInterface();
  const items = isModern ? [{ href: "/analise", label: "Visão do mês", icon: LayoutGrid }, { href: "/cadastro", label: "Lançamentos", icon: List }, { href: "/simulacao", label: "Simulação", icon: Calculator }, SETTINGS_ITEM] : ITEMS;

  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 flex border-t border-(--color-border) bg-(--color-surface)/95 backdrop-blur pb-[env(safe-area-inset-bottom)] md:hidden">
      {items.map((item) => {
        const active = pathname.startsWith(item.href);
        const Icon = item.icon;
        return (
          <Link
            key={item.href}
            href={isModern ? `${item.href}?${new URLSearchParams(Array.from(searchParams.entries()).filter(([key]) => key === "month" || key === "personId"))}` : item.href}
            className={cn(
              "flex flex-1 flex-col items-center gap-1 py-2.5 text-[11px] font-medium",
              active ? "text-(--color-primary)" : "text-(--color-text-tertiary)"
            )}
          >
            <Icon size={20} strokeWidth={2} />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
