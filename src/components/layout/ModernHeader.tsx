"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { ChevronRight, Plus, Sparkles } from "lucide-react";
import { useInterface } from "./InterfaceProvider";
import { GlobalAssistantDrawer } from "./GlobalAssistantDrawer";

export function ModernHeader() {
  const { isModern } = useInterface();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [assistantOpen, setAssistantOpen] = useState(false);
  const query = new URLSearchParams();
  for (const key of ["month", "personId"]) { const value = searchParams.get(key); if (value) query.set(key, value); }
  query.set("action", "new");
  const isSimulacao = pathname.startsWith("/simulacao");
  const title = pathname.startsWith("/analise") ? "Visão do mês" : isSimulacao ? "Simulação" : pathname.startsWith("/configuracoes") ? "Configurações" : searchParams.get("tab") === "recorrencias" ? "Recorrências" : searchParams.get("tab") === "atencao" ? "Atenção" : "Lançamentos";
  return (
    <>
      <header className="interface-header">
        {isModern && <div className="modern-header-context"><span>MeuDinheiro</span><ChevronRight size={13} /><strong>{title}</strong></div>}
        <div className="interface-header-actions">
          {!isSimulacao && (
            <button
              type="button"
              onClick={() => setAssistantOpen(true)}
              className="inline-flex h-8 items-center gap-1.5 rounded-(--radius-md) border border-(--color-border) bg-(--color-surface) px-2.5 text-xs font-semibold text-(--color-primary) hover:bg-(--color-primary-soft)/40"
            >
              <Sparkles size={13} />
              <span>Assistente IA</span>
            </button>
          )}
          {isModern && <Link className="modern-add-button" aria-label="Adicionar" href={`/cadastro?${query}`}><Plus size={15} /><span>Adicionar</span></Link>}
        </div>
      </header>
      {!isSimulacao && (
        <GlobalAssistantDrawer
          open={assistantOpen}
          onClose={() => setAssistantOpen(false)}
          personId={searchParams.get("personId")}
          currentPath={pathname}
        />
      )}
    </>
  );
}
