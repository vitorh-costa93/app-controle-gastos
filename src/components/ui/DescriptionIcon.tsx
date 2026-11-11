import { getBrandIcon } from "@/lib/brand-icons";
import { BrandIcon } from "./BrandIcon";
import { CategoryIcon } from "./CategoryIcon";

/** Local identities: descriptions never leave the application to resolve a logo. */
export function DescriptionIcon({ description, categoryName = "", size = 16 }: { description: string; categoryName?: string; size?: number }) {
  const brand = getBrandIcon(description);
  if (brand) return <BrandIcon brand={brand} size={size} />;
  const value = description.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  const categoryBrand = getBrandIcon(categoryName);
  if (categoryBrand) return <BrandIcon brand={categoryBrand} size={size} />;
  const alias = /\buber\b|\b99\b|combustivel|gasolina/.test(value) ? "Transporte"
    : /supermercado|mercado|atacadao/.test(value) ? "Supermercado"
    : /drogaria|farmacia/.test(value) ? "Saúde"
    : /restaurante|delivery|lanchonete/.test(value) ? "Alimentação"
    : /internet|fibra/.test(value) ? "Internet" : categoryName;
  return <CategoryIcon name={alias} size={size} />;
}
