import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  experimental: {
    // Prints da GC são enviados um por vez, já reduzidos no navegador.
    serverActions: { bodySizeLimit: "4mb" },
  },
};

export default nextConfig;
