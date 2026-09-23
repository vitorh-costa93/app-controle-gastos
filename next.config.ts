import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // pdf-parse (pdf.js) carrega DOMMatrix/canvas nativos via @napi-rs/canvas em tempo de
  // execução — empacotado pelo Next esse carregamento quebra ("DOMMatrix is not defined").
  serverExternalPackages: ["pdf-parse", "pdfjs-dist", "@napi-rs/canvas"],
  experimental: {
    // Padrão do Next é 1mb — muito pouco para enviar várias fotos/prints de uma vez
    // (lançamento por foto aceita seleção múltipla) via Server Action.
    serverActions: {
      bodySizeLimit: "25mb",
    },
  },
};

export default nextConfig;
