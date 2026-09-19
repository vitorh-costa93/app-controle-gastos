"use client";

import { useState } from "react";

function centsToDisplay(cents: number): string {
  if (!cents) return "";
  return (cents / 100).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function digitsToCents(digits: string): number {
  const clean = digits.replace(/\D/g, "");
  return clean ? parseInt(clean, 10) : 0;
}

export function CurrencyInput({
  valueCents,
  onChange,
  id,
  placeholder = "0,00",
}: {
  valueCents: number;
  onChange: (cents: number) => void;
  id?: string;
  placeholder?: string;
}) {
  const [display, setDisplay] = useState(centsToDisplay(valueCents));
  const [syncedCents, setSyncedCents] = useState(valueCents);

  if (valueCents !== syncedCents) {
    setSyncedCents(valueCents);
    setDisplay(centsToDisplay(valueCents));
  }

  return (
    <div className="flex h-10 items-center gap-1 rounded-(--radius-md) border border-(--color-border) bg-(--color-surface) px-3 focus-within:ring-2 focus-within:ring-(--color-primary)/30">
      <span className="text-sm text-(--color-text-tertiary)">R$</span>
      <input
        id={id}
        inputMode="decimal"
        placeholder={placeholder}
        value={display}
        onChange={(e) => {
          const cents = digitsToCents(e.target.value);
          setDisplay(centsToDisplay(cents));
          setSyncedCents(cents);
          onChange(cents);
        }}
        className="tabular-nums w-full bg-transparent text-sm text-(--color-text-primary) outline-none"
      />
    </div>
  );
}
