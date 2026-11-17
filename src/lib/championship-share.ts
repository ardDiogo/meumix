import { formatMoney, PLAYOFF_TEAMS, type Championship } from "./championship";

/** Mensagem do WhatsApp para chamar a galera para o campeonato (com o link de inscrição em 1 toque). */
export function championshipShareText(
  c: Pick<
    Championship,
    "name" | "edition" | "teamCount" | "playersPerTeam" | "playoffFormat" | "entryFee" | "teamMode"
  >,
  info: { registered: number; vagas: number; firstPrize: number | null; url: string },
) {
  const left = Math.max(0, info.vagas - info.registered);
  const playoffs = PLAYOFF_TEAMS[c.playoffFormat];
  const lines = [
    `🏆 *${c.name.toUpperCase()}*${c.edition ? ` — ${c.edition}` : ""} 🏆`,
    "",
    "Chega de resenha no Discord: agora é pra valer! 🔥",
    `${c.teamCount} times, ${c.playersPerTeam}x${c.playersPerTeam}, ${c.teamMode === "draft" ? "times montados no *draft* pelos capitães, pote por pote (ninguém escolhe panela 👀)" : "cada time monta o seu elenco"}${playoffs ? ` e *playoffs* com os ${playoffs} melhores` : ""}.`,
    "",
    ...(c.entryFee > 0
      ? [
          `💰 Inscrição: *${formatMoney(c.entryFee)}*${info.firstPrize ? ` · o 1º lugar leva *${formatMoney(info.firstPrize)}*` : ""}`,
        ]
      : []),
    left > 0
      ? `🎟️ *${info.registered}/${info.vagas}* inscritos — restam ${left === 1 ? "*1 vaga*" : `*${left} vagas*`}! Quem dormir vai assistir da arquibancada 🍿`
      : `🎟️ *${info.vagas}/${info.vagas}* — lotado! Fica de olho na próxima 👀`,
    "",
    left > 0 ? "👉 Toque e já se inscreva:" : "👉 Acompanhe:",
    info.url,
  ];
  return lines.join("\n");
}
