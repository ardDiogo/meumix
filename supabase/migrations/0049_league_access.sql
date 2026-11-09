-- MeuMix — Ligas (Fase 4: membros, convite e admins por liga)
-- Executar depois de 0048. Pode ser executado mais de uma vez.
--
-- • Membro removido da liga fica com active = false (o histórico e o ELO continuam
--   guardados; o recálculo do ELO não o traz de volta). Entrar de novo reativa.
-- • Código de convite de cada liga: só o servidor lê (sem leitura pública).
-- • Admin da liga: league_members.role = 'admin' (a coluna já existia).

alter table public.league_members add column if not exists active boolean not null default true;
create index if not exists league_members_active_idx on public.league_members (user_id) where active;

create table if not exists public.league_codes (
  league_id uuid primary key references public.communities (id) on delete cascade,
  code text not null unique check (code ~ '^[A-HJ-NP-Z2-9]{6}$'),
  updated_at timestamptz not null default now()
);

alter table public.league_codes enable row level security;
revoke all on public.league_codes from anon, authenticated;

-- ---------------------------------------------------------------------------
-- Uma vez só (na primeira execução, quando o Jantinha ainda não tem código):
-- todo o histórico de hoje é do mix de terça, então todas as contas que já
-- existem entram no Mix do Jantinha (quem já jogou já era membro; quem só tem
-- conta passa a ser). O código de convite do Jantinha é criado aqui.
-- Se o Mix da Lanterna não tem nenhum mix, as insígnias automáticas e o progresso
-- que a 0047 deixou nele (calculados com os mixes de terça) passam para o Jantinha.
-- O Mix da Lanterna começa vazio: os membros entram pelo convite dele.
-- ---------------------------------------------------------------------------
do $$
declare
  v_terca uuid := (select id from public.communities where slug = 'terca');
  v_seg uuid := (select id from public.communities where slug = 'principal');
  v_alpha text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  v_code text;
begin
  if v_terca is null or exists (select 1 from public.league_codes where league_id = v_terca) then
    return;
  end if;

  insert into public.league_members (league_id, user_id)
  select v_terca, p.id from public.profiles p
  on conflict (league_id, user_id) do update set active = true;
  perform public.recompute_league_elo(v_terca);

  if v_seg is not null and not exists (select 1 from public.mix_matches where league_id = v_seg) then
    update public.player_badges set league_id = v_terca where league_id = v_seg;
    update public.badge_progress bp set league_id = v_terca
     where bp.league_id = v_seg
       and not exists (
         select 1 from public.badge_progress x
          where x.user_id = bp.user_id and x.badge_id = bp.badge_id and x.league_id = v_terca
       );
    delete from public.badge_progress where league_id = v_seg;
  end if;

  loop
    select string_agg(substr(v_alpha, 1 + floor(random() * length(v_alpha))::int, 1), '')
      into v_code from generate_series(1, 6);
    exit when not exists (select 1 from public.league_codes where code = v_code);
  end loop;
  insert into public.league_codes (league_id, code) values (v_terca, v_code);
end;
$$;
