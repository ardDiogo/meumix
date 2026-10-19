import type { MetadataRoute } from "next";

/** Manifesto do app (PWA): instalável no celular e no computador. */
export default function manifest(): MetadataRoute.Manifest {
  const icon = (src: string, sizes: string, purpose?: "any" | "maskable") => ({
    src,
    sizes,
    type: "image/png",
    ...(purpose ? { purpose } : {}),
  });
  return {
    id: "/",
    name: "MeuMix — Mixes de CS2",
    short_name: "MeuMix",
    description: "Mixes de CS2: confirmação de presença, times, placares, ranking e desempenho dos jogadores.",
    lang: "pt-BR",
    dir: "ltr",
    start_url: "/dashboard?origem=app",
    scope: "/",
    display: "standalone",
    display_override: ["standalone", "minimal-ui"],
    orientation: "any",
    background_color: "#08090B",
    theme_color: "#08090B",
    categories: ["games", "sports", "entertainment"],
    icons: [
      icon("/pwa/icon-192.png", "192x192", "any"),
      icon("/pwa/icon-512.png", "512x512", "any"),
      icon("/pwa/maskable-192.png", "192x192", "maskable"),
      icon("/pwa/maskable-512.png", "512x512", "maskable"),
    ],
    shortcuts: [
      {
        name: "Confirmar presença",
        short_name: "Confirmar",
        description: "Entrar na lista do próximo mix",
        url: "/confirmar",
        icons: [icon("/pwa/icon-96.png", "96x96")],
      },
      { name: "Mixes", url: "/mixes", icons: [icon("/pwa/icon-96.png", "96x96")] },
      { name: "Ranking", url: "/rankings", icons: [icon("/pwa/icon-96.png", "96x96")] },
      { name: "Minha conta", url: "/conta", icons: [icon("/pwa/icon-96.png", "96x96")] },
    ],
  };
}
