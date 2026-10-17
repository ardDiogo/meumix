# Segurança e LGPD — MeuMix

Documentação de segurança desde a concepção (_Security by Design_), privacidade desde a concepção
(_Privacy by Design_) e minimização de dados. Versionada junto com o código e as migrações: toda
funcionalidade nova que trate dados pessoais atualiza estes arquivos **no mesmo PR**.

| #   | Documento                                          | Conteúdo                                                                  |
| --- | -------------------------------------------------- | ------------------------------------------------------------------------- |
| 1   | [Permissões e ameaças](01-permissoes-e-ameacas.md) | Papéis, matriz de permissões, superfícies de ataque, ameaças e mitigações |
| 2   | [Tabelas e RLS](02-tabelas-e-rls.md)               | Cada tabela: quem lê, quem escreve, políticas atuais e alvo               |
| 3   | [Dados pessoais](03-dados-pessoais.md)             | Inventário: dado, finalidade, base legal, compartilhamento, retenção      |
| 4   | [Plano de testes](04-plano-de-testes.md)           | Testes de segurança obrigatórios antes de publicar                        |
| 5   | [Pendências](05-pendencias.md)                     | Achados da auditoria, riscos abertos, itens legais e operacionais         |
| 6   | [Incidentes e backups](06-incidentes-e-backups.md) | Resposta a incidentes, revogação de credenciais, backup e restauração     |

## Estado em 17/10/2026

Auditoria feita sobre as migrações `0001` a `0022` e as _server actions_ em `src/app`.

**Já existe**

- RLS ativo em **todas** as 38 tabelas do esquema `public`, com negação por padrão: só há políticas
  de `SELECT`; toda escrita passa pelo servidor com a chave secreta, depois de checar sessão e papel.
- `INSERT/UPDATE/DELETE` revogados de `anon` e `authenticated` nas tabelas de dados; funções
  `security definer` executáveis só por `service_role`.
- Super administrador definido fora do banco (`SUPER_ADMIN_EMAILS`), exigindo e-mail confirmado.
- Todas as _server actions_ checam sessão/papel no servidor (verificado uma a uma).
- Chaves só em variáveis de ambiente (Vercel _Sensitive_); `.env.local` fora do Git.
- Log de auditoria (`audit_log`) das ações administrativas, sem leitura pela API pública.

**Não está pronto para lançamento** — ver [Pendências](05-pendencias.md). Os pontos de maior
risco: nome completo legível pela API pública, ausência de limite de requisições, ausência de
testes automatizados de RLS, exclusão de conta sem anonimização dos registros, e falta de
Política de Privacidade, Termos e canal do titular.

> Passar nos testes não torna a aplicação segura. Os riscos conhecidos e não resolvidos ficam
> registrados em [Pendências](05-pendencias.md) até serem tratados.
