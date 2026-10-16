import { Info } from "lucide-react";
import { Card, CardContent, CardHeader } from "../ui/card";

const COLS = ["K", "A", "D", "DIFF", "ADR", "KDR", "KAST", "S", "FA", "MK", "FK", "RP", "DROP"];

const TEAMS = [
  {
    score: 13,
    name: "Time Alfa",
    win: true,
    players: [
      ["jogador1", 26, 6, 14, 12, "108.6", "1.86", "78%", "-", 2, 7, 6, 18, ""],
      ["jogador2", 19, 12, 18, 1, "93.5", "1.06", "75%", "-", 1, 4, 2, 9, ""],
      ["jogador3", 15, 9, 15, 0, "78.2", "1.00", "67%", "-", 0, 4, 1, 4, ""],
      ["jogador4", 13, 3, 16, -3, "65.8", "0.81", "64%", "-", 0, 2, 1, 2, ""],
      ["jogador5", 9, 4, 17, -8, "57.9", "0.53", "56%", "-", 0, 1, 2, -3, ""],
    ],
  },
  {
    score: 11,
    name: "Time Beta",
    win: false,
    players: [
      ["jogador6", 25, 3, 15, 10, "113.0", "1.67", "79%", "-", 0, 6, 4, 9, ""],
      ["jogador7", 17, 7, 22, -5, "84.3", "0.77", "67%", "-", 0, 3, 3, -10, ""],
      ["jogador8", 16, 4, 20, -4, "80.3", "0.80", "75%", "-", 0, 2, 1, -12, ""],
      ["jogador9", 14, 5, 19, -5, "71.0", "0.74", "65%", "-", 0, 1, 2, -14, ""],
      ["jogador10", 9, 5, 19, -10, "50.8", "0.47", "58%", "-", 0, 1, 0, -18, ""],
    ],
  },
] as const;

/** Exemplo ilustrativo do print do placar da GC (dados fictícios). */
export function GcExample() {
  return (
    <Card>
      <CardHeader
        title={
          <span className="flex items-center gap-2">
            <Info className="size-4 text-win" aria-hidden /> Como enviar as imagens
          </span>
        }
        description="Tire prints da tabela de estatísticas do jogo mostrando claramente todos os jogadores, suas kills (K), assists (A), mortes (D) e demais estatísticas de cada mapa jogado. Envie uma imagem por mapa, com o nome do mapa no nome do arquivo (ex.: mirage.png, nuke.png)."
      />
      <CardContent>
        <figure className="overflow-hidden rounded-lg border border-border bg-[#14161b]">
          <div className="overflow-x-auto p-3">
            <div className="min-w-[640px] space-y-3 text-[11px]">
              {TEAMS.map((t, ti) => (
                <div key={t.name}>
                  {ti > 0 && (
                    <div className="mb-3 flex items-center justify-center">
                      <span className="rounded-full border border-border px-2 py-0.5 text-[10px] text-subtle">vs</span>
                    </div>
                  )}
                  <div className="mb-1.5 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className={`font-display text-lg font-bold ${t.win ? "text-win" : "text-loss"}`}>
                        {t.score}
                      </span>
                      <span className="font-semibold">{t.name}</span>
                    </div>
                    <span className="text-[10px] text-subtle uppercase">Probabilidade de vitória</span>
                  </div>
                  <table className="w-full border-separate border-spacing-y-0.5">
                    <thead>
                      <tr className="text-subtle">
                        <th className="w-28 text-left font-medium">Jogador</th>
                        {COLS.map((c) => (
                          <th key={c} className="px-1 text-right font-medium">
                            {c}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {t.players.map(([nick, ...stats]) => (
                        <tr key={nick} className="bg-surface-2/60">
                          <td className="rounded-l px-1.5 py-1 font-medium">{nick}</td>
                          {stats.map((v, i) => (
                            <td
                              key={i}
                              className={`px-1 py-1 text-right tabular last:rounded-r ${
                                COLS[i] === "RP" && typeof v === "number"
                                  ? v >= 0
                                    ? "text-win"
                                    : "text-loss"
                                  : "text-muted"
                              }`}
                            >
                              {v}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ))}
            </div>
          </div>
          <figcaption className="border-t border-border px-3 py-2 text-center text-xs text-brand">
            Exemplo: tabela de estatísticas do jogo (dados fictícios)
          </figcaption>
        </figure>
      </CardContent>
    </Card>
  );
}
