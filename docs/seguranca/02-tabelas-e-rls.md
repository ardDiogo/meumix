# 2. Tabelas e políticas RLS

## 2.1 Regras gerais

1. **RLS ativo em toda tabela** do esquema `public`, sem exceção. Tabela nova sem
   `enable row level security` na mesma migração é bloqueada no review.
2. **Negação por padrão.** Sem política, nada passa. Só se cria a política necessária, por
   operação (`for select`, `for insert`, `for update`, `for delete`), nunca `for all using (true)`.
3. **Escrita pelo servidor.** `INSERT/UPDATE/DELETE` revogados de `anon` e `authenticated`; o servidor
   escreve com `service_role` depois de checar sessão e papel. Políticas de escrita para
   `authenticated` só quando o cliente realmente precisar escrever direto (hoje: nenhum caso).
4. **Leitura pública só do que é público por natureza** (placares, ranking, nick). Colunas com dado
   pessoal não público ficam fora do `grant select` de `anon/authenticated` (_grant_ por coluna).
5. **Funções `security definer`** com `set search_path = ''`, `revoke execute ... from public, anon,
authenticated` e `grant execute ... to service_role`.
6. Toda mudança de permissão é uma migração numerada e idempotente, com teste em
   [04-plano-de-testes.md](04-plano-de-testes.md).

## 2.2 Situação por tabela

Legenda — **Leitura**: quem lê pela API com a chave pública. **Escrita**: sempre o servidor
(`service_role`) depois de checar o papel indicado.

### Contas e perfis

| Tabela           | Leitura (API)                                   | Escrita (servidor)                    | Dados pessoais                                                      | Situação      |
| ---------------- | ----------------------------------------------- | ------------------------------------- | ------------------------------------------------------------------- | ------------- |
| `profiles`       | todos, **menos `full_name`** (grant por coluna) | servidor (jogador pelas ações; admin) | nick, nome completo (privado), Steam ID, avatar, Twitch, CSRep, ELO | ✅ P-01, P-13 |
| `confirm_links`  | ninguém                                         | servidor                              | token do link pessoal                                               | ✅            |
| `user_penalties` | ninguém                                         | admin                                 | penalidades                                                         | ✅            |
| `audit_log`      | ninguém                                         | servidor                              | ator, **IP, user agent** (em `detail`)                              | ⚠️ P-02       |

### Mixes, inscrições e votações

| Tabela                                              | Leitura | Escrita                            | Situação                             |
| --------------------------------------------------- | ------- | ---------------------------------- | ------------------------------------ |
| `mix_schedules`, `mix_cancellations`                | todos   | admin                              | ✅                                   |
| `mix_registrations`                                 | todos   | jogador (próprio, via ação), admin | ✅ (coluna `device` pública — baixa) |
| `map_votes`, `captain_votes`                        | todos   | jogador classificado (próprio)     | ✅                                   |
| `mix_draft_state`                                   | todos   | servidor (funções do draft)        | ✅                                   |
| `mix_draft_ppt_choices`                             | ninguém | servidor                           | ✅                                   |
| `map_tiebreaker_rounds`, `map_tiebreaker_votes`     | todos   | servidor                           | ✅                                   |
| `mix_team_suggestions`, `mix_team_suggestion_votes` | todos   | servidor                           | ✅                                   |

### Partidas, ELO e conteúdo

| Tabela                                      | Leitura | Escrita                                                              | Situação                                                             |
| ------------------------------------------- | ------- | -------------------------------------------------------------------- | -------------------------------------------------------------------- |
| `mix_matches`, `player_match_records`       | todos   | admin (`finalize_mix`)                                               | ⚠️ `player_name` fica após excluir conta (P-05)                      |
| `elo_change_logs`                           | todos   | servidor                                                             | ✅                                                                   |
| `clips`                                     | todos   | jogador (próprio), admin                                             | ✅                                                                   |
| `player_ai_analyses`                        | todos   | jogador (próprio), admin                                             | ✅ (análise é pública por escolha do jogador — informar na política) |
| `badges`, `player_badges`, `badge_progress` | todos   | admin (manuais); servidor via `sync_auto_badges` (automáticas, 0025) | ✅                                                                   |

### Configuração

| Tabela                                                      | Leitura | Escrita | Situação |
| ----------------------------------------------------------- | ------- | ------- | -------- |
| `maps`, `level_configs`, `feature_settings`, `app_settings` | todos   | admin   | ✅       |
| `communities`                                               | todos   | —       | ✅       |

### Esquema legado da `0001` (sem uso no código)

`players`, `community_members`, `mixes`, `mix_organizers`, `mix_teams`, `mix_team_players`,
`mix_maps`, `player_map_stats`, `elo_history`, `highlights`, `external_accounts`: RLS ativo, só
leitura, vazias. **Proposta (P-08):** remover numa migração, ou reaproveitar `community_members`
quando houver várias comunidades.

## 2.3 Políticas aplicadas na 0023 (P-01, P-13)

Ver `supabase/migrations/0023_profiles_privacy.sql`:

- **P-01:** `revoke select` da tabela inteira e `grant select (colunas)` para `anon` e
  `authenticated` com **todas as colunas menos `full_name`**. O nome completo só é lido pelo
  servidor (painel de admin).
- **P-13:** `revoke update` de `anon`/`authenticated` e remoção da política
  `"usuario edita o proprio perfil"`. O nick só muda pelas ações do servidor, que validam.

**Regra para colunas novas em `profiles`:** com o _grant_ por coluna, uma coluna nova **não** fica
legível pela API até a migração que a cria incluir
`grant select (coluna) on public.profiles to anon, authenticated` — o que é o comportamento
seguro (privado por padrão). Se a coluna for pública e lida pelo site, a migração precisa do _grant_.

## 2.4 Comunidades (isolamento)

Hoje existe **uma** comunidade (`principal`) e as tabelas não têm `community_id`. O isolamento
entre comunidades **não está implementado** porque não há segunda comunidade. Antes de abrir para
outras (P-07):

1. `community_id not null` em mixes, partidas, inscrições, clipes, penalidades, configurações.
2. `community_members (community_id, user_id, role)` com papéis `player | organizer | moderator | admin`.
3. Função `public.is_member(community uuid, roles text[])` (`security definer`, `stable`) usada nas
   políticas: leitura de dados restritos e escrita só para membros com o papel.
4. Testes negativos: membro da A tentando ler/escrever dados restritos da B (S-03).
