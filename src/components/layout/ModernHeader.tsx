"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { ChevronRight, Plus } from "lucide-react";
import { InterfaceToggle, useInterface } from "./InterfaceProvider";

export function ModernHeader() {
  const { isModern } = useInterface();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const query = new URLSearchParams();
  for (const key of ["month", "personId"]) { const value = searchParams.get(key); if (value) query.set(key, value); }
  query.set("action", "new");
  const title = pathname.startsWith("/analise") ? "Visão do mês" : pathname.startsWith("/simulacao") ? "Simulação" : pathname.startsWith("/configuracoes") ? "Configurações" : searchParams.get("tab") === "recorrencias" ? "Recorrências" : searchParams.get("tab") === "atencao" ? "Atenção" : "Lançamentos";
  return <header className="interface-header">{isModern && <div className="modern-header-context"><span>MeuDinheiro</span><ChevronRight size={13} /><strong>{title}</strong></div>}<div className="interface-header-actions"><InterfaceToggle />{isModern && <Link className="modern-add-button" aria-label="Adicionar" href={`/cadastro?${query}`}><Plus size={15} /><span>Adicionar</span></Link>}</div></header>;
}
