import { CategoryIcon } from "./CategoryIcon";

/** Local identities: descriptions never leave the application to resolve a logo. */
export function DescriptionIcon({ description, categoryName = "", size = 16 }: { description: string; categoryName?: string; size?: number }) {
  const value = description.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  const brand = /\bnetflix\b/.test(value) ? { name: "Netflix", mark: "N", color: "#e50914", background: "#fff0f1" }
    : /\bspotify\b/.test(value) ? { name: "Spotify", mark: "≋", color: "#087f43", background: "#def9e9" }
    : /\bunimed\b/.test(value) ? { name: "Unimed", mark: "+", color: "#00864a", background: "#e0f6eb" }
    : /\bnubank\b/.test(value) ? { name: "Nubank", mark: "nu", color: "#820ad1", background: "#f4eafe" }
    : /\bpicpay\b/.test(value) ? { name: "PicPay", mark: "P", color: "#07925a", background: "#def8ed" }
    : /\bamazon\b|\bprime video\b/.test(value) ? { name: "Amazon", mark: "a", color: "#177da9", background: "#e8f7ff" }
    : /\bifood\b/.test(value) ? { name: "iFood", mark: "if", color: "#ea1d2c", background: "#fff0f1" }
    : null;
  if (brand) return <span aria-hidden="true" title={brand.name} className="category-icon description-brand" style={{ color: brand.color, background: brand.background, fontSize: size + 2, fontWeight: 750, letterSpacing: "-.06em" }}>{brand.mark}</span>;
  // Only recognized aliases may override the category's visual identity.
  const alias = /\buber\b|\b99\b|combustivel|gasolina/.test(value) ? "Transporte"
    : /supermercado|mercado|atacadao/.test(value) ? "Supermercado"
    : /drogaria|farmacia/.test(value) ? "Saúde"
    : /restaurante|delivery|lanchonete/.test(value) ? "Alimentação"
    : /internet|fibra/.test(value) ? "Internet" : categoryName;
  return <CategoryIcon name={alias} size={size} />;
}
