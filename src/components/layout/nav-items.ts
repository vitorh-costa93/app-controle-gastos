import { LayoutGrid, LineChart, Wallet, Settings } from "lucide-react";

export const NAV_ITEMS = [
  { href: "/cadastro", label: "Cadastro", icon: Wallet },
  { href: "/analise", label: "Análise", icon: LineChart },
  { href: "/simulacao", label: "Simulação", icon: LayoutGrid },
] as const;

export const SETTINGS_ITEM = {
  href: "/configuracoes",
  label: "Configurações",
  icon: Settings,
} as const;
