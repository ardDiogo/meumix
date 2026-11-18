-- MeuMix — Recalcula o MVP dos mixes já finalizados com a regra nova
-- Executar depois de 0054. Pode ser executado mais de uma vez (só muda o que estiver diferente).
--
-- MVP = maior (K × 3) + (A × 1,5) + (FK × 1,2) + (ADR × 0,2) − (D × 2).
-- Empate: mais kills, depois mais assistências. A lanterna não muda (a regra dela é a mesma).
-- Mix sem estatísticas (todos com 0 kills e 0 mortes) fica sem MVP, como na finalização.
-- Os totais de MVP de cada jogador se atualizam sozinhos (gatilho de player_match_records).
-- Depois, rode Admin → Insígnias → Recalcular para as insígnias de MVP.

with ranked as (
  select p.id, p.match_id,
    row_number() over (
      partition by p.match_id
      order by p.kills * 3 + p.assists * 1.5 + p.first_kills * 1.2 + coalesce(p.adr, 0) * 0.2 - p.deaths * 2 desc,
               p.kills desc, p.assists desc
    ) as pos,
    bool_or(p.kills > 0 or p.deaths > 0) over (partition by p.match_id) as has_stats
  from public.player_match_records p
),
target as (
  select id, (pos = 1 and has_stats) as mvp from ranked
)
update public.player_match_records p
set is_mvp = t.mvp
from target t
where t.id = p.id and p.is_mvp is distinct from t.mvp;
