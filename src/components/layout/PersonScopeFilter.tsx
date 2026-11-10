"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Person } from "@/types/db";
import { useInterface } from "./InterfaceProvider";

export function PersonScopeFilter({ people }: { people: Person[] }) {
  const { isModern } = useInterface();
  const params = useSearchParams();
  const pathname = usePathname();
  const router = useRouter();
  if (!isModern) return null;
  return <label className="person-scope-filter">Exibir gastos de <select value={params.get("personId") ?? ""} onChange={(event) => { const next = new URLSearchParams(params.toString()); if (event.target.value) next.set("personId", event.target.value); else next.delete("personId"); router.push(`${pathname}?${next}`); }}><option value="">Casal</option>{people.map((person) => <option key={person.id} value={person.id}>{person.name}</option>)}</select></label>;
}
