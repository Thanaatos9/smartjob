import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  // Bibliothèques Node de la veille (IMAP, lecture des emails) : chargées telles
  // quelles au lieu d'être empaquetées, et copiées dans la sortie standalone.
  serverExternalPackages: ["imapflow", "mailparser"],
  experimental: {
    serverActions: {
      bodySizeLimit: "10mb",
    },
  },
};

export default nextConfig;
