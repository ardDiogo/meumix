/**
 * Endereço amigável do mix: /mixes/outubro13 (mês + dia). Se dois mixes caírem
 * no mesmo dia/mês (anos diferentes), os mais antigos levam o ano:
 * /mixes/outubro13-2025. O endereço com o id continua funcionando.
 */
const MONTHS = [
  "janeiro",
  "fevereiro",
  "marco",
  "abril",
  "maio",
  "junho",
  "julho",
  "agosto",
  "setembro",
  "outubro",
  "novembro",
  "dezembro",
];

interface MixRef {
  id: string;
  scheduledAt: string;
}

const isoDate = (mix: MixRef) => mix.scheduledAt.slice(0, 10);

/** "2026-10-13" → "outubro13". */
export function mixBaseSlug(mix: MixRef) {
  const [, m, d] = isoDate(mix).split("-");
  return `${MONTHS[Number(m) - 1] ?? "mix"}${Number(d)}`;
}

/** Endereço único do mix, considerando os outros mixes. */
export function mixSlug(mix: MixRef, all: MixRef[]) {
  const base = mixBaseSlug(mix);
  const group = all.filter((m) => m.id === mix.id || mixBaseSlug(m) === base);
  if (!all.some((m) => m.id === mix.id)) group.push(mix);
  // Dois mixes no mesmo dia: só o id distingue.
  if (group.some((m) => m.id !== mix.id && isoDate(m) === isoDate(mix))) return mix.id;
  const newest = group.reduce((a, b) => (b.scheduledAt > a.scheduledAt ? b : a));
  return newest.id === mix.id ? base : `${base}-${isoDate(mix).slice(0, 4)}`;
}

/** Link direto (sem conhecer os outros mixes): a página resolve colisões. */
export const mixHref = (mix: MixRef) => `/mixes/${mixBaseSlug(mix)}`;

/** Encontra o mix pelo endereço amigável. */
export function findMixBySlug<T extends MixRef>(slug: string, all: T[]): T | null {
  const s = slug.toLowerCase();
  const exact = all.find((m) => mixSlug(m, all) === s);
  if (exact) return exact;
  // Link base de um dia com mais de um mix: o mais recente.
  return all.filter((m) => mixBaseSlug(m) === s).sort((a, b) => b.scheduledAt.localeCompare(a.scheduledAt))[0] ?? null;
}
