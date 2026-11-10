import { Activity, Baby, BookOpen, Brain, BriefcaseBusiness, Car, CircleDollarSign, CreditCard, Droplets, Dumbbell, Gamepad2, Heart, House, Landmark, Laptop, PawPrint, Plane, ReceiptText, ShoppingBag, ShoppingBasket, Utensils, Wifi, Zap } from "lucide-react";

/** One visual identity per category, shared by summaries, tables and editors. */
export function CategoryIcon({ name, size = 16, className = "" }: { name: string; size?: number; className?: string }) {
  const value = name.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  if (value === "nubank" || value === "picpay") return <span className={`category-icon category-icon--${value === "nubank" ? "violet" : "green"} ${className}`} aria-hidden="true"><b className={`bank-mini-mark bank-mini-mark--${value}`}>{value === "nubank" ? "nu" : "P"}</b></span>;
  const [Icon, tone] = /internet|wifi/.test(value) ? [Wifi, "blue"] as const
    : /luz|energia|eletric/.test(value) ? [Zap, "amber"] as const
    : /agua/.test(value) ? [Droplets, "blue"] as const
    : /saude|unimed|medic|farmacia/.test(value) ? [Heart, "rose"] as const
    : /psicolog|terapia/.test(value) ? [Brain, "rose"] as const
    : /financia|emprestimo/.test(value) ? [Landmark, "violet"] as const
    : /moradia|aluguel|condominio|casa/.test(value) ? [House, "blue"] as const
    : /mercado|supermercado/.test(value) ? [ShoppingBasket, "green"] as const
    : /alimenta|restaurante|comida/.test(value) ? [Utensils, "amber"] as const
    : /transporte|carro|combust|veiculo|uber/.test(value) ? [Car, "green"] as const
    : /lazer|stream|entreten/.test(value) ? [Gamepad2, "violet"] as const
    : /educa|curso|livro/.test(value) ? [BookOpen, "blue"] as const
    : /academia|esporte/.test(value) ? [Dumbbell, "violet"] as const
    : /pet|animal/.test(value) ? [PawPrint, "amber"] as const
    : /viage|turismo/.test(value) ? [Plane, "blue"] as const
    : /crianca|filho|bebe/.test(value) ? [Baby, "rose"] as const
    : /salario|renda|reserva|invest/.test(value) ? [CircleDollarSign, "green"] as const
    : /trabalho|imposto/.test(value) ? [BriefcaseBusiness, "blue"] as const
    : /tecnolog|eletronic/.test(value) ? [Laptop, "violet"] as const
    : /picpay/.test(value) ? [CreditCard, "green"] as const
    : /cartao|nubank/.test(value) ? [CreditCard, "violet"] as const
    : /compra|roupa/.test(value) ? [ShoppingBag, "amber"] as const
    : /servic/.test(value) ? [Activity, "blue"] as const : [ReceiptText, "blue"] as const;
  return <span className={`category-icon category-icon--${tone} ${className}`} aria-hidden="true"><Icon size={size} strokeWidth={1.7} /></span>;
}
