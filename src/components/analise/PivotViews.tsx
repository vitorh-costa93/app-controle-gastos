"use client";

import { useEffect, useRef, useState } from "react";
import { Bookmark, Save } from "lucide-react";
import { listPivotBookmarks, savePivotBookmark } from "@/lib/data/pivot-bookmarks";
import type { PivotBookmark } from "@/lib/pivot-bookmarks";

export function PivotViews({ config, onApply }: { config: PivotBookmark["config"]; onApply: (config: PivotBookmark["config"]) => void }) {
  const [bookmarks, setBookmarks] = useState<PivotBookmark[]>([]);
  const [open, setOpen] = useState<"views" | "save" | null>(null);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const control = "h-8 rounded-md border border-(--color-border) bg-(--color-surface) px-3 text-xs disabled:opacity-50";

  useEffect(() => {
    let cancelled = false;
    listPivotBookmarks().then((items) => { if (!cancelled) setBookmarks(items); })
      .catch(() => { if (!cancelled) setError("Não foi possível carregar as views. Recolha e abra para tentar novamente."); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!open || saving) return;
    function key(e: KeyboardEvent) { if (e.key === "Escape") setOpen(null); }
    function outside(e: PointerEvent) { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(null); }
    document.addEventListener("keydown", key);
    document.addEventListener("pointerdown", outside);
    return () => { document.removeEventListener("keydown", key); document.removeEventListener("pointerdown", outside); };
  }, [open, saving]);

  async function save(e: React.FormEvent) {
    e.preventDefault(); setSaving(true); setError("");
    try {
      const bookmark = await savePivotBookmark({ id: crypto.randomUUID(), title: title.trim(), description: description.trim(), config });
      setBookmarks((items) => [...items, bookmark]); setTitle(""); setDescription(""); setOpen("views");
    } catch { setError("Não foi possível salvar a view. Tente novamente."); }
    finally { setSaving(false); }
  }

  return (
    <div ref={ref} className="mt-4 space-y-2">
      <div className="flex flex-wrap justify-end gap-2">
        <button type="button" disabled={saving} className={control} aria-expanded={open === "views"} onClick={() => setOpen(open === "views" ? null : "views")}><Bookmark size={13} className="mr-1 inline" />Views</button>
        <button type="button" disabled={saving} className={control} aria-expanded={open === "save"} onClick={() => setOpen(open === "save" ? null : "save")}><Save size={13} className="mr-1 inline" />Salvar bookmark</button>
      </div>
      {error && <p role="alert" className="text-xs text-(--color-negative)">{error}</p>}
      {open === "views" && (
        <div className="ml-auto max-h-80 w-full max-w-sm overflow-y-auto rounded-lg border border-(--color-border) bg-(--color-surface) p-2 shadow-(--shadow-md)">
          {loading ? <p className="p-2 text-xs">Carregando views...</p> : bookmarks.length === 0 && <p className="p-2 text-xs">Nenhuma view salva. Configure a tabela e salve um bookmark.</p>}
          {bookmarks.map((b) => <button key={b.id} type="button" onClick={() => { onApply(b.config); setOpen(null); }} className="block w-full rounded-md p-3 text-left hover:bg-(--color-surface-secondary)"><span className="block break-words text-sm font-semibold">{b.title}</span><span className="block whitespace-pre-wrap break-words text-xs text-(--color-text-secondary)">{b.description}</span></button>)}
        </div>
      )}
      {open === "save" && (
        <form onSubmit={save} className="ml-auto grid w-full max-w-sm gap-3 rounded-lg border border-(--color-border) p-4">
          <label className="grid gap-1 text-xs">Título do bookmark<input autoFocus required maxLength={100} disabled={saving} value={title} onChange={(e) => setTitle(e.target.value)} className={control} /></label>
          <label className="grid gap-1 text-xs">Descrição<textarea maxLength={500} rows={3} disabled={saving} value={description} onChange={(e) => setDescription(e.target.value)} className="rounded-md border border-(--color-border) bg-(--color-surface) p-2" /></label>
          <div className="flex justify-end gap-2"><button type="button" disabled={saving} className={control} onClick={() => setOpen(null)}>Cancelar</button><button type="submit" disabled={saving || !title.trim()} className={control}>{saving ? "Salvando..." : "Salvar"}</button></div>
        </form>
      )}
    </div>
  );
}
