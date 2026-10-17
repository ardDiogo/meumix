# 4. Plano de testes de segurança

Os testes rodam **antes de cada publicação** que mexa em permissões, migrações ou dados pessoais.
Passar em todos é condição necessária, não suficiente: riscos sem teste ficam em
[Pendências](05-pendencias.md).

## 4.1 Como testar

**Camada 1 — banco (RLS e grants).** Postgres local descartável com todas as migrações aplicadas
(mesmo procedimento do `pgtest.sh` usado hoje manualmente), simulando os papéis do Supabase:

```sql
set role anon;                                        -- visitante
set role authenticated;                               -- jogador
select set_config('request.jwt.claims', '{"sub":"<uuid>","role":"authenticated"}', true);
```

Cada caso é um `do $$ ... $$` que **espera erro** (`insufficient_privilege` / 0 linhas afetadas) ou
espera sucesso. Alvo: script `supabase/tests/rls.sql` + `npm run test:rls`, rodando no GitHub
Actions com um serviço `postgres` (sem nenhum segredo: só o esquema).

**Camada 2 — servidor (server actions e rotas).** Testes chamando as ações com sessões falsas
(visitante, jogador, admin, super) contra um Supabase simulado, conferindo que a ação é recusada
**antes** de qualquer escrita (o simulado registra toda escrita recebida).

**Camada 3 — ponta a ponta.** Playwright contra o build de produção local: rotas de admin,
fluxo de exclusão de conta, download dos dados.

## 4.2 Casos obrigatórios

| ID    | Cenário                                                                                                                          | Camada         | Resultado esperado                                              |
| ----- | -------------------------------------------------------------------------------------------------------------------------------- | -------------- | --------------------------------------------------------------- |
| S-01  | Visitante lê `audit_log`, `confirm_links`, `user_penalties`, `mix_draft_ppt_choices`                                             | 1              | 0 linhas / permissão negada                                     |
| S-01b | Visitante lê `profiles.full_name`                                                                                                | 1              | Permissão negada (após P-01)                                    |
| S-01c | Visitante chama a página de admin, `/configuracoes`, ação de baixar dados                                                        | 2/3            | Redireciona para login / recusado                               |
| S-02  | Jogador chama `updateUserElo(outroId, 5000)`                                                                                     | 2              | Recusado, nenhuma escrita                                       |
| S-02b | Jogador faz `PATCH /rest/v1/profiles?id=eq.<outro>` `{"elo":5000}`                                                               | 1              | Permissão negada                                                |
| S-02c | Jogador faz `PATCH` no **próprio** perfil `{"elo":5000}` / `{"role":"admin"}`                                                    | 1              | Permissão negada                                                |
| S-03  | Membro da comunidade A lê/escreve dados restritos da B                                                                           | 1/2            | Negado (quando houver várias comunidades — P-07)                |
| S-04  | Admin chama `setUserRole(si, 'admin')` para virar super / rebaixar o super                                                       | 2              | Recusado                                                        |
| S-04b | Jogador chama `setUserRole(si, 'admin')`                                                                                         | 2              | Recusado                                                        |
| S-05  | `INSERT` direto em `player_match_records`, `elo_change_logs`, `clips`, `mix_registrations` como `authenticated`                  | 1              | Permissão negada                                                |
| S-05b | `select public.finalize_mix(...)`, `delete_match`, `draft_pick` como `authenticated`                                             | 1              | Permissão negada                                                |
| S-05c | `PATCH` no próprio `display_name` com 500 caracteres ou o nick de outro                                                          | 1              | Negado (após P-13)                                              |
| S-06  | Excluir a própria conta: perfil some; placares mostram "Jogador removido"; IP/UA do log apagados; clipes, votos e links apagados | 1/2/3          | Conforme [retenção](03-dados-pessoais.md)                       |
| S-06b | Excluir conta sem a senha correta                                                                                                | 2              | Recusado                                                        |
| S-06c | Baixar dados: JSON contém só dados do próprio titular                                                                            | 2              | Nenhum dado de terceiros (e-mails, IPs de outros)               |
| S-07  | Toda ação exportada de arquivo `"use server"` checa sessão/papel                                                                 | 2              | Teste que lista as ações e exige um caso negativo para cada uma |
| S-08  | Limite de requisições: 30 chamadas seguidas à análise por IA / envio de clipe                                                    | 2              | A partir do limite, recusado (após P-03)                        |
| S-09  | O bundle do cliente (`.next/static`) não contém `SUPABASE_SECRET_KEY`, `GEMINI`, `FACEIT`, `TWITCH_CLIENT_SECRET`, `CSREP`       | build          | Nenhuma ocorrência                                              |
| S-10  | Logs do servidor não contêm senha, token ou e-mail completo                                                                      | revisão + grep | Nenhuma ocorrência                                              |
| S-11  | Link pessoal: token inválido, token rotacionado, token de outro tentando sair do mix de terceiros                                | 2              | Recusado                                                        |
| S-12  | Cabeçalhos: CSP, `frame-ancestors 'none'`, `X-Content-Type-Options`, `Referrer-Policy`                                           | 3              | Presentes (após P-04)                                           |

## 4.3 Já verificado manualmente (17/10/2026)

- Todas as migrações aplicam do zero e são idempotentes (Postgres 16 local).
- Todas as ações `"use server"` têm checagem de sessão/papel ou só chamam auxiliares que checam
  (`suggestPassword` não acessa dados).

## 4.4 Automatizados (camada 1)

`npm run test:rls` (`scripts/test-rls.sh` + `supabase/tests/rls.sql`) cria um Postgres descartável,
aplica todas as migrações e roda **S-01, S-01b, S-02b, S-02c, S-05, S-05b e S-05c**, além de
conferir que **toda** tabela de `public` tem RLS e que não existe política de escrita para
`anon`/`authenticated`. As tabelas privadas recebem dados antes do teste, para que uma leitura
indevida apareça como falha. Controle negativo feito: sem a migração 0023 o teste **falha** em S-01b.

Ainda faltam: rodar no GitHub Actions, a camada 2 (server actions) e a 3 (ponta a ponta) — P-11.
