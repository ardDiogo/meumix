/**
 * Lista de jogadores colada pelo admin: uma pessoa por linha,
 * "nick  nome  e-mail  [nível GC]" separados por tab, ";" ou "|".
 */
export interface BulkRow {
  line: number;
  nick: string;
  fullName: string;
  email: string;
  gcLevel: number | null;
  error: string | null;
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function parseBulkUsers(text: string): BulkRow[] {
  const seen = new Set<string>();
  return text
    .split(/\r?\n/)
    .map((raw, i) => ({ raw: raw.trim(), line: i + 1 }))
    .filter((r) => r.raw)
    .map(({ raw, line }) => {
      const cols = raw
        .split(/\t|;|\|/)
        .map((c) => c.trim())
        .filter(Boolean);
      const emailIdx = cols.findIndex((c) => EMAIL.test(c));
      const email = emailIdx >= 0 ? cols[emailIdx]!.toLowerCase() : "";
      const before = emailIdx >= 0 ? cols.slice(0, emailIdx) : cols;
      const after = emailIdx >= 0 ? cols.slice(emailIdx + 1) : [];
      const nick = before[0] ?? "";
      const fullName = before.slice(1).join(" ");
      const gcRaw = after[0];
      const gc = gcRaw === undefined ? null : Number(gcRaw);

      let error: string | null = null;
      if (!email) error = "e-mail não encontrado";
      else if (seen.has(email)) error = "e-mail repetido na lista";
      else if (nick.length < 2 || nick.length > 24) error = "nick deve ter de 2 a 24 caracteres";
      else if (gc !== null && !(Number.isInteger(gc) && gc >= 0 && gc <= 20)) error = "nível GC deve ser de 0 a 20";
      if (email) seen.add(email);
      return { line, nick, fullName, email, gcLevel: gc, error };
    });
}
