import type { BrandIconData } from "@/lib/brand-icons";

/** A marca é decorativa: o nome acompanha o ícone na interface. */
export function BrandIcon({ brand, size = 16, className = "" }: { brand: BrandIconData; size?: number; className?: string }) {
  return <span aria-hidden="true" title={brand.name} className={`category-icon description-brand ${className}`} style={{ background: brand.background }}>
    {/* Arquivos locais pequenos, sem dependência de serviço de imagens. */}
    {/* eslint-disable-next-line @next/next/no-img-element */}
    <img src={brand.src} alt="" width={size + 4} height={size + 4} style={{ objectFit: "contain", maxWidth: "90%", maxHeight: "90%" }} />
  </span>;
}
