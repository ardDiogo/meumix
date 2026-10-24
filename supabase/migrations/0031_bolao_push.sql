-- MeuMix — bolão do mix e avisos no celular (push)
-- Executar depois de 0030. Pode ser executado mais de uma vez.
-- Só o servidor lê e escreve: os palpites ficam escondidos até o bolão fechar
-- e as inscrições de push guardam as chaves de cada aparelho.

-- Bolão: um palpite por usuário cadastrado por mix (jogando ou não).
create table if not exists public.mix_predictions (
  schedule_id uuid not null references public.mix_schedules (id) on delete cascade,
  event_date date not null,
  user_id uuid not null references public.profiles (id) on delete cascade,
  -- Capitão do time que vai vencer (os times são conhecidos pelo capitão).
  winner_captain uuid not null references public.profiles (id) on delete cascade,
  maps_won smallint not null check (maps_won between 1 and 5),
  maps_lost smallint not null check (maps_lost between 0 and 4 and maps_lost < maps_won),
  mvp_id uuid references public.profiles (id) on delete set null,
  lanterna_id uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (schedule_id, event_date, user_id),
  check (mvp_id is null or lanterna_id is null or mvp_id <> lanterna_id)
);
create index if not exists mix_predictions_user_idx on public.mix_predictions (user_id);

alter table public.mix_predictions enable row level security;
revoke all on public.mix_predictions from anon, authenticated;

-- Avisos no celular: uma linha por aparelho/navegador.
create table if not exists public.push_subscriptions (
  endpoint text primary key check (char_length(endpoint) between 10 and 1000),
  user_id uuid not null references public.profiles (id) on delete cascade,
  p256dh text not null check (char_length(p256dh) <= 200),
  auth text not null check (char_length(auth) <= 100),
  topics text[] not null default array['inscricoes', 'pick', 'bolao', 'resultado', 'live'],
  user_agent text,
  created_at timestamptz not null default now(),
  last_sent_at timestamptz
);
create index if not exists push_subscriptions_user_idx on public.push_subscriptions (user_id);

alter table public.push_subscriptions enable row level security;
revoke all on public.push_subscriptions from anon, authenticated;

-- Avisos já enviados (evita repetir o mesmo aviso; limpo pelo cron de retenção).
create table if not exists public.push_log (
  key text primary key check (char_length(key) <= 200),
  created_at timestamptz not null default now()
);

alter table public.push_log enable row level security;
revoke all on public.push_log from anon, authenticated;
