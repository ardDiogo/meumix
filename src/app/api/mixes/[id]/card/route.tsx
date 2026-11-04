import { ImageResponse } from "next/og";
import { byMixScore, diffOf, kdrOf, matchHighlights, type HighlightKey, type StatRow } from "@/lib/match-highlights";
import {
  aggregateGc,
  GC_HIGHLIGHT_TEXT,
  gcHighlights,
  orderHighlights,
  roundBreakAfter,
  type GcHighlightKey,
} from "@/lib/gc-analysis";
import { getGcMaps } from "@/services/gc-maps";
import { mapIcon, mapName } from "@/lib/maps";
import { seriesScore, seriesWinner } from "@/lib/stats";
import { getMatchReport } from "@/services/match-report";
import { getDataSource } from "@/services";

/**
 * Card único do resultado do mix (PNG, 1080×1920) para compartilhar no
 * WhatsApp: topo com a arte do site, placar com as fotos dos times, mapas com
 * os rounds, resumo, MVP e lanterna, destaques e as estatísticas dos
 * jogadores. A crônica vai escrita na mensagem, não na imagem.
 */

const C = {
  bg: "#08090B",
  surface: "#121419",
  surface2: "#191C22",
  border: "#2A2D34",
  brand: "#FF6A00",
  fg: "#F5F5F5",
  muted: "#A1A1AA",
  subtle: "#71717A",
  win: "#22C55E",
  loss: "#F05252",
};

const WIDTH = 1080;
const HEIGHT = 1920;

/* --------------------------------- Fontes -------------------------------- */

type Font = { name: string; data: ArrayBuffer; weight: 400 | 700; style: "normal" };
let fontsPromise: Promise<Font[]> | null = null;

async function googleFont(family: string, weight: 400 | 700): Promise<Font | null> {
  try {
    const css = await fetch(`https://fonts.googleapis.com/css2?family=${encodeURIComponent(family)}:wght@${weight}`, {
      signal: AbortSignal.timeout(4000),
    }).then((r) => r.text());
    const url = css.match(/src: url\((.+?)\) format\('(?:truetype|opentype)'\)/)?.[1];
    if (!url) return null;
    const data = await fetch(url, { signal: AbortSignal.timeout(4000) }).then((r) => r.arrayBuffer());
    return { name: family, data, weight, style: "normal" };
  } catch {
    return null;
  }
}

/** Inter e Chakra Petch (identidade do site); sem rede, usa a fonte padrão. */
function loadFonts() {
  fontsPromise ??= Promise.all([
    googleFont("Inter", 400),
    googleFont("Inter", 700),
    googleFont("Chakra Petch", 700),
  ]).then((list) => {
    const ok = list.filter((f): f is Font => f != null);
    if (ok.length < list.length) fontsPromise = null; // tenta de novo na próxima
    return ok;
  });
  return fontsPromise;
}

/* --------------------------------- Imagens -------------------------------- */

async function toDataUri(url: string | null, timeout = 3500): Promise<string | null> {
  if (!url) return null;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(timeout) });
    if (!res.ok) return null;
    const type = res.headers.get("content-type") ?? "image/jpeg";
    if (!type.startsWith("image/")) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length > 600_000) return null;
    return `data:${type};base64,${buf.toString("base64")}`;
  } catch {
    return null;
  }
}

const initials = (name: string) =>
  name
    .replace(/[^\p{L}\p{N} ]/gu, " ")
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("") || "?";

function Avatar({ name, src, size }: { name: string; src: string | null; size: number }) {
  return src ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={src} width={size} height={size} style={{ borderRadius: size / 6, objectFit: "cover" }} alt="" />
  ) : (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: size / 6,
        background: C.surface2,
        border: `1px solid ${C.border}`,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        color: C.muted,
        fontSize: size * 0.38,
        fontWeight: 700,
      }}
    >
      {initials(name)}
    </div>
  );
}

/* --------------------------------- Layout -------------------------------- */

const fmt = (n: number | null, digits = 0) =>
  n == null ? "-" : n.toLocaleString("pt-BR", { minimumFractionDigits: digits, maximumFractionDigits: digits });
const signed = (n: number) => (n > 0 ? `+${n}` : String(n));
const tone = (n: number) => (n > 0 ? C.win : n < 0 ? C.loss : C.muted);

type Row = StatRow & { hs: number | null };
type Cell = { text: string; color?: string; bold?: boolean; box?: string };

/** Colunas da tabela (S e DROP ficam de fora: quase sempre vazias). HS% só com os dados da GC. */
const COLS: { label: string; width: number; gc?: boolean; cell: (r: Row) => Cell }[] = [
  { label: "K", width: 56, cell: (r) => ({ text: String(r.k), color: C.win, bold: true, box: C.win }) },
  { label: "A", width: 40, cell: (r) => ({ text: String(r.a), color: "#D4D4D8" }) },
  { label: "D", width: 56, cell: (r) => ({ text: String(r.d), color: C.loss, bold: true, box: C.loss }) },
  { label: "DIFF", width: 52, cell: (r) => ({ text: signed(diffOf(r)), color: tone(diffOf(r)) }) },
  { label: "ADR", width: 62, cell: (r) => ({ text: fmt(r.adr, 1) }) },
  { label: "KDR", width: 56, cell: (r) => ({ text: fmt(kdrOf(r), 2), bold: true }) },
  { label: "KAST", width: 58, cell: (r) => ({ text: r.kast == null ? "-" : `${fmt(r.kast)}%` }) },
  { label: "HS%", width: 54, gc: true, cell: (r) => ({ text: r.hs == null ? "-" : `${fmt(r.hs)}%` }) },
  { label: "FA", width: 36, cell: (r) => ({ text: String(r.fa) }) },
  { label: "MK", width: 40, cell: (r) => ({ text: String(r.mk) }) },
  { label: "FK", width: 38, cell: (r) => ({ text: String(r.fk) }) },
  { label: "RP", width: 52, cell: (r) => ({ text: signed(r.rp), color: tone(r.rp) }) },
];

const HL: Record<HighlightKey, { title: string; color: string; detail: (r: StatRow) => string }> = {
  mvp: { title: "MVP", color: "#A855F7", detail: (r) => `${r.k}K / ${r.a}A / ${r.d}D` },
  kills: { title: "Maior matador", color: "#EAB308", detail: (r) => `${r.k} kills` },
  adr: { title: "Maior ADR", color: "#F97316", detail: (r) => `${fmt(r.adr, 2)} ADR` },
  kdr: { title: "Maior KDR", color: "#10B981", detail: (r) => `${fmt(kdrOf(r), 2)} KDR` },
  fk: { title: "Mais first kills", color: "#06B6D4", detail: (r) => `${r.fk} first kills` },
  assists: { title: "Mais assistências", color: "#3B82F6", detail: (r) => `${r.a} assists` },
  deaths: { title: "Mais mortes", color: "#EF4444", detail: (r) => `${r.d} mortes` },
  worst: {
    title: "Pior performance",
    color: "#A1A1AA",
    // Duas linhas: numa só não cabe no card.
    detail: (r) => `${r.k}K / ${fmt(r.adr, 1)} ADR|${fmt(kdrOf(r), 2)} KDR`,
  },
};

/** Cores dos destaques que vêm da importação da GC. */
const GC_HL: Record<GcHighlightKey, string> = {
  entry: "#0EA5E9",
  trader: "#14B8A6",
  clutch: "#D946EF",
  flash: "#FCD34D",
  nade: "#84CC16",
  aim: "#6366F1",
};

/* --------------------------------- Peças --------------------------------- */

/** Título de seção: texto laranja e um traço até o fim. */
function Section({ title, display }: { title: string; display: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 12 }}>
      <span style={{ fontFamily: display, fontSize: 18, fontWeight: 700, letterSpacing: 2, color: C.brand }}>
        {title.toUpperCase()}
      </span>
      <div
        style={{ display: "flex", flex: 1, height: 1, backgroundImage: `linear-gradient(90deg, ${C.border}, ${C.bg})` }}
      />
    </div>
  );
}

/** Cartão com fundo escuro translúcido (por cima da arte do topo). */
const card = {
  display: "flex",
  borderRadius: 16,
  border: `1px solid ${C.border}`,
  background: "rgba(18,20,25,0.9)",
} as const;

export async function GET(request: Request, ctx: RouteContext<"/api/mixes/[id]/card">) {
  const { id } = await ctx.params;
  const ds = getDataSource();
  const [mix, report, gcMaps] = await Promise.all([ds.getMix(id), getMatchReport(id), getGcMaps(id)]);
  if (!mix || mix.status !== "finished" || !report?.rows.length) {
    return new Response("Resultado não encontrado.", { status: 404 });
  }

  // Dados da GC por jogador (HS%, clutches) quando o mix foi importado da GC.
  const gcLines = gcMaps.length ? aggregateGc(gcMaps) : [];
  const gcOf = (r: StatRow) => gcLines.find((l) => (r.userId ? l.userId === r.userId : l.nick === r.name));
  // Mesma ordem da tabela: MVP primeiro, lanterna por último, o resto pela pontuação do mix.
  const rows: Row[] = [...report.rows].sort(byMixScore).map((r) => ({ ...r, hs: gcOf(r)?.hsRate ?? null }));
  const cols = COLS.filter((c) => !c.gc || gcLines.length > 0);

  const stats = matchHighlights(rows);
  const mvp = stats.find((h) => h.key === "mvp")?.row ?? null;
  const worst = stats.find((h) => h.key === "worst")?.row ?? null;
  // Os outros destaques (sem MVP e lanterna, que têm o card próprio), na ordem da página.
  const gcList = gcLines.length ? gcHighlights(gcLines) : [];
  const highlights = orderHighlights(
    stats.filter((h) => h.key !== "mvp" && h.key !== "worst"),
    gcList,
  ).map(({ stat, gc }) => {
    if (stat) {
      const h = HL[stat.key];
      return {
        key: stat.key,
        title: h.title,
        color: h.color,
        row: stat.row as StatRow | null,
        name: stat.row.name,
        detail: h.detail(stat.row),
      };
    }
    const row = rows.find((r) => (gc.line.userId ? r.userId === gc.line.userId : r.name === gc.line.nick)) ?? null;
    const t = GC_HIGHLIGHT_TEXT[gc.key];
    return {
      key: `gc-${gc.key}`,
      title: t.title,
      color: GC_HL[gc.key],
      row,
      name: row?.name ?? gc.line.nick,
      detail: t.detail(gc.line),
    };
  });

  const winner = seriesWinner(mix);
  const score = seriesScore(mix) ?? [0, 0];
  const origin = new URL(request.url).origin;

  const [fonts, logo, hero, ...avatars] = await Promise.all([
    loadFonts(),
    toDataUri(`${origin}/brand/logo.png`),
    toDataUri(`${origin}/brand/share-hero.jpg`),
    ...rows.map((r) => toDataUri(r.avatarUrl)),
  ]);
  const avatarOf = new Map(rows.map((r, i) => [r.key, avatars[i] ?? null]));
  const avatar = (r: StatRow | null) => (r ? (avatarOf.get(r.key) ?? null) : null);
  const mapIcons = await Promise.all(
    mix.maps.map((mp) => {
      const icon = mapIcon(mp.mapId);
      return toDataUri(icon ? (icon.startsWith("/") ? `${origin}${icon}` : icon) : null);
    }),
  );

  const sideColor = (side: "A" | "B") => (!winner ? C.muted : winner === side ? C.win : C.loss);
  // Round: verde para o vencedor da série e vermelho para o outro (empate: as cores dos times).
  const roundColor = (side: "A" | "B") => (winner ? sideColor(side) : side === "A" ? "#5da3e8" : "#e3bd5a");
  const sideLabel = (side: "A" | "B") => (!winner ? "EMPATE" : winner === side ? "VENCEDOR" : "DERROTA");
  const teamName = (side: "A" | "B") => mix.teams.find((t) => t.side === side)?.name ?? `Time ${side}`;
  const when = new Date(mix.scheduledAt);
  const day = when.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", timeZone: "America/Sao_Paulo" });
  const date = when.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" });
  const hour = when.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" });
  const display = fonts.some((f) => f.name === "Chakra Petch") ? "Chakra Petch" : "Inter";

  // Resumo: rounds e kills sempre; com a GC, HS% e clutches (sem ela, assistências e first kills).
  const rounds = mix.maps.reduce((s, m) => s + (m.scoreA ?? 0) + (m.scoreB ?? 0), 0);
  const kills = rows.reduce((s, r) => s + r.k, 0);
  const gcKills = gcLines.reduce((s, l) => s + l.k, 0);
  const summary: { value: string; label: string }[] = [
    { value: String(rounds), label: "rounds jogados" },
    { value: String(kills), label: "kills na partida" },
    ...(gcLines.length
      ? [
          {
            value: `${fmt(gcKills ? (gcLines.reduce((s, l) => s + l.hs, 0) / gcKills) * 100 : 0)}%`,
            label: "headshots da partida",
          },
          { value: String(gcLines.reduce((s, l) => s + l.clutch.won, 0)), label: "clutches vencidos" },
        ]
      : [
          { value: String(rows.reduce((s, r) => s + r.a, 0)), label: "assistências" },
          { value: String(rows.reduce((s, r) => s + r.fk, 0)), label: "first kills" },
        ]),
  ];

  // Mais de 3 mapas, 10 jogadores ou 12 destaques: a imagem cresce para caber.
  const ROW_H = 44;
  const height =
    HEIGHT +
    Math.max(0, mix.maps.length - 3) * 44 +
    Math.max(0, rows.length - 10) * ROW_H +
    Math.max(0, Math.ceil(highlights.length / 3) - 4) * 82;
  const bgLeft =
    winner === "A" ? "rgba(34,197,94,0.24)" : winner === "B" ? "rgba(240,82,82,0.22)" : "rgba(161,161,170,0.12)";
  const bgRight =
    winner === "B" ? "rgba(34,197,94,0.24)" : winner === "A" ? "rgba(240,82,82,0.22)" : "rgba(161,161,170,0.12)";

  const teamBlock = (side: "A" | "B", right: boolean) => (
    <div
      style={{ display: "flex", flexDirection: "column", alignItems: right ? "flex-end" : "flex-start", width: 330 }}
    >
      <span style={{ fontSize: 15, fontWeight: 700, letterSpacing: 3, color: sideColor(side) }}>{sideLabel(side)}</span>
      <span
        style={{
          fontFamily: display,
          fontSize: 38,
          fontWeight: 700,
          textTransform: "uppercase",
          margin: "6px 0 12px",
          color: winner && winner !== side ? "#D4D4D8" : C.fg,
          whiteSpace: "nowrap",
        }}
      >
        {teamName(side).length > 16 ? `${teamName(side).slice(0, 15)}…` : teamName(side)}
      </span>
      <div style={{ display: "flex", gap: 6 }}>
        {rows
          .filter((r) => r.team === side)
          .map((r) => (
            <Avatar key={r.key} name={r.name} src={avatar(r)} size={36} />
          ))}
      </div>
    </div>
  );

  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        background: C.bg,
        color: C.fg,
        fontFamily: "Inter",
        position: "relative",
      }}
    >
      {/* Arte do site no topo, escurecida à esquerda e embaixo. */}
      {hero && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={hero} width={WIDTH} height={600} style={{ position: "absolute", top: 0, left: 0 }} alt="" />
      )}
      <div
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          width: WIDTH,
          height: 600,
          display: "flex",
          backgroundImage:
            "linear-gradient(90deg, #08090B 0%, rgba(8,9,11,0.92) 30%, rgba(8,9,11,0.35) 62%, rgba(8,9,11,0.12) 100%)",
        }}
      />
      <div
        style={{
          position: "absolute",
          top: 300,
          left: 0,
          width: WIDTH,
          height: 300,
          display: "flex",
          backgroundImage: "linear-gradient(180deg, rgba(8,9,11,0), #08090B)",
        }}
      />

      <div style={{ display: "flex", flexDirection: "column", padding: "0 40px", flex: 1 }}>
        {/* Cabeçalho */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", height: 120 }}>
          {logo ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={logo} height={56} width={228} alt="" />
          ) : (
            <div style={{ fontFamily: display, fontSize: 44, fontWeight: 700, color: C.brand }}>meumix</div>
          )}
          <div style={{ display: "flex", gap: 10 }}>
            <span
              style={{
                display: "flex",
                padding: "8px 14px",
                borderRadius: 8,
                border: "1px solid rgba(255,255,255,0.18)",
                background: "rgba(8,9,11,0.6)",
                fontSize: 19,
                fontWeight: 700,
              }}
            >
              {`${date} · ${hour}`}
            </span>
            <span
              style={{
                display: "flex",
                padding: "8px 14px",
                borderRadius: 8,
                border: `1px solid ${C.brand}`,
                color: C.brand,
                fontFamily: display,
                fontSize: 19,
                fontWeight: 700,
              }}
            >
              {`MD${mix.maps.length}`}
            </span>
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 6 }}>
          <div style={{ width: 22, height: 4, background: C.brand, display: "flex" }} />
          <span style={{ fontSize: 16, fontWeight: 700, letterSpacing: 4, color: C.brand }}>RESULTADO DO MIX</span>
        </div>
        <div
          style={{ display: "flex", fontFamily: display, fontSize: 68, fontWeight: 700, lineHeight: 1, marginTop: 16 }}
        >
          <span>MIX DE&nbsp;</span>
          <span style={{ color: C.brand }}>{day}</span>
        </div>
        <span style={{ fontSize: 20, color: C.muted, marginTop: 8 }}>
          {`${mix.maps.length} ${mix.maps.length > 1 ? "mapas" : "mapa"} · ${rounds} rounds · ${rows.length} jogadores`}
        </span>

        {/* Placar */}
        <div
          style={{
            ...card,
            marginTop: 30,
            alignItems: "center",
            justifyContent: "space-between",
            padding: "26px 34px",
            backgroundImage: `linear-gradient(90deg, ${bgLeft}, rgba(18,20,25,0.92) 42%, rgba(18,20,25,0.92) 58%, ${bgRight})`,
          }}
        >
          {teamBlock("A", false)}
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                fontFamily: display,
                fontSize: 128,
                fontWeight: 700,
                lineHeight: 1,
              }}
            >
              <span style={{ color: sideColor("A") }}>{score[0]}</span>
              <span style={{ color: "#52525B", fontSize: 84, margin: "0 18px" }}>:</span>
              <span style={{ color: sideColor("B") }}>{score[1]}</span>
            </div>
            <span style={{ fontSize: 14, letterSpacing: 4, color: C.muted, marginTop: 6 }}>
              {mix.maps.length > 1 ? `MELHOR DE ${mix.maps.length}` : "MAPA ÚNICO"}
            </span>
          </div>
          {teamBlock("B", true)}
        </div>

        {/* Mapas e resumo */}
        <div style={{ display: "flex", gap: 16, marginTop: 16 }}>
          <div style={{ ...card, flexDirection: "column", flex: 1, padding: "16px 18px" }}>
            <Section title="Mapas" display={display} />
            {mix.maps.map((mp, mi) => {
              const gm = gcMaps[mi];
              return (
                <div key={mp.order} style={{ display: "flex", alignItems: "center", gap: 12, height: 44 }}>
                  {mapIcons[mi] ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={mapIcons[mi]!} width={30} height={30} style={{ objectFit: "contain" }} alt="" />
                  ) : (
                    <div style={{ width: 30, display: "flex" }} />
                  )}
                  <span style={{ width: 104, fontSize: 19, fontWeight: 700, whiteSpace: "nowrap" }}>
                    {mapName(mp.mapId)}
                  </span>
                  <span style={{ display: "flex", width: 64, fontSize: 19, color: C.muted, whiteSpace: "nowrap" }}>
                    <span style={{ color: mp.winner === "A" ? C.fg : C.muted }}>{mp.scoreA ?? "-"}</span>
                    <span>–</span>
                    <span style={{ color: mp.winner === "B" ? C.fg : C.muted }}>{mp.scoreB ?? "-"}</span>
                  </span>
                  {gm && (
                    <div style={{ display: "flex", alignItems: "center", gap: 2 }}>
                      {gm.rounds.map((r, i) => (
                        <div
                          key={i}
                          style={{
                            display: "flex",
                            width: 10,
                            height: 10,
                            borderRadius: 2,
                            background: roundColor(r.w),
                            marginRight: roundBreakAfter(i + 1) && i + 1 < gm.rounds.length ? 6 : 0,
                          }}
                        />
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
            {gcMaps.length > 0 && winner && (
              <div style={{ display: "flex", gap: 16, marginTop: 8, fontSize: 13, color: C.muted }}>
                {(["A", "B"] as const).map((side) => (
                  <span key={side} style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <div
                      style={{ display: "flex", width: 10, height: 10, borderRadius: 2, background: roundColor(side) }}
                    />
                    {`round do ${teamName(side)}`}
                  </span>
                ))}
              </div>
            )}
          </div>
          <div style={{ ...card, flexDirection: "column", width: 316, padding: "16px 16px" }}>
            <Section title="Resumo" display={display} />
            <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
              {summary.map((s) => (
                <div
                  key={s.label}
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    width: 136,
                    padding: "12px 12px",
                    borderRadius: 12,
                    border: `1px solid ${C.border}`,
                    background: C.surface,
                  }}
                >
                  <span style={{ fontFamily: display, fontSize: 34, fontWeight: 700, lineHeight: 1 }}>{s.value}</span>
                  <span style={{ fontSize: 13, color: C.muted, marginTop: 6 }}>{s.label}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* MVP e lanterna + destaques */}
        <div style={{ display: "flex", gap: 16, marginTop: 16 }}>
          {mvp && (
            <div
              style={{
                ...card,
                flexDirection: "column",
                alignItems: "center",
                width: 300,
                padding: 20,
                border: "1px solid rgba(168,85,247,0.55)",
                backgroundImage: "linear-gradient(180deg, rgba(168,85,247,0.24), rgba(18,20,25,0.94) 62%)",
              }}
            >
              <span style={{ fontSize: 15, fontWeight: 700, letterSpacing: 3, color: "#C084FC" }}>MVP DA PARTIDA</span>
              <div style={{ display: "flex", marginTop: 14, borderRadius: 22, border: "3px solid #A855F7" }}>
                <Avatar name={mvp.name} src={avatar(mvp)} size={116} />
              </div>
              <span style={{ fontFamily: display, fontSize: 30, fontWeight: 700, marginTop: 12, whiteSpace: "nowrap" }}>
                {mvp.name.length > 15 ? `${mvp.name.slice(0, 14)}…` : mvp.name}
              </span>
              <span style={{ fontSize: 17, color: "#D4D4D8" }}>{`${mvp.k}K / ${mvp.a}A / ${mvp.d}D`}</span>
              <span
                style={{
                  display: "flex",
                  marginTop: 8,
                  padding: "4px 12px",
                  borderRadius: 999,
                  fontSize: 14,
                  fontWeight: 700,
                  color: "#C084FC",
                  background: "rgba(168,85,247,0.16)",
                }}
              >
                {`${signed(mvp.rp)} RP · ${fmt(kdrOf(mvp), 2)} KDR`}
              </span>
              {worst && (
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    width: "100%",
                    marginTop: "auto",
                    paddingTop: 14,
                    borderTop: `1px solid ${C.border}`,
                  }}
                >
                  <Avatar name={worst.name} src={avatar(worst)} size={44} />
                  <div style={{ display: "flex", flexDirection: "column" }}>
                    <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: 3, color: C.muted }}>LANTERNA</span>
                    <span style={{ fontSize: 18, fontWeight: 700 }}>
                      {worst.name.length > 16 ? `${worst.name.slice(0, 15)}…` : worst.name}
                    </span>
                    <span
                      style={{ fontSize: 13, color: C.muted }}
                    >{`${worst.k}K / ${worst.d}D · ${fmt(kdrOf(worst), 2)} KDR`}</span>
                  </div>
                </div>
              )}
            </div>
          )}
          <div style={{ display: "flex", flexDirection: "column", flex: 1 }}>
            <Section title="Destaques da partida" display={display} />
            <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
              {highlights.map(({ key, title, color, row, name, detail }) => (
                <div
                  key={key}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    width: 221,
                    height: 72,
                    padding: "0 12px",
                    borderRadius: 12,
                    border: `1px solid ${color}73`,
                    background: `${color}1F`,
                  }}
                >
                  <Avatar name={name} src={avatar(row)} size={40} />
                  <div style={{ display: "flex", flexDirection: "column" }}>
                    <span style={{ fontSize: 12.5, fontWeight: 700, color, whiteSpace: "nowrap" }}>{title}</span>
                    <span style={{ fontSize: 17, fontWeight: 700, whiteSpace: "nowrap" }}>
                      {name.length > 13 ? `${name.slice(0, 12)}…` : name}
                    </span>
                    <span style={{ fontSize: 12.5, color: C.muted, whiteSpace: "nowrap" }}>
                      {detail.length > 24 ? `${detail.slice(0, 23)}…` : detail}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Estatísticas dos jogadores */}
        <div style={{ ...card, flexDirection: "column", marginTop: 16, overflow: "hidden" }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              padding: "14px 22px",
              backgroundImage: "linear-gradient(90deg, rgba(255,106,0,0.25), rgba(255,106,0,0) 70%)",
              borderBottom: `1px solid ${C.border}`,
            }}
          >
            <span style={{ fontFamily: display, fontSize: 18, fontWeight: 700, letterSpacing: 2, color: C.brand }}>
              ESTATÍSTICAS DOS JOGADORES
            </span>
            <span
              style={{
                display: "flex",
                fontSize: 12,
                fontWeight: 700,
                color: C.muted,
                border: `1px solid ${C.border}`,
                borderRadius: 6,
                padding: "3px 8px",
              }}
            >
              {report.platform === "gc" ? "GC" : report.platform === "faceit" ? "FACEIT" : "MANUAL"}
            </span>
          </div>
          <div
            style={{
              display: "flex",
              padding: "10px 18px",
              fontSize: 12.5,
              fontWeight: 700,
              letterSpacing: 1,
              color: C.muted,
            }}
          >
            <span style={{ width: 30 }}>#</span>
            <span style={{ flex: 1 }}>JOGADOR</span>
            {cols.map((c) => (
              <span key={c.label} style={{ width: c.width, display: "flex", justifyContent: "center" }}>
                {c.label}
              </span>
            ))}
          </div>
          {rows.map((r, idx) => (
            <div
              key={r.key}
              style={{
                display: "flex",
                alignItems: "center",
                height: ROW_H,
                padding: "0 18px",
                fontSize: 18,
                borderTop: "1px solid rgba(42,45,52,0.7)",
                background: idx % 2 ? "rgba(255,255,255,0.015)" : "transparent",
              }}
            >
              <span style={{ width: 30, color: C.subtle }}>{idx + 1}</span>
              <div style={{ flex: 1, display: "flex", alignItems: "center", gap: 10, overflow: "hidden" }}>
                <div
                  style={{ display: "flex", width: 5, height: 26, borderRadius: 3, background: sideColor(r.team) }}
                />
                <Avatar name={r.name} src={avatar(r)} size={30} />
                <span style={{ fontWeight: 700, whiteSpace: "nowrap" }}>
                  {r.name.length > 18 ? `${r.name.slice(0, 17)}…` : r.name}
                </span>
                {(r === mvp || r === worst) && (
                  <span
                    style={{
                      display: "flex",
                      fontSize: 10.5,
                      fontWeight: 700,
                      letterSpacing: 1,
                      padding: "3px 6px",
                      borderRadius: 5,
                      color: r === mvp ? "#C084FC" : C.loss,
                      background: r === mvp ? "rgba(168,85,247,0.18)" : "rgba(240,82,82,0.14)",
                    }}
                  >
                    {r === mvp ? "MVP" : "LANTERNA"}
                  </span>
                )}
              </div>
              {cols.map((c) => {
                const v = c.cell(r);
                return (
                  <span key={c.label} style={{ width: c.width, display: "flex", justifyContent: "center" }}>
                    <span
                      style={{
                        display: "flex",
                        justifyContent: "center",
                        // Só K e D têm a caixinha (o gerador não aceita estilo vazio).
                        ...(v.box
                          ? {
                              minWidth: 44,
                              padding: "2px 0",
                              borderRadius: 7,
                              border: `1px solid ${v.box}59`,
                              background: `${v.box}1F`,
                            }
                          : {}),
                        color: v.color ?? C.fg,
                        fontWeight: v.bold ? 700 : 400,
                      }}
                    >
                      {v.text}
                    </span>
                  </span>
                );
              })}
            </div>
          ))}
        </div>
      </div>

      {/* Rodapé com as faixas laranja do site */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          height: 120,
          marginTop: 22,
          padding: "0 40px",
          borderTop: `3px solid ${C.brand}`,
          backgroundImage: "linear-gradient(90deg, #08090B 40%, rgba(255,106,0,0.18))",
          position: "relative",
          overflow: "hidden",
        }}
      >
        <div style={{ display: "flex", flexDirection: "column" }}>
          <span style={{ fontFamily: display, fontSize: 28, fontWeight: 700, color: C.brand }}>
            {new URL(request.url).host}
          </span>
          <span style={{ fontSize: 17, color: C.muted }}>Estatísticas, ranking e próximos mixes</span>
        </div>
        <div style={{ display: "flex", gap: 14, marginRight: -40 }}>
          {[0.9, 0.55, 0.25].map((o) => (
            <div
              key={o}
              style={{
                display: "flex",
                width: 46,
                height: 120,
                background: C.brand,
                opacity: o,
                transform: "skewX(-28deg)",
              }}
            />
          ))}
        </div>
      </div>
    </div>,
    {
      width: WIDTH,
      height,
      fonts: fonts.length ? fonts : undefined,
      headers: { "cache-control": "public, max-age=60" },
    },
  );
}
