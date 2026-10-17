import { ImageResponse } from "next/og";
import { diffOf, kdrOf, matchHighlights, type HighlightKey, type StatRow } from "@/lib/match-highlights";
import { mapIcon, mapName } from "@/lib/maps";
import { seriesScore, seriesWinner } from "@/lib/stats";
import { getMatchReport } from "@/services/match-report";
import { getDataSource } from "@/services";

/**
 * Card único do resultado do mix (PNG) para compartilhar no WhatsApp:
 * placar com vencedor/perdedor, mapas, estatísticas e destaques.
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

const COLS: { label: string; width: number; cell: (r: StatRow) => { text: string; color?: string; bold?: boolean } }[] =
  [
    { label: "K", width: 50, cell: (r) => ({ text: String(r.k), color: C.win, bold: true }) },
    { label: "A", width: 44, cell: (r) => ({ text: String(r.a) }) },
    { label: "D", width: 44, cell: (r) => ({ text: String(r.d), color: C.loss, bold: true }) },
    { label: "DIFF", width: 54, cell: (r) => ({ text: signed(diffOf(r)), color: tone(diffOf(r)) }) },
    { label: "ADR", width: 70, cell: (r) => ({ text: fmt(r.adr, 1) }) },
    { label: "KDR", width: 54, cell: (r) => ({ text: fmt(kdrOf(r), 2), bold: true }) },
    { label: "KAST", width: 58, cell: (r) => ({ text: r.kast == null ? "-" : `${fmt(r.kast)}%` }) },
    { label: "S", width: 34, cell: (r) => ({ text: r.s ? String(r.s) : "-", color: C.subtle }) },
    { label: "FA", width: 38, cell: (r) => ({ text: String(r.fa) }) },
    { label: "MK", width: 40, cell: (r) => ({ text: String(r.mk) }) },
    { label: "FK", width: 40, cell: (r) => ({ text: String(r.fk) }) },
    { label: "RP", width: 50, cell: (r) => ({ text: signed(r.rp), color: tone(r.rp) }) },
    { label: "DROP", width: 50, cell: (r) => ({ text: String(r.drop) }) },
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

export async function GET(request: Request, ctx: RouteContext<"/api/mixes/[id]/card">) {
  const { id } = await ctx.params;
  const ds = getDataSource();
  const [mix, report] = await Promise.all([ds.getMix(id), getMatchReport(id)]);
  if (!mix || mix.status !== "finished" || !report?.rows.length) {
    return new Response("Resultado não encontrado.", { status: 404 });
  }

  const rows = [...report.rows].sort((a, b) => b.k - a.k || b.a - a.a);
  const highlights = matchHighlights(rows);
  const winner = seriesWinner(mix);
  const score = seriesScore(mix) ?? [0, 0];
  const origin = new URL(request.url).origin;

  const [fonts, logo, ...avatars] = await Promise.all([
    loadFonts(),
    toDataUri(`${origin}/brand/logo.png`),
    ...rows.map((r) => toDataUri(r.avatarUrl)),
  ]);
  const avatarOf = new Map(rows.map((r, i) => [r.key, avatars[i] ?? null]));
  const mapIcons = await Promise.all(
    mix.maps.map((mp) => {
      const icon = mapIcon(mp.mapId);
      return toDataUri(icon ? (icon.startsWith("/") ? `${origin}${icon}` : icon) : null);
    }),
  );

  const sideColor = (side: "A" | "B") => (!winner ? C.muted : winner === side ? C.win : C.loss);
  const sideLabel = (side: "A" | "B") => (!winner ? "EMPATE" : winner === side ? "VENCEDOR" : "DERROTA");
  const [d, m, y] = [mix.scheduledAt.slice(8, 10), mix.scheduledAt.slice(5, 7), mix.scheduledAt.slice(0, 4)];
  const display = fonts.some((f) => f.name === "Chakra Petch") ? "Chakra Petch" : "Inter";

  const ROW_H = 46;
  const height = 140 + 210 + 76 + 100 + rows.length * ROW_H + 90 + Math.ceil(highlights.length / 4) * 118 + 110;
  const bgLeft =
    winner === "A" ? "rgba(34,197,94,0.22)" : winner === "B" ? "rgba(240,82,82,0.22)" : "rgba(161,161,170,0.12)";
  const bgRight =
    winner === "B" ? "rgba(34,197,94,0.22)" : winner === "A" ? "rgba(240,82,82,0.22)" : "rgba(161,161,170,0.12)";

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
        padding: 40,
      }}
    >
      {/* Cabeçalho */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", height: 80 }}>
        {logo ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={logo} height={56} width={228} alt="" />
        ) : (
          <div style={{ fontFamily: display, fontSize: 44, fontWeight: 700, color: C.brand }}>meumix</div>
        )}
        <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end" }}>
          <div style={{ fontFamily: display, fontSize: 30, fontWeight: 700 }}>{`Mix de ${d}/${m}/${y}`}</div>
          <div style={{ fontSize: 18, color: C.muted }}>Resultado final</div>
        </div>
      </div>

      {/* Placar */}
      <div
        style={{
          display: "flex",
          marginTop: 20,
          height: 190,
          borderRadius: 18,
          border: `1px solid ${C.border}`,
          overflow: "hidden",
          backgroundImage: `linear-gradient(90deg, ${bgLeft}, ${C.surface} 45%, ${C.surface} 55%, ${bgRight})`,
        }}
      >
        {mix.teams.slice(0, 1).map((team, i) => (
          <div
            key={team.side}
            style={{
              display: "flex",
              flexDirection: "column",
              justifyContent: "center",
              alignItems: i === 0 ? "flex-start" : "flex-end",
              width: 380,
              padding: "0 32px",
            }}
          >
            <div style={{ fontSize: 18, fontWeight: 700, color: sideColor(team.side), letterSpacing: 2 }}>
              {sideLabel(team.side)}
            </div>
            <div style={{ fontFamily: display, fontSize: 34, fontWeight: 700, textTransform: "uppercase" }}>
              {team.name}
            </div>
            <div style={{ fontSize: 16, color: C.muted }}>{`${team.playerIds.length} jogadores`}</div>
          </div>
        ))}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            flex: 1,
          }}
        >
          <div style={{ display: "flex", fontFamily: display, fontSize: 96, fontWeight: 700, lineHeight: 1 }}>
            <span style={{ color: sideColor("A") }}>{score[0]}</span>
            <span style={{ color: C.subtle, margin: "0 18px" }}>:</span>
            <span style={{ color: sideColor("B") }}>{score[1]}</span>
          </div>
          <div style={{ fontSize: 15, color: C.subtle, letterSpacing: 2, marginTop: 8 }}>
            {mix.maps.length > 1 ? `MELHOR DE ${mix.maps.length}` : "MAPA ÚNICO"}
          </div>
        </div>
        {mix.teams.slice(1, 2).map((team, j) => {
          const i = j + 1;
          return (
            <div
              key={team.side}
              style={{
                display: "flex",
                flexDirection: "column",
                justifyContent: "center",
                alignItems: i === 0 ? "flex-start" : "flex-end",
                width: 380,
                padding: "0 32px",
              }}
            >
              <div style={{ fontSize: 18, fontWeight: 700, color: sideColor(team.side), letterSpacing: 2 }}>
                {sideLabel(team.side)}
              </div>
              <div style={{ fontFamily: display, fontSize: 34, fontWeight: 700, textTransform: "uppercase" }}>
                {team.name}
              </div>
              <div style={{ fontSize: 16, color: C.muted }}>{`${team.playerIds.length} jogadores`}</div>
            </div>
          );
        })}
      </div>

      {/* Mapas */}
      <div style={{ display: "flex", gap: 12, marginTop: 16, height: 54 }}>
        {mix.maps.map((mp, mi) => (
          <div
            key={mp.order}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              padding: "0 18px",
              borderRadius: 10,
              background: C.surface,
              border: `1px solid ${mp.winner ? sideColor(mp.winner) : C.border}`,
              fontSize: 20,
            }}
          >
            {mapIcons[mi] && (
              // eslint-disable-next-line @next/next/no-img-element, jsx-a11y/alt-text
              <img src={mapIcons[mi]!} width={34} height={34} style={{ objectFit: "contain" }} />
            )}
            <span style={{ fontWeight: 700 }}>{mapName(mp.mapId)}</span>
            <span style={{ color: mp.winner === "A" ? C.fg : C.muted }}>{mp.scoreA ?? "-"}</span>
            <span style={{ color: C.subtle }}>–</span>
            <span style={{ color: mp.winner === "B" ? C.fg : C.muted }}>{mp.scoreB ?? "-"}</span>
          </div>
        ))}
      </div>

      {/* Estatísticas */}
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          marginTop: 20,
          borderRadius: 18,
          border: `1px solid ${C.border}`,
          background: C.surface,
          overflow: "hidden",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 12,
            padding: "16px 24px",
            backgroundImage: `linear-gradient(90deg, rgba(255,106,0,0.14), ${C.surface})`,
            borderBottom: `1px solid ${C.border}`,
          }}
        >
          <span style={{ fontFamily: display, fontSize: 28, fontWeight: 700, color: C.brand }}>
            Estatísticas dos jogadores
          </span>
          <span
            style={{
              fontSize: 14,
              fontWeight: 700,
              color: C.muted,
              border: `1px solid ${C.border}`,
              borderRadius: 6,
              padding: "2px 8px",
            }}
          >
            {report.platform === "gc" ? "GC" : report.platform === "faceit" ? "FACEIT" : "MANUAL"}
          </span>
        </div>
        <div
          style={{
            display: "flex",
            padding: "10px 24px",
            fontSize: 14,
            fontWeight: 700,
            color: C.muted,
            borderBottom: `1px solid ${C.border}`,
          }}
        >
          <span style={{ flex: 1 }}>JOGADOR</span>
          {COLS.map((c) => (
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
              padding: "0 24px",
              fontSize: 18,
              background: idx % 2 ? C.surface : "rgba(255,255,255,0.02)",
            }}
          >
            <div style={{ flex: 1, display: "flex", alignItems: "center", gap: 10, overflow: "hidden" }}>
              <div style={{ width: 6, height: 26, borderRadius: 3, background: sideColor(r.team) }} />
              <Avatar name={r.name} src={avatarOf.get(r.key) ?? null} size={32} />
              <span style={{ fontWeight: 700, maxWidth: 230, overflow: "hidden", whiteSpace: "nowrap" }}>
                {r.name.length > 22 ? `${r.name.slice(0, 21)}…` : r.name}
              </span>
            </div>
            {COLS.map((c) => {
              const v = c.cell(r);
              return (
                <span
                  key={c.label}
                  style={{
                    width: c.width,
                    display: "flex",
                    justifyContent: "center",
                    color: v.color ?? C.fg,
                    fontWeight: v.bold ? 700 : 400,
                  }}
                >
                  {v.text}
                </span>
              );
            })}
          </div>
        ))}
      </div>

      {/* Destaques */}
      <div style={{ display: "flex", fontFamily: display, fontSize: 26, fontWeight: 700, marginTop: 28, height: 36 }}>
        Destaques da partida
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 12, marginTop: 12 }}>
        {highlights.map(({ key, row }) => {
          const h = HL[key];
          return (
            <div
              key={key}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 14,
                width: 241,
                height: 106,
                padding: "0 14px",
                borderRadius: 14,
                border: `1px solid ${h.color}66`,
                background: `${h.color}1A`,
              }}
            >
              <Avatar name={row.name} src={avatarOf.get(row.key) ?? null} size={60} />
              <div style={{ display: "flex", flexDirection: "column", overflow: "hidden" }}>
                <span style={{ fontSize: 14, color: h.color, fontWeight: 700 }}>{h.title}</span>
                <span style={{ fontSize: 19, fontWeight: 700, whiteSpace: "nowrap" }}>
                  {row.name.length > 13 ? `${row.name.slice(0, 12)}…` : row.name}
                </span>
                {h
                  .detail(row)
                  .split("|")
                  .map((line) => (
                    <span key={line} style={{ fontSize: 13, color: C.muted, whiteSpace: "nowrap" }}>
                      {line}
                    </span>
                  ))}
              </div>
            </div>
          );
        })}
      </div>

      {/* Rodapé */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginTop: "auto",
          paddingTop: 20,
          borderTop: `2px solid ${C.brand}`,
          fontSize: 18,
          color: C.muted,
        }}
      >
        <span>Estatísticas, ranking e próximos mixes</span>
        <span style={{ color: C.brand, fontWeight: 700 }}>{new URL(request.url).host}</span>
      </div>
    </div>,
    {
      width: WIDTH,
      height,
      fonts: fonts.length ? fonts : undefined,
      headers: { "cache-control": "public, max-age=300" },
    },
  );
}
