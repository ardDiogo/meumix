# 5. Pendências antes do lançamento

Achados da auditoria de 17/10/2026 e itens legais/operacionais. Severidade: **Alta** = expõe dado
pessoal ou permite abuso hoje · **Média** = falta controle importante · **Baixa** = melhoria.

## 5.1 Técnicas

| ID | Sev. | Pendência | Proposta |
|----|------|-----------|----------|
| P-01 | Alta | `profiles.full_name` (nome completo) é legível por qualquer pessoa pela API pública (política `select using (true)` na tabela inteira) | *Grant* de `SELECT` por coluna, sem `full_name` (ver [2.3](02-tabelas-e-rls.md#23-políticas-alvo--mudanças-propostas)); admins leem pelo servidor |
| P-02 | Alta | IP e *user agent* das inscrições no `audit_log` sem prazo de retenção | Rotina diária (cron da Vercel ou `pg_cron`) que remove `ip`/`user_agent` do `detail` após 6 meses e apaga eventos com mais de 24 meses |
| P-03 | Alta | Sem limite de requisições nas ações (inscrição, envio de clipe, análise por IA com custo no Gemini, importações) | Limite por usuário e por IP em tabela `rate_limits` (janela deslizante) ou Upstash Redis; começar pelas ações com custo externo |
| P-04 | Média | Sem cabeçalhos de segurança (CSP, `frame-ancestors`, `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy`) | `headers()` no `next.config.ts`; CSP liberando só Supabase, Twitch, Allstar, Steam e o CDN dos mapas |
| P-05 | Alta | Excluir uma conta deixa o nick em `player_match_records.player_name` e o `user_id`/IP dentro de `audit_log.detail` | Função `delete_account(p_user)` (`security definer`, só `service_role`): anonimiza `player_name` → "Jogador removido", limpa `detail` do log, apaga perfil e `auth.users` |
| P-06 | Média | Só existem `user`/`admin` (+ super por e-mail). Faltam organizador e moderador | Papéis por comunidade em `community_members.role`; ações passam a checar o papel mínimo da [matriz](01-permissoes-e-ameacas.md#13-matriz-de-permissões-alvo) |
| P-07 | Média | Sem isolamento por comunidade (não há `community_id`) | Necessário antes de abrir uma segunda comunidade ([2.4](02-tabelas-e-rls.md#24-comunidades-isolamento)) |
| P-08 | Baixa | 11 tabelas legadas da `0001` sem uso | Remover numa migração |
| P-09 | Alta | Não há "Baixar meus dados" nem "Excluir minha conta" | Página **Minha conta**: alterar senha (exige a atual), baixar JSON, excluir conta (exige senha) |
| P-11 | Alta | Não há testes automatizados de RLS nem de autorização | Implementar a camada 1 e 2 do [plano](04-plano-de-testes.md) e rodar no GitHub Actions |
| P-12 | Baixa | Token do link pessoal guardado em texto puro | Guardar só o hash SHA-256; o link continua igual |
| P-13 | Média | O jogador pode mudar o próprio nick direto pela API (*grant* de `display_name`), sem a validação de tamanho/formato do servidor | Revogar o *grant* e a política; nick só pelo servidor |
| P-14 | Média | Administradores (não só o super) veem os e-mails de todos | Mostrar e-mail mascarado (`di•••@gmail.com`) e completo só ao super, ou registrar no log quando um admin revelar |
| P-15 | Média | Limites do Supabase Auth (login, cadastro, recuperação) não revisados; sem CAPTCHA | Revisar em Authentication → Rate Limits; avaliar Turnstile/hCaptcha no cadastro |
| P-16 | Baixa | Verificar se a senha mínima de 8 caracteres também está configurada no Supabase (o servidor já exige) | Authentication → Policies |

## 5.2 Legais (revisão por advogado/encarregado)

| ID | Pendência |
|----|-----------|
| P-10 | Escrever e publicar **Política de Privacidade**, **Termos de Uso** e **Política de Cookies** (páginas `/privacidade`, `/termos`, `/cookies`, com link no rodapé e no cadastro) |
| L-01 | Definir o **controlador** (pessoa física ou jurídica responsável pelo MeuMix) e o **encarregado/canal** do titular (e-mail dedicado, ex.: `privacidade@…`) |
| L-02 | Validar as bases legais propostas em [03-dados-pessoais.md](03-dados-pessoais.md), em especial nome completo, IP/UA e publicação de estatísticas |
| L-03 | Avaliar se o MeuMix se enquadra no Marco Civil, art. 15 (guarda de registros de acesso por 6 meses) |
| L-04 | Transferência internacional (Vercel, Google, possivelmente Supabase): cláusulas/termos dos fornecedores e menção na Política |
| L-05 | Termos: regras da comunidade, penalidades, conduta, publicação de clipes e estatísticas, idade mínima (definir se aceita menores de 18 e, se sim, regras do art. 14) |
| L-06 | Registro de consentimento, se alguma finalidade ficar com base em consentimento: tabela `consents (user_id, finalidade, versao_documento, aceito_em, revogado_em)` |
| L-07 | Aceite dos Termos no cadastro com versão do documento registrada |

## 5.3 Operacionais

| ID | Pendência |
|----|-----------|
| O-01 | Conferir o plano do Supabase e a política de backups; fazer um backup manual e **testar a restauração** ([06](06-incidentes-e-backups.md)) |
| O-02 | Rotacionar as chaves que já apareceram em conversas/prints (CSRep, Resend — apagar —, token do Allstar) |
| O-03 | Ativar 2FA nas contas Vercel, Supabase, GitHub, Google (`meumix.cs@gmail.com`) e Twitch Developer |
| O-04 | Repositório público: manter o *secret scanning* do GitHub ligado; nunca commitar `.env*`, dumps ou listas de jogadores |
| O-05 | Definir quem tem acesso de administrador no Supabase e na Vercel e revisar a cada 6 meses |

## 5.4 Ordem sugerida

1. **Agora (sem mudar funcionalidade):** P-01, P-13, P-04, O-02, O-03.
2. **Fase 1 — direitos do titular:** P-09 (Minha conta) + P-05 (exclusão com anonimização) +
   P-10/L-01 (páginas legais e canal) + testes S-01 a S-06, S-09.
3. **Fase 2 — abuso e retenção:** P-03, P-02, P-14, P-15, P-11 completo.
4. **Fase 3 — antes da 2ª comunidade:** P-06, P-07, P-08, S-03.
