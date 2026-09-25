"use client";

import { useEffect, useRef, useState } from "react";
import { ListFilter } from "lucide-react";
import { cn } from "@/lib/utils/cn";

/** Ícone de filtro que abre um popup ancorado na coluna; fecha ao clicar fora ou apertar Esc. */
export function FilterButton({
  active,
  open,
  onToggle,
  onClose,
  align,
  children,
}: {
  active: boolean;
  open: boolean;
  onToggle: () => void;
  onClose: () => void;
  align: "left" | "right";
  children: React.ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number }>({ top: 0, left: 0 });

  // O popup usa position: fixed (calculada a partir do botão) porque a tabela fica dentro de um
  // contêiner com overflow-x: auto, que cortaria um popup absoluto quando houver poucas linhas.
  useEffect(() => {
    if (!open || !buttonRef.current) return;
    const rect = buttonRef.current.getBoundingClientRect();
    const width = 224;
    const left = align === "right" ? rect.right - width : rect.left;
    setPos({ top: rect.bottom + 4, left: Math.max(8, Math.min(left, window.innerWidth - width - 8)) });
  }, [open, align]);

  useEffect(() => {
    if (!open) return;
    // Rolagem dentro do próprio popup (lista longa) não deve fechá-lo.
    function onScroll(e: Event) {
      if (ref.current && e.target instanceof Node && ref.current.contains(e.target)) return;
      onClose();
    }
    window.addEventListener("resize", onClose);
    window.addEventListener("scroll", onScroll, true);
    return () => {
      window.removeEventListener("resize", onClose);
      window.removeEventListener("scroll", onScroll, true);
    };
  }, [open, onClose]);

  useEffect(() => {
    if (!open) return;
    function onPointerDown(e: PointerEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open, onClose]);

  return (
    <div ref={ref} className="relative">
      <button
        ref={buttonRef}
        type="button"
        aria-label="Filtrar coluna"
        aria-expanded={open}
        onClick={onToggle}
        className={cn(
          "grid h-6 w-6 place-items-center rounded-md hover:bg-(--color-surface-secondary)",
          active ? "text-(--color-primary)" : "text-(--color-text-tertiary)"
        )}
      >
        <ListFilter size={13} />
        {active && <span className="absolute right-0.5 top-0.5 h-1.5 w-1.5 rounded-full bg-(--color-primary)" />}
      </button>
      {open && (
        <div
          style={{ top: pos.top, left: pos.left }}
          className="fixed z-20 w-56 rounded-(--radius-lg) border border-(--color-border) bg-(--color-surface) p-2 text-left text-sm font-normal text-(--color-text-primary) shadow-(--shadow-md)"
        >
          {children}
        </div>
      )}
    </div>
  );
}

export function ValuesFilter({
  options,
  selected,
  onToggle,
  onClear,
}: {
  options: string[];
  selected: Set<string>;
  onToggle: (value: string) => void;
  onClear: () => void;
}) {
  return (
    <div>
      <ul className="max-h-56 overflow-y-auto">
        {options.map((option) => (
          <li key={option}>
            <label className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-xs hover:bg-(--color-surface-secondary)">
              <input type="checkbox" checked={selected.has(option)} onChange={() => onToggle(option)} />
              <span className="truncate">{option}</span>
            </label>
          </li>
        ))}
      </ul>
      <ClearRow disabled={selected.size === 0} onClear={onClear} />
    </div>
  );
}

export function ClearRow({ disabled, onClear }: { disabled: boolean; onClear: () => void }) {
  return (
    <div className="mt-2 flex justify-end border-t border-(--color-border) pt-2">
      <button
        type="button"
        disabled={disabled}
        onClick={onClear}
        className="text-xs text-(--color-primary) hover:underline disabled:text-(--color-text-tertiary) disabled:no-underline"
      >
        Limpar
      </button>
    </div>
  );
}
