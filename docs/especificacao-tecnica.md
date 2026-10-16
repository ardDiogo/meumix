# Mix CS — Especificação Técnica para Replicação

Versão técnica do documento de regras ([`regras-do-mix.md`](./regras-do-mix.md)). Descreve a arquitetura, o modelo de dados, os triggers, os contratos das funções de servidor, os algoritmos (em pseudocódigo), o tempo real e os temporizadores.

> **Como o MeuMix mapeia esta especificação** está no fim do documento ([Adaptações no MeuMix](#adaptações-no-meumix)).

---

## 0. Arquitetura

```text
┌──────────────────────────┐        HTTPS (REST/RPC)        ┌───────────────────────────┐
│  SPA React + TypeScript  │ ─────────────────────────────▶ │ PostgreSQL (RLS + triggers)│
│  (Vite, Tailwind)        │ ◀──── WebSocket (Realtime) ─── │ Realtime: logical replic.  │
│                          │                                │ Auth: JWT                  │
│                          │ ── HTTPS ──▶ Edge Functions ──▶│ Storage (badges)           │
└──────────────────────────┘   (Deno, service_role)         └───────────────────────────┘
                                     │
                                     ├── Gemini API (OCR)  ─ fallback ─▶ AI Gateway
                                     └── Faceit Data API v4
```

Princípios usados (replicar em qualquer plataforma):

1. **Fonte da verdade no banco.** Regras críticas (classificação, limite de votos, bloqueio de voto tardio) são triggers no Postgres, não só no cliente.
2. **Relógio do servidor.** Nenhuma decisão de horário usa o relógio do cliente.
3. **Idempotência.** Inscrição, detecção/fechamento de desempate e votos são seguros a repetição (unique constraints + upsert).
4. **Leitura fresca antes de escrever** em operações por turno (draft).
5. **Tempo real por mudança de linha** (CDC) + polling de segurança.
6. **Autorização em camadas:** JWT → função `has_role` → RLS por tabela.

Equivalências sugeridas: Realtime → Socket.IO/Pusher/Firestore listeners/SignalR; Edge Functions → endpoints de API/Cloud Functions; RLS → middleware de autorização + checagem por linha.

---

## 1. Modelo de dados

Tipos: `uuid`, `text`, `int`, `numeric`, `bool`, `timestamptz`, `text[]`, `jsonb`. Toda tabela tem `id uuid pk default gen_random_uuid()` e `created_at timestamptz default now()`.

### 1.1 Identidade e permissões

| Tabela             | Colunas                                                                                                                                                                                                                                                                                         | Observações                                                                    |
| ------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| `profiles`         | user_id(uuid, fk auth.users), nick, nome, email, elo int=0, level int=1, faceit_player_id?, total_kills, total_deaths, total_first_kills, total_diff, total_wins, total_losses, mvp_count, lanterna_count, avg_adr numeric, avg_kast numeric, mixes_played, last_elo_change?, last_rank_change? | Totais são **derivados** (ver trigger 3.6)                                     |
| `user_roles`       | user_id, role enum `app_role('admin','user','master')`                                                                                                                                                                                                                                          | Unique(user_id, role). Nunca guardar papel em metadados editáveis pelo usuário |
| `role_change_logs` | target_user_id, target_user_nick, role, action_type, action_by, action_by_nick                                                                                                                                                                                                                  | Auditoria                                                                      |

Função `has_role(_user_id uuid, _role app_role) returns bool` — `SECURITY DEFINER`, `select exists(select 1 from user_roles where user_id=_user_id and role=_role)`. Evita recursão de RLS.
"É admin" no cliente = `has_role(admin) OR has_role(master)`.

Trigger `handle_new_user` (AFTER INSERT em auth.users): cria `profiles` e insere `user_roles(role='user')`. No cadastro, converte nível GC (0–20) em ELO inicial (ver 4.9).

### 1.2 Mix e inscrições

| Tabela                   | Colunas                                                                                                                                                      | Observações                                                |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------- |
| `mixes`                  | data_evento, hora_liberacao timestamptz, tipo_recorrencia ('weekly_monday'\|'custom'), status ('scheduled'\|'open'\|'closed'\|'finalized'), created_by       | Escrita só admin                                           |
| `mix_inscricoes`         | mix_id, user_id, status ('classificado'\|'reserva'), device_type                                                                                             | **Unique(mix_id, user_id)**                                |
| `mix_cancelamentos`      | mix_id, user_id, canceled_by, canceled_at                                                                                                                    | Log                                                        |
| `user_penalties`         | user_id, delay_seconds int, reason, expires_at, is_active, applied_by, applied_by_nick                                                                       | Escrita só master. Permanente = expires_at = now()+10 anos |
| `inscription_audit_logs` | user_id, user_nick, mix_id, event_type, client_timestamp, server_timestamp, time_diff_ms, device_type, user_agent, ip_address, error_message, metadata jsonb | Insert fire-and-forget                                     |

### 1.3 Votações e draft

| Tabela                      | Colunas                                                                                                                                                                                                                                                                                                                  | Observações                                                                  |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------- |
| `available_maps`            | name, abbreviation, display_order, is_active                                                                                                                                                                                                                                                                             | Lista configurável                                                           |
| `mix_map_votes`             | mix_id, user_id, maps text[] (len 4)                                                                                                                                                                                                                                                                                     | Unique(mix_id,user_id) → upsert                                              |
| `mix_map_tiebreaker_rounds` | mix_id, round_number (1\|2), status ('voting'\|'completed'\|'resolved_random'), candidate_maps[], slots_available, winning_maps[], random_decided_maps[], started_at, closed_at                                                                                                                                          | Unique(mix_id, round_number). Escrita só via função de servidor              |
| `mix_map_tiebreaker_votes`  | round_id, user_id, maps[]                                                                                                                                                                                                                                                                                                | Unique(round_id,user_id); só o próprio usuário classificado                  |
| `mix_captain_votes`         | mix_id, voter_id, voted_for_id                                                                                                                                                                                                                                                                                           | Unique(mix_id,voter_id,voted_for_id) + triggers 3.3/3.4                      |
| `mix_draft_state`           | mix_id (unique), status ('ppt'\|'draft'\|'completed'), captain_a_id, captain_b_id, captain_a_choice, captain_b_choice ('rock'\|'paper'\|'scissors'), captain_a_ready, captain_b_ready, last_tie_choice, tie_history jsonb, winner_id, current_turn ('captain_a'\|'captain_b'), turn_number, team_a uuid[], team_b uuid[] | Máquina de estados do PPT + draft. **A ordem dos arrays = ordem de escolha** |
| `mix_team_suggestions`      | mix_id, team_a[], team_b[], status ('pending'\|'accepted'\|'rejected')                                                                                                                                                                                                                                                   |                                                                              |
| `mix_team_suggestion_votes` | mix_id, user_id, vote bool                                                                                                                                                                                                                                                                                               | Unique(mix_id,user_id)                                                       |

### 1.4 Resultados e ELO

| Tabela                 | Colunas                                                                                                                                                                           | Observações                            |
| ---------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------- |
| `mix_historico`        | mix_id, platform ('gc'\|'faceit'), stats_json jsonb, stats_calculated bool, finalized_by, data_finalizacao                                                                        | Resultado bruto                        |
| `player_match_records` | historico_id, user_id, player_name, kills, deaths, assists, first_kills, diff, adr, kast, rp, wins, losses, is_mvp, is_lanterna, elo_before, elo_after, level_before, level_after | Fato normalizado → alimenta `profiles` |
| `level_configs`        | level 1–10, elo_min, elo_max?, gap?, color                                                                                                                                        |                                        |
| `elo_change_logs`      | user_id, user_nick, old_elo, new_elo, old_level, new_level, reason, changed_by, changed_by_nick                                                                                   | Auditoria                              |

### 1.5 Configurações e extras

| Tabela                     | Colunas                                                                                                     |
| -------------------------- | ----------------------------------------------------------------------------------------------------------- |
| `mix_feature_settings`     | feature_key unique ('team_suggestion','background_music','map_tiebreaker'), enabled, updated_by             |
| `badges` / `player_badges` | name, description, image_url / user_id, badge_id, assigned_by                                               |
| `mix_admin_action_logs`    | mix_id, action_type ('force_start_draft','reset_draft','reset_all'...), action_by, action_by_nick, metadata |
| `badge_action_logs`        | auditoria de insígnias                                                                                      |

---

## 2. Autorização (RLS)

| Recurso                                                | SELECT       | INSERT/UPDATE/DELETE                                     |
| ------------------------------------------------------ | ------------ | -------------------------------------------------------- |
| mixes, available_maps, level_configs, feature_settings | autenticado  | admin/master                                             |
| mix_inscricoes                                         | autenticado  | insert via função de servidor; delete o próprio ou admin |
| votos (mapas, capitães, sugestão, desempate)           | autenticado  | apenas `user_id = auth.uid()` (e classificado)           |
| mix_draft_state                                        | autenticado  | capitães do mix e admin                                  |
| tiebreaker_rounds                                      | autenticado  | somente service_role                                     |
| user_penalties                                         | admin/master | master                                                   |
| badges                                                 | público      | admin/master                                             |
| logs                                                   | admin/master | insert por admin/master ou servidor                      |

Exceções aprovadas: emails em perfis e `elo_change_logs` são de leitura pública por decisão do projeto.

---

## 3. Triggers e funções de banco

### 3.1 `get_server_time()` → `now()`

RPC simples usada para sincronizar relógio.

### 3.2 Classificação automática (BEFORE INSERT em mix_inscricoes)

```sql
pos := (select count(*) from mix_inscricoes
        where mix_id = NEW.mix_id and created_at < NEW.created_at) + 1;
NEW.status := case when pos <= 10 then 'classificado' else 'reserva' end;
```

AFTER DELETE → `reorder_inscricoes_after_delete()`:

```sql
update mix_inscricoes i set status = case when r.rn <= 10 then 'classificado' else 'reserva' end
from (select id, row_number() over (order by created_at) rn
      from mix_inscricoes where mix_id = OLD.mix_id) r
where i.id = r.id;
```

`created_at` é atribuído pelo servidor → ordem de chegada justa.

### 3.3 `validate_captain_vote()` (BEFORE INSERT em mix_captain_votes)

- `voter_id <> voted_for_id`
- `count(*) where mix_id, voter_id < 2`
- votado precisa ter `status='classificado'` no mix
- senão `RAISE EXCEPTION`.

### 3.4 Bloqueio de voto tardio (BEFORE INSERT em mix_captain_votes)

`if exists(select 1 from mix_draft_state where mix_id = NEW.mix_id) then raise exception 'seleção de equipes em andamento'`.
Cliente faz a mesma checagem antes (JIT) e pula para mapas.

### 3.5 Rankings

- `get_player_rankings()` → lê totais de `profiles` agrupando por `user_id` (troca de nick não duplica).
- `get_player_rankings_by_period(start, end)` → agrega `player_match_records join mix_historico` filtrando `data_finalizacao`.
- `get_player_levels`, `get_public_profiles`, `get_all_public_profiles` → leituras públicas resumidas.

### 3.6 `sync_profile_stats_from_match_record()` (AFTER INSERT/UPDATE/DELETE em player_match_records)

Para o `user_id` afetado (NEW e/ou OLD), recalcula do zero:

```sql
update profiles set
  total_kills = sum(kills), total_deaths = sum(deaths), total_first_kills = sum(first_kills),
  total_diff = sum(diff), total_wins = sum(wins), total_losses = sum(losses),
  mvp_count = count(*) filter (where is_mvp), lanterna_count = count(*) filter (where is_lanterna),
  avg_adr = avg(adr), avg_kast = avg(kast), mixes_played = count(distinct historico_id)
where user_id = X;
```

Recalcular (em vez de incrementar) garante consistência ao editar/apagar partidas.

---

## 4. Algoritmos

### 4.1 Sincronização de relógio

```ts
t0 = Date.now();
server = await rpc("get_server_time");
t1 = Date.now();
rtt = t1 - t0;
offset = Date.parse(server) - (t0 + rtt / 2);
syncedNow = () => Date.now() + offset;
// re-sync: a cada 5 min e no evento visibilitychange/focus
// enquanto !isSynced: botão de inscrição desabilitado
isOpen = syncedNow() >= hora_liberacao;
```

### 4.2 Inscrição — `POST /process-inscription`

Request: `{ mix_id, device_type, client_timestamp }` ou `{ ping: true }`. Auth: JWT obrigatório.

```text
if ping → 200 {pong}
paralelo: mix, profile, inscrição existente, penalidade ativa
if existente → 200 {success, already_inscribed}
if penalidade.is_active:
   if expires_at < now → desativar (async) e seguir
   else fim = hora_liberacao + delay_seconds
        if now < fim → 403 {code:'PENALTY_ACTIVE', seconds_remaining}
   (erro ao ler penalidade → seguir: fail-open)
if hora_liberacao - now > 1000ms → 425 {code:'TOO_EARLY', seconds_remaining}
insert mix_inscricoes
   on unique_violation (23505) → 200 {already_inscribed}
erro inesperado → 500 {retriable:true}
sempre: log em inscription_audit_logs (async)
```

### 4.3 Fila de nova tentativa (cliente)

```text
storage: localStorage['inscription_retry_queue'] = [{mix_id, attempts, nextAt}]
backoff = [1,1,2,2,3,3,5,5,10,10] s ; MAX = 10
gatilhos: online, focus, visibilitychange, setInterval 5s
resultado: sucesso → remove | TOO_EARLY → reagenda | fatal/PENALTY → remove | rede/retriable → reagenda
UI otimista: "Processando..."
```

### 4.4 Aquecimento e sessão (cliente)

```text
loop 5s:
  if t_restante <= 120s → refresh do token
  if t_restante <= 10s e ainda não fez → refresh final
  if 0 < t_restante <= 30s e passou 10s do último ping → ping função
  if mix aberto e passou 45s → ping função
setInterval 5 min → refresh do token
```

Sem nenhum indicador visual (proteção invisível).

### 4.5 Votação e desempate de mapas — `POST /map-tiebreaker`

```text
contagem = votos de mix_map_votes apenas de classificados; ordenar desc
computeTie(contagem, N):
   V = contagem[N-1].votos
   garantidos = mapas com votos > V
   zona = mapas com votos == V
   vagas = N - |garantidos|
   empate = |zona| > vagas

action 'detect' {mix_id}:   (idempotente)
   exige feature map_tiebreaker ligada e draft.status='completed'
   se já existe round → retorna
   t = computeTie(contagem, 4); se empate → insert round 1 (candidate_maps=zona, slots=vagas)

action 'close' {round_id, force?}:   (idempotente)
   se status≠'voting' → retorna estado
   exige 10 votos de classificados, ou force por admin/master
   recontar votos do round entre candidate_maps; t = computeTie(contagem, slots)
   sem empate → winning_maps = top slots; status='completed'
   empate e round 1 → winning parcial = garantidos; insert round 2 (zona, vagas)
   empate e round 2 → sorteio: escolher 'vagas' de 'zona' com crypto.getRandomValues
                       (Fisher-Yates); random_decided_maps; status='resolved_random'
```

Cliente: ao receber realtime de voto, se confirmados == 10 → chama `close` (servidor revalida).

### 4.6 Capitães

```text
ao entrar na fase sem mix_draft_state:
   soma votos por voted_for_id; top 2 → captain_a, captain_b
   insert mix_draft_state {status:'ppt'}
short-circuit: se 2º colocado > 3º + votos restantes possíveis → pode iniciar antes
```

### 4.7 Pedra-Papel-Tesoura

```text
capitão: update {captain_x_choice, captain_x_ready:true}
qualquer cliente, ao ver a_ready && b_ready && status='ppt' && !processing:
   if a == b:
       update last_tie_choice = a
       após 3s: update choices=null, ready=false
   else:
       beats = {rock:'scissors', scissors:'paper', paper:'rock'}
       winner = beats[a]==b ? A : B
       update {winner_id, status:'draft', current_turn: winner,
               team_a:[A], team_b:[B], last_tie_choice:null}
trava: processingRef + flag isResetting (evita dupla execução)
```

Recomendação ao replicar: decidir o vencedor no servidor (função ou trigger) para não depender do cliente.

### 4.8 Draft 1-2-2-2-1

```text
turnPattern = [1,2,2,2,1]   // picks por turno; vencedor do PPT começa
confirmPick(player):
   s = SELECT fresco de mix_draft_state
   valida: s.current_turn == meu lado; player ∉ team_a ∪ team_b
   append player ao meu time; picksNoTurno++
   if picksNoTurno == turnPattern[s.turn_number]: turn_number++, trocar current_turn
   if turn_number == 5 (10 jogadores): status='completed' → dispara tiebreaker 'detect'
admin: reset_draft (zera times/turnos, mantém votos de capitão)
       reset_all (apaga draft_state, votos de capitão e rounds/votos de desempate)
remoção de jogador → reset_draft
```

### 4.9 ELO inicial a partir do nível GC

```text
L2 = 100, L9 = 1210, L10min = 1460
gc 0–7 :  elo = round(gc/7 * L2)
gc 8–20:  elo = round(L2 + (gc-8)/12 * (L9 - L2))
elo = min(elo, floor(L10min * 1.1))   // ≈1600
nível = maior level com elo_min <= elo (tabela level_configs)
```

| Nível   | 1   | 2   | 3   | 4   | 5   | 6   | 7    | 8    | 9    | 10          |
| ------- | --- | --- | --- | --- | --- | --- | ---- | ---- | ---- | ----------- |
| elo_min | 0   | 100 | 220 | 350 | 500 | 660 | 830  | 1010 | 1210 | 1460        |
| elo_max | 99  | 219 | 349 | 499 | 659 | 829 | 1009 | 1209 | 1459 | 1600 (teto) |

### 4.10 Times balanceados

```text
score(p) = nivel*10*mult(nivel) + winrate*80 - max(0, lanternas-1)*15
mult: 8→1.5, 9→2, 10→2.5, demais 1
para cada combinação C(10,5)=252 (fixar 1 jogador para evitar espelho = 126):
   diff = |Σscore(A) - Σscore(B)|
   matchup = Σ |A_ordenado[i] - B_ordenado[i]|
escolher menor diff; se diff dentro de DIFF_TOLERANCE=5 do melhor, desempatar por menor matchup
votação: 10 votos; aceita se concordo/10 >= 0.8
```

### 4.11 Probabilidade de vitória

```text
força(time) = Σ jogador( elo/15
                + winrate_ajustado*w1      // winrate_aj = (wr*jogos + 0.5*30)/(jogos+30) se jogos<30
                + taxa_mvp*w2 - taxa_lanterna*w3
                + bonus_experiencia(jogos) + adr*w4 + kast*w5 )
P(A) = força(A) / (força(A)+força(B))   → exibido em %
```

(Pesos w1..w5 estão em `TeamDraft.tsx/calculateTeamStrength`; copiar os valores ao portar.)

### 4.12 Finalização — OCR GC (`POST /analyze-game-stats`)

```text
entrada: imagens (base64) dos placares, um por mapa
para cada imagem:
   chamar Gemini 2.5 Flash com prompt de leitura por cabeçalho:
     colunas K|A|D|DIFF|ADR|KDR|KAST|S|FA|MK|FK|RP|DROP
     ignorar avatar/bandeira/check/nota/badge de nível; DROP vazio = 0
   em 429/503/cota → trocar imediatamente para o gateway alternativo (sem espera)
   JSON inválido → reparar/retentar
validação: zerar negativos em FA/MK/FK/DROP; DIFF = K-D; KDR = K/max(D,1)
unificação de nomes: normalizar (minúsculas, trocar 0→o,1→l...), Levenshtein/semelhança;
   nunca unir dois nomes presentes no mesmo print
times: mesmo time entre mapas se ≥3 jogadores em comum
saída: jogadores agregados + resultados por mapa
```

Faceit (`POST /fetch-faceit-stats`): extrair `match_id` do link → `GET /data/v4/matches/{id}` e `/stats` (Bearer FACEIT_API_KEY) → agregar por `player_id`. Colunas exclusivas GC ficam `null`.

### 4.13 Cálculo de ELO pós-partida

```text
vínculo jogador↔perfil: faceit_player_id; senão semelhança de nick >= 0.70; admin pode 'Não calcular'
mvp      = argmax (K*3 + A*1.5 + ADR*0.2 - D*2)
lanterna = argmin (K + ADR/100 + KDR*10)
novo_elo = clamp(elo + RP, 0, 1600); novo_nivel = level(novo_elo)
insert player_match_records (elo_before/after, level_before/after, wins/losses por mapResults)
   → trigger 3.6 recalcula profiles
insert elo_change_logs; mix_historico.stats_calculated = true; mixes.status='finalized'
```

---

## 5. Funções de servidor (contratos)

| Endpoint             | Auth               | Entrada                                                             | Saída/erros                                                              |
| -------------------- | ------------------ | ------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| process-inscription  | usuário            | `{mix_id, device_type, client_timestamp}` \| `{ping}`               | 200 success/already · 403 PENALTY_ACTIVE · 425 TOO_EARLY · 500 retriable |
| map-tiebreaker       | classificado/admin | `{action:'detect', mix_id}` \| `{action:'close', round_id, force?}` | estado do round                                                          |
| analyze-game-stats   | admin              | imagens + plataforma                                                | jogadores, mapas                                                         |
| fetch-faceit-stats   | admin              | links/IDs de partida                                                | jogadores, mapas                                                         |
| admin-reset-password | admin/master       | `{user_id}`                                                         | define senha padrão; master protegido                                    |
| delete-user          | master             | `{user_id}`                                                         | remove conta                                                             |
| get-historico-api    | público/leitura    | filtros                                                             | histórico                                                                |

Todas usam credencial de serviço internamente e **validam o papel do chamador pelo JWT** antes de agir.

---

## 6. Tempo real

Inscrição por mudança de linha (INSERT/UPDATE/DELETE) com filtro `mix_id=eq.{id}`:

| Canal                  | Tabelas                                                             | Reação no cliente                       |
| ---------------------- | ------------------------------------------------------------------- | --------------------------------------- |
| dashboard              | mixes                                                               | refetch do mix atual                    |
| `mix-realtime-{mixId}` | mix_inscricoes, mix_cancelamentos, mix_map_votes, mix_captain_votes | refetch com debounce 1s                 |
| `draft-{mixId}`        | mix_draft_state                                                     | atualizar PPT/draft; avaliar vencedor   |
| sugestão               | mix_team_suggestions, _votes                                        | contar votos, decidir 80%               |
| desempate              | tiebreaker_rounds, _votes                                           | contar confirmações; chamar close em 10 |
| config                 | mix_feature_settings                                                | ligar/desligar recursos (música etc.)   |

Regras de implementação:

- Listeners leem estado via `useRef` (evitar closures obsoletas).
- Sem refetch automático ao focar a aba (`refetchOnWindowFocus:false`).
- Polling de segurança de 10s para feature flags.
- Ao replicar: qualquer pub/sub com payload por linha + reconexão automática serve.

## 7. Temporizadores

| Item                                                    | Intervalo                                    |
| ------------------------------------------------------- | -------------------------------------------- |
| Countdown / checagem de abertura / countdown de punição | 1 s                                          |
| Sync de relógio                                         | 5 min + foco                                 |
| Refresh de token                                        | 5 min; 5 s nos últimos 120 s; final ≤10 s    |
| Ping de aquecimento                                     | ~10 s nos últimos 30 s; 45 s com mix aberto  |
| Fila de retry                                           | backoff 1–10 s, 10 tentativas; varredura 5 s |
| Reset de empate PPT                                     | 3 s                                          |
| Polling de flags                                        | 10 s                                         |

Tipagem de timers em TS: `ReturnType<typeof setTimeout>`.

---

## 8. Restrições de produto a manter

- Máx. 10 classificados; demais reserva.
- Proteção de sessão 100% invisível (sem avisos).
- Compartilhamento no WhatsApp apenas texto.
- Teto de ELO 1600 no nível 10.
- Hierarquia Master > Admin > Usuário.
- Votação principal de mapas nunca é reaberta pelo desempate.

## 9. Roteiro de replicação

1. Criar schema (seção 1), constraints únicas e enum de papéis.
2. Implementar `has_role` e autorização (seção 2).
3. Triggers 3.2, 3.3, 3.4, 3.6 e RPC de horário.
4. Endpoint de inscrição (4.2) + fila no cliente (4.3) + aquecimento (4.4).
5. Pub/sub por linha (seção 6).
6. Votações, PPT, draft e desempate (4.5–4.8), idealmente com decisões no servidor.
7. Balanceamento e probabilidade (4.10–4.11).
8. Finalização: OCR com fallback e Faceit (4.12), ELO (4.13), rankings (3.5).
9. Painel admin: punições, reset de senha, insígnias, flags, logs.

---

## Adaptações no MeuMix

O MeuMix (Next.js + Supabase) segue os mesmos princípios, com estas diferenças deliberadas:

| Especificação                                   | MeuMix                                                                                                                   | Motivo                                                                         |
| ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------ |
| `mixes` (uma linha por evento)                  | `mix_schedules` (agenda) + ocorrência `(schedule_id, event_date)`                                                        | Recorrência semanal sem gerar linhas; cada ocorrência é identificada pela data |
| `mix_inscricoes.status` gravado por trigger     | Status **calculado na leitura** pela ordem de `created_at`                                                               | Mesma regra (10 primeiros), sem risco de status desatualizado                  |
| Edge Functions (Deno)                           | Server Actions do Next.js com a chave secreta, após checar sessão e papel                                                | Mesmo contrato; roda na Vercel                                                 |
| `get_server_time()` RPC                         | `GET /api/time`                                                                                                          | Mesmo algoritmo de sincronização (4.1)                                         |
| `user_roles` (master/admin/user)                | `profiles.role` (admin/user) + super admin por `SUPER_ADMIN_EMAILS`                                                      | Master = super admin                                                           |
| `mix_map_votes.maps text[]`                     | Uma linha por mapa votado em `map_votes`                                                                                 | Contagem e integridade referencial com `maps`                                  |
| Escolhas do PPT em `mix_draft_state` (legíveis) | Escolhas em `mix_draft_ppt_choices`, **sem leitura pública**; o estado só mostra quem está pronto e o resultado revelado | Ninguém consegue espiar a jogada do outro pela API                             |
| Decisão do PPT pelo cliente                     | Função `draft_ppt_submit` no banco, com `SELECT … FOR UPDATE`                                                            | Recomendação da própria especificação                                          |
| Empate do PPT: zera após 3s                     | Banco zera na hora e grava `last_tie_choice`; a tela mostra o aviso                                                      | Sem depender de um cliente para o reset                                        |
