import { getBrandIcon } from "@/lib/brand-icons";
import { BrandIcon } from "./BrandIcon";
import { CategoryIcon } from "./CategoryIcon";
import { getDescriptionSymbol } from "@/lib/description-icons";
import { DescriptionSymbolIcon } from "./DescriptionSymbolIcon";

/** Local identities: descriptions never leave the application to resolve a logo. */
export function DescriptionIcon({ description, categoryName = "", size = 16 }: { description: string; categoryName?: string; size?: number }) {
  const brand = getBrandIcon(description);
  if (brand) return <BrandIcon brand={brand} size={size} />;
  const symbol = getDescriptionSymbol(description);
  if (symbol) return <DescriptionSymbolIcon symbol={symbol} size={size} />;
  return <CategoryIcon name={categoryName} size={size} />;
}
