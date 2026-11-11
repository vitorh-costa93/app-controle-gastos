import { Wifi } from "lucide-react";
import Image from "next/image";
import { getBrandIcon } from "@/lib/brand-icons";
import { formatCurrencyBRL } from "@/lib/utils/format";

export function BankCard({ bank, amountCents, subtitle = "Saídas do mês", onClick, selected }: { bank: "nubank" | "picpay"; amountCents: number; subtitle?: string; onClick?: () => void; selected?: boolean }) {
  const brand = getBrandIcon(bank)!;
  const content = <><div className="bank-card-top"><Image src={brand.src} alt={brand.name} width={72} height={32} className="bank-brand-logo" />{selected && <span className="bank-card-selection">Selecionado</span>}</div><div className="bank-card-hardware"><span className="bank-chip" /><Wifi size={22} strokeWidth={1.5} /></div><div className="bank-card-bottom"><span>{subtitle}</span><strong>{formatCurrencyBRL(amountCents)}</strong></div></>;
  return onClick ? <button type="button" className={`bank-card bank-card--${bank}`} onClick={onClick} aria-pressed={selected} aria-label={`${bank === "nubank" ? "Nubank" : "PicPay"}: ${formatCurrencyBRL(amountCents)}. ${subtitle}`}>{content}</button> : <div className={`bank-card bank-card--${bank}`}>{content}</div>;
}
