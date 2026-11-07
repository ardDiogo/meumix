-- MeuMix — Campeonatos: times definidos por código (sem draft).
-- Executar depois de 0043. Pode ser executado mais de uma vez.
-- team_mode: 'draft' (capitães escolhem em potes) ou 'code' (cada time tem um código; quem entra pelo
-- código já está no time). Campeonatos existentes continuam em 'draft'.
-- Desfazer: drop index championship_teams_code; alter table championship_teams drop column join_code;
-- alter table championships drop column team_mode.

alter table public.championships
  add column if not exists team_mode text not null default 'draft' check (team_mode in ('draft', 'code'));

alter table public.championship_teams
  add column if not exists join_code text check (join_code is null or join_code ~ '^[A-Z0-9]{6}$');
create unique index if not exists championship_teams_code on public.championship_teams (join_code)
  where join_code is not null;

-- O código não tem leitura pública (quem tem o código entra no time): só o servidor lê.
revoke select on public.championship_teams from anon, authenticated;
grant select (id, championship_id, name, tag, color, logo, has_logo, captain_id, draft_order, created_at)
  on public.championship_teams to anon, authenticated;
