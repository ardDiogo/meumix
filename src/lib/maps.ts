import type { GameMap, MapId } from "@/types/domain";

export const MAPS: Record<MapId, GameMap> = {
  de_mirage: { id: "de_mirage", name: "Mirage", active: true },
  de_inferno: { id: "de_inferno", name: "Inferno", active: true },
  de_nuke: { id: "de_nuke", name: "Nuke", active: true },
  de_ancient: { id: "de_ancient", name: "Ancient", active: true },
  de_anubis: { id: "de_anubis", name: "Anubis", active: true },
  de_dust2: { id: "de_dust2", name: "Dust II", active: true },
  de_train: { id: "de_train", name: "Train", active: true },
  de_overpass: { id: "de_overpass", name: "Overpass", active: false },
  de_vertigo: { id: "de_vertigo", name: "Vertigo", active: false },
};

export const ACTIVE_MAP_POOL = Object.values(MAPS).filter((m) => m.active);

/** Nome do mapa; mapas cadastrados no admin caem no id sem o prefixo "de_". */
export const mapName = (id: MapId) => MAPS[id]?.name ?? id.replace(/^de_/, "").replace(/^\w/, (c) => c.toUpperCase());

/**
 * Emblema oficial da coleção do mapa (ícones do CS2). Os que estão em
 * /public/maps são servidos pelo próprio site; o Ancient vem do CDN da Steam.
 */
const LOCAL_ICONS = new Set([
  "de_dust2",
  "de_mirage",
  "de_inferno",
  "de_nuke",
  "de_anubis",
  "de_train",
  "de_overpass",
  "de_vertigo",
]);
const REMOTE_ICONS: Record<string, string> = {
  de_ancient:
    "https://cdn.steamstatic.com/apps/730/icons/econ/set_icons/set_op10_ancient.e90a2018381216be882d96c9e6c314d99f5097fa.png",
  de_cache:
    "https://cdn.steamstatic.com/apps/730/icons/econ/set_icons/set_cache.1bdc24f9fbd7532a2eb3e26d6ac33e52fc4a0efc.png",
};

export const mapIcon = (id: MapId): string | null =>
  LOCAL_ICONS.has(id) ? `/maps/${id}.png` : (REMOTE_ICONS[id] ?? null);
