import type { HighlightKind, MapId } from "@/types/domain";

/**
 * O que dá para tirar do título de um clipe ("Mirage AK-47 1V3 4K Clutch"):
 * mapa, arma, situação (1v3) e abates (4K), e o tipo (ace, clutch, multikill).
 */
const MAP_WORDS: [RegExp, MapId][] = [
  [/\bmirage\b/i, "de_mirage"],
  [/\binferno\b/i, "de_inferno"],
  [/\bnuke\b/i, "de_nuke"],
  [/\bancient\b/i, "de_ancient"],
  [/\banubis\b/i, "de_anubis"],
  [/\bdust\s*(2|ii)\b|\bd2\b/i, "de_dust2"],
  [/\btrain\b/i, "de_train"],
  [/\boverpass\b/i, "de_overpass"],
  [/\bvertigo\b/i, "de_vertigo"],
  [/\bcache\b/i, "de_cache"],
  [/\bcobble(stone)?\b/i, "de_cobblestone"],
];

const WEAPONS = [
  "AK-47",
  "M4A1-S",
  "M4A1",
  "M4A4",
  "AWP",
  "SSG 08",
  "Desert Eagle",
  "Deagle",
  "USP-S",
  "Glock-18",
  "Glock",
  "P250",
  "Tec-9",
  "Five-SeveN",
  "CZ75-Auto",
  "CZ75",
  "R8",
  "Galil AR",
  "Galil",
  "FAMAS",
  "AUG",
  "SG 553",
  "MP9",
  "MAC-10",
  "MP7",
  "UMP-45",
  "P90",
  "Nova",
  "XM1014",
  "MAG-7",
  "Negev",
  "M249",
  "Zeus",
  "Knife",
  "Faca",
];

const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/[-\s]/g, "[-\\s]?");

export interface ClipMeta {
  mapId: MapId | null;
  weapon: string | null;
  /** "1v3" */
  situation: string | null;
  /** "4K" */
  kills: string | null;
}

export function clipMeta(title: string): ClipMeta {
  const mapId = MAP_WORDS.find(([re]) => re.test(title))?.[1] ?? null;
  const weapon = WEAPONS.find((w) => new RegExp(`(^|[^A-Za-z0-9])${esc(w)}($|[^A-Za-z0-9])`, "i").test(title)) ?? null;
  const v = title.match(/\b1\s*v\s*([1-5])\b/i);
  const k = title.match(/\b([2-5])\s*k\b/i);
  return {
    mapId,
    weapon: weapon === "Deagle" ? "Desert Eagle" : weapon,
    situation: v ? `1v${v[1]}` : null,
    kills: k ? `${k[1]}K` : /\bace\b/i.test(title) ? "5K" : null,
  };
}

/** Tipo pelo título (ou etiquetas), igual à importação do Allstar. */
export function kindFromTitle(title: string, tags: string[] = []): "ace" | "clutch" | "multikill" | "clip" {
  const text = `${title} ${tags.join(" ")}`;
  if (/\bace\b|\b5\s*k\b/i.test(text)) return "ace";
  if (/clutch|\b1\s*v\s*[1-5]\b/i.test(text)) return "clutch";
  if (/\b[2-4]\s*k\b|multi/i.test(text)) return "multikill";
  return "clip";
}

/** Clipe salvo como "Clipe" genérico: o tipo vem do título (os específicos ficam como estão). */
export const effectiveKind = (kind: HighlightKind, title: string): HighlightKind =>
  kind === "clip" ? kindFromTitle(title) : kind;
