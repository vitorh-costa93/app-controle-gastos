"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname, useSearchParams } from "next/navigation";
import { LayoutGrid, List, Calculator, Repeat2, Tags, Settings, ChevronDown } from "lucide-react";
import { useInterface } from "./InterfaceProvider";
import { cn } from "@/lib/utils/cn";
import { NAV_ITEMS, SETTINGS_ITEM } from "./nav-items";

export function Sidebar() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { isModern } = useInterface();
  if (isModern) {
    const scopedHref = (href: string) => {
      const [base, hash] = href.split("#");
      const [path, raw] = base.split("?");
      const params = new URLSearchParams(raw);
      for (const key of ["month", "personId"]) { const value = searchParams.get(key); if (value) params.set(key, value); }
      return `${path}${params.size ? `?${params}` : ""}${hash ? `#${hash}` : ""}`;
    };
    const sections = [
      { label: "Menu", items: [{ href: "/analise", label: "Visão do mês", Icon: LayoutGrid }, { href: "/cadastro", label: "Lançamentos", Icon: List }, { href: "/simulacao", label: "Simulação", Icon: Calculator }] },
      { label: "Gestão", items: [{ href: "/cadastro?tab=recorrencias", label: "Recorrências", Icon: Repeat2 }, { href: "/configuracoes#categorias", label: "Categorias", Icon: Tags }, { href: "/configuracoes", label: "Configurações", Icon: Settings }] },
    ];
    return <aside className="modern-sidebar hidden md:flex"><Link href={scopedHref("/analise")} className="modern-brand"><Image src="/icon.svg" alt="" width={30} height={30} /><strong>MeuDinheiro</strong></Link><nav aria-label="Navegação principal">{sections.map((section) => <div className="modern-nav-section" key={section.label}><p>{section.label}</p>{section.items.map(({ href, label, Icon }) => {
      const active = href.includes("tab=") ? pathname === "/cadastro" && searchParams.get("tab") === "recorrencias" : href === "/cadastro" ? pathname === "/cadastro" && searchParams.get("tab") !== "recorrencias" : href === "/configuracoes#categorias" ? false : pathname.startsWith(href);
      return <Link key={href} href={scopedHref(href)} className={cn("modern-nav-link", active && "is-active")} aria-current={active ? "page" : undefined}><Icon size={16} strokeWidth={1.7} />{label}</Link>;
    })}</div>)}</nav><div className="modern-account"><Image src="/family-avatar.png" alt="Ilustração de Vitor, Jaqueline e seu cachorrinho" width={56} height={56} className="family-avatar" /><div><strong>Vitor &amp; Jaqueline</strong><p>Conta compartilhada</p></div><ChevronDown size={13} aria-hidden="true" /></div></aside>;
  }

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
