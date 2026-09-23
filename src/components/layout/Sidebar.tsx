"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils/cn";
import { NAV_ITEMS, SETTINGS_ITEM } from "./nav-items";

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="hidden w-52 shrink-0 flex-col border-r border-(--color-border) bg-(--color-surface) px-3 py-6 md:flex">
      <div className="mb-8 flex items-center gap-2 px-2">
        <div className="flex h-8 w-8 items-center justify-center rounded-(--radius-sm) bg-(--color-primary) text-sm font-semibold text-white">
          M
        </div>
        <span className="text-[15px] font-semibold tracking-tight">MeuDinheiro</span>
      </div>

      <nav className="flex flex-1 flex-col gap-1">
        {NAV_ITEMS.map((item) => {
          const active = pathname.startsWith(item.href);
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-3 rounded-(--radius-md) px-3 py-2.5 text-sm font-medium transition-colors",
                active
                  ? "bg-(--color-primary-soft) text-(--color-primary)"
                  : "text-(--color-text-secondary) hover:bg-black/5"
              )}
            >
              <Icon size={18} strokeWidth={2} />
              {item.label}
            </Link>
          );
        })}
      </nav>

      <div className="flex flex-col gap-1 border-t border-(--color-border) pt-4">
        <Link
          href={SETTINGS_ITEM.href}
          className={cn(
            "flex items-center gap-3 rounded-(--radius-md) px-3 py-2.5 text-sm font-medium transition-colors",
            pathname.startsWith(SETTINGS_ITEM.href)
              ? "bg-(--color-primary-soft) text-(--color-primary)"
              : "text-(--color-text-secondary) hover:bg-black/5"
          )}
        >
          <SETTINGS_ITEM.icon size={18} strokeWidth={2} />
          {SETTINGS_ITEM.label}
        </Link>
        <div className="mt-2 flex items-center gap-2 px-3 py-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-(--color-primary-soft) text-xs font-semibold text-(--color-primary)">
            VC
          </div>
          <div className="flex flex-col leading-tight">
            <span className="text-sm font-medium">Vitor &amp; Jaqueline</span>
            <span className="text-xs text-(--color-text-tertiary)">Conta compartilhada</span>
          </div>
        </div>
      </div>
    </aside>
  );
}
