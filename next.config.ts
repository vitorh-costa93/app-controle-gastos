import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    // Padrão do Next é 1mb — muito pouco para enviar várias fotos/prints de uma vez
    // (lançamento por foto aceita seleção múltipla) via Server Action.
    serverActions: {
      bodySizeLimit: "25mb",
    },
  },
};

export default nextConfig;
