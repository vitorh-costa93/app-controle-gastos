"use client";

import { useState, useTransition } from "react";
import { Plus, X } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Field";
import { deactivateReferenceItem } from "@/lib/data/reference";

interface Item {
  id: string;
  name: string;
  color?: string;
}

export function ReferenceListEditor({
  title,
  table,
  items,
  onCreate,
}: {
  title: string;
  table: "people" | "categories" | "transaction_types";
  items: Item[];
  onCreate: (name: string) => Promise<{ ok: true } | { ok: false; error: string }>;
}) {
  const [name, setName] = useState("");
  const [list, setList] = useState(items);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleAdd() {
    if (!name.trim()) return;
    setError(null);
    startTransition(async () => {
      const result = await onCreate(name.trim());
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setName("");
    });
  }

  return (
    <Card className="p-5">
      <h3 className="mb-3 text-[15px] font-semibold">{title}</h3>
      <ul className="mb-3 flex flex-wrap gap-2">
        {list.map((item) => (
          <li
            key={item.id}
            className="flex items-center gap-1.5 rounded-full bg-black/5 py-1 pl-3 pr-1.5 text-sm"
          >
            {item.color && <span className="h-2 w-2 rounded-full" style={{ backgroundColor: item.color }} />}
            {item.name}
            <button
              aria-label={`Remover ${item.name}`}
              className="rounded-full p-0.5 text-(--color-text-tertiary) hover:bg-black/10"
              onClick={() =>
                startTransition(async () => {
                  const result = await deactivateReferenceItem(table, item.id);
                  if (result.ok) setList((prev) => prev.filter((i) => i.id !== item.id));
                })
              }
            >
              <X size={12} />
            </button>
          </li>
        ))}
      </ul>
      <div className="flex gap-2">
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Adicionar novo..."
          onKeyDown={(e) => e.key === "Enter" && handleAdd()}
        />
        <Button size="sm" onClick={handleAdd} disabled={isPending || !name.trim()}>
          <Plus size={14} />
        </Button>
      </div>
      {error && <p className="mt-2 text-xs text-(--color-negative)">{error}</p>}
    </Card>
  );
}
