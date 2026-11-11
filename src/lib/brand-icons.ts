export type BrandIconData = { id: string; name: string; src: string; color: string; background: string };

const brands: Array<{ pattern: RegExp; brand: BrandIconData }> = [
  { pattern: /\b99[\s-]*food\b/, brand: { id: "99food", name: "99Food", src: "/brands/99food.png", color: "#111111", background: "#fff3cd" } },
  { pattern: /\bsupabase\b/, brand: { id: "supabase", name: "Supabase", src: "/brands/supabase.svg", color: "#3ecf8e", background: "#e7f9ef" } },
  { pattern: /\bi[\s-]*food\b|\bifd\b/, brand: { id: "ifood", name: "iFood", src: "/brands/ifood.svg", color: "#ea1d2c", background: "#fff0f1" } },
  { pattern: /\bshopee\b/, brand: { id: "shopee", name: "Shopee", src: "/brands/shopee.svg", color: "#ee4d2d", background: "#fff1ec" } },
  { pattern: /\bsavegnago\b/, brand: { id: "savegnago", name: "Savegnago", src: "/brands/savegnago.png", color: "#e52528", background: "#ffffff" } },
  { pattern: /\bjau[\s-]*serve\b/, brand: { id: "jauserve", name: "Jaú Serve", src: "/brands/jauserve.png", color: "#262064", background: "#ffffff" } },
  { pattern: /\bvivo\b/, brand: { id: "vivo", name: "Vivo", src: "/brands/vivo.png", color: "#660099", background: "#f5edfa" } },
  { pattern: /\bnubank\b/, brand: { id: "nubank", name: "Nubank", src: "/brands/nubank.svg", color: "#820ad1", background: "#f4eafe" } },
  { pattern: /\bpicpay\b/, brand: { id: "picpay", name: "PicPay", src: "/brands/picpay.svg", color: "#07925a", background: "#def8ed" } },
  { pattern: /\bi[\s-]*racing\b/, brand: { id: "iracing", name: "iRacing", src: "/brands/iracing.png", color: "#154578", background: "#ffffff" } },
  { pattern: /\bclaude\b|\banthropic\b/, brand: { id: "claude", name: "Claude", src: "/brands/claude.svg", color: "#d97757", background: "#fff2ec" } },
  { pattern: /\bunimed\b/, brand: { id: "unimed", name: "Unimed", src: "/brands/unimed-symbol.png", color: "#00864a", background: "#ffffff" } },
  { pattern: /\bopenai\b|\bopen[\s-]+ai\b|\bchat[\s-]*gpt\b/, brand: { id: "chatgpt", name: "ChatGPT", src: "/brands/chatgpt.png", color: "#000000", background: "#f0f0f0" } },
  { pattern: /\b(?:google[\s-]+)?gemini\b/, brand: { id: "gemini", name: "Gemini", src: "/brands/gemini.png", color: "#8e75b2", background: "#f1edff" } },
  { pattern: /\bgoogle\b/, brand: { id: "google", name: "Google", src: "/brands/google.png", color: "#4285f4", background: "#edf4ff" } },
  { pattern: /\bapple\b/, brand: { id: "apple", name: "Apple", src: "/brands/apple.svg", color: "#000000", background: "#f0f0f0" } },
  { pattern: /\bprime[\s-]*video\b|\bamazon[\s-]+prime\b/, brand: { id: "primevideo", name: "Prime Video", src: "/brands/primevideo.png", color: "#00a8e1", background: "#e8f7ff" } },
  { pattern: /\bamazon\b/, brand: { id: "amazon", name: "Amazon", src: "/brands/amazon.png", color: "#ff9900", background: "#ffffff" } },
  { pattern: /\bnetflix\b/, brand: { id: "netflix", name: "Netflix", src: "/brands/netflix.svg", color: "#e50914", background: "#fff0f1" } },
  { pattern: /\bspotify\b/, brand: { id: "spotify", name: "Spotify", src: "/brands/spotify.svg", color: "#087f43", background: "#def9e9" } },
];

/** Resolve apenas nomes reconhecidos, sem enviar descrições para serviços externos. */
export function getBrandIcon(name: string): BrandIconData | null {
  const value = name.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  return brands.find(({ pattern }) => pattern.test(value))?.brand ?? null;
}
