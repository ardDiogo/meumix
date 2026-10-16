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
export const mapName = (id: MapId) =>
  MAPS[id]?.name ?? id.replace(/^de_/, "").replace(/^\w/, (c) => c.toUpperCase());
