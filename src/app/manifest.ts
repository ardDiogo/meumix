import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "MeuMix",
    short_name: "MeuMix",
    description: "Mixes de CS2, rankings e desempenho dos jogadores.",
    start_url: "/dashboard",
    display: "standalone",
    background_color: "#08090B",
    theme_color: "#08090B",
    icons: [{ src: "/icon.png", sizes: "512x512", type: "image/png" }],
  };
}
