"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname, useSearchParams } from "next/navigation";
import { LayoutGrid, List, Calculator, Repeat2, Tags, Settings } from "lucide-react";
import { cn } from "@/lib/utils/cn";

export function Sidebar() {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const scopedHref = (href: string) => {
    const [base, hash] = href.split("#");
    const [path, raw] = base.split("?");
    const params = new URLSearchParams(raw);
    for (const key of ["month", "personId"]) {
      const value = searchParams.get(key);
      if (value) params.set(key, value);
    }
    return `${path}${params.size ? `?${params}` : ""}${hash ? `#${hash}` : ""}`;
  };

  const sections = [
    {
      label: "Menu",
      items: [
        { href: "/analise", label: "Visão do mês", Icon: LayoutGrid },
        { href: "/cadastro", label: "Lançamentos", Icon: List },
        { href: "/simulacao", label: "Simulação", Icon: Calculator },
      ],
    },
    {
      label: "Gestão",
      items: [
        { href: "/cadastro?tab=recorrencias", label: "Recorrências", Icon: Repeat2 },
        { href: "/configuracoes#categorias", label: "Categorias", Icon: Tags },
        { href: "/configuracoes", label: "Configurações", Icon: Settings },
      ],
    },
  ];

  return (
    <aside className="modern-sidebar hidden md:flex">
      <Link href={scopedHref("/analise")} className="modern-brand">
        <Image src="/icon.svg" alt="" width={30} height={30} />
        <strong>MeuDinheiro</strong>
      </Link>
      <nav aria-label="Navegação principal">
        {sections.map((section) => (
          <div className="modern-nav-section" key={section.label}>
            <p>{section.label}</p>
            {section.items.map(({ href, label, Icon }) => {
              const active = href.includes("tab=")
                ? pathname === "/cadastro" && searchParams.get("tab") === "recorrencias"
                : href === "/cadastro"
                  ? pathname === "/cadastro" && searchParams.get("tab") !== "recorrencias"
                  : href === "/configuracoes#categorias"
                    ? false
                    : pathname.startsWith(href);
              return (
                <Link
                  key={href}
                  href={scopedHref(href)}
                  className={cn("modern-nav-link", active && "is-active")}
                  aria-current={active ? "page" : undefined}
                >
                  <Icon size={16} strokeWidth={1.7} />
                  {label}
                </Link>
              );
            })}
          </div>
        ))}
      </nav>
      <div className="modern-account">
        <Image
          src="/family-avatar.png"
          alt="Ilustração de Vitor, Jaqueline e seu cachorrinho"
          width={56}
          height={56}
          className="family-avatar"
        />
        <div>
          <strong>Vitor &amp; Jaqueline</strong>
          <p>Conta compartilhada</p>
        </div>
      </div>
    </aside>
  );
}
