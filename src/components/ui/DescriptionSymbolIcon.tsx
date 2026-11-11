import { Activity, BicepsFlexed, Brain, Car, Droplets, Dumbbell, Fuel, HandHeart, PawPrint, PersonStanding, Pill, Salad, Scissors, ShieldCheck, ShoppingBasket, Smartphone, Sparkles, SprayCan, Utensils, Wifi, Wrench, Zap } from "lucide-react";
import type { DescriptionSymbol } from "@/lib/description-icons";

function NailPolish({ size, strokeWidth }: { size: number; strokeWidth?: number }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="2" width="6" height="8" rx="1" /><rect x="6" y="12" width="12" height="10" rx="2" /><path d="M10 10v2m4-2v2m-5 4h6" /></svg>;
}
function Eyebrows({ size, strokeWidth }: { size: number; strokeWidth?: number }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round"><path d="M3 8c3-4 7-4 10-2l7 1M3 15c4-5 11-5 16 0-5 5-12 5-16 0Z" /><circle cx="11" cy="15" r="2" /></svg>;
}
function Dental({ size, strokeWidth }: { size: number; strokeWidth?: number }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round"><path d="M12 4c-5-4-9 0-8 5l2 10c1 4 3 2 4-3 1-4 3-4 4 0 1 5 3 7 4 3l2-10c1-5-3-9-8-5ZM9 4l4 2" /></svg>;
}
const icons = { nails: NailPolish, eyebrows: Eyebrows, trainer: BicepsFlexed, gym: Dumbbell, hair: Scissors, beauty: Sparkles, massage: HandHeart, pilates: PersonStanding, nutrition: Salad, therapy: Brain, dentist: Dental, physio: Activity, cleaning: SprayCan, repair: Wrench, pet: PawPrint, fuel: Fuel, market: ShoppingBasket, food: Utensils, internet: Wifi, phone: Smartphone, insurance: ShieldCheck, transport: Car, pharmacy: Pill, energy: Zap, water: Droplets };

export function DescriptionSymbolIcon({ symbol, size = 16, className = "" }: { symbol: DescriptionSymbol; size?: number; className?: string }) {
  const Icon = icons[symbol.key];
  return <span className={`category-icon category-icon--${symbol.tone} ${className}`} aria-hidden="true"><Icon size={size} strokeWidth={1.7} /></span>;
}
