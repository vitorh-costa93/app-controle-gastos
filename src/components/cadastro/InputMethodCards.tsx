"use client";

import { Mic, Camera, Type, FileText } from "lucide-react";
import { cn } from "@/lib/utils/cn";

const METHODS = [
  { id: "audio", label: "Áudio", icon: Mic },
  { id: "photo", label: "Foto", icon: Camera },
  { id: "text", label: "Texto", icon: Type },
  { id: "pdf", label: "PDF", icon: FileText },
] as const;

export type InputMethod = (typeof METHODS)[number]["id"];

export function InputMethodCards({ onSelect }: { onSelect: (method: InputMethod) => void }) {
  return (
    <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
      {METHODS.map((method) => {
        const Icon = method.icon;
        return (
          <button
            key={method.id}
            onClick={() => onSelect(method.id)}
            className={cn(
              "flex flex-col items-center justify-center gap-2 rounded-(--radius-lg) border border-(--color-border) bg-(--color-surface) py-6 transition-colors hover:border-(--color-primary)/40 hover:bg-(--color-primary-soft)/40"
            )}
          >
            <Icon size={22} strokeWidth={1.75} className="text-(--color-primary)" />
            <span className="text-sm font-medium">{method.label}</span>
          </button>
        );
      })}
    </div>
  );
}
