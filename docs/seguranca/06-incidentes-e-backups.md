# 6. Incidentes, credenciais e backups

## 6.1 Resposta a incidentes de segurança

**Incidente** = acesso não autorizado, vazamento, perda ou alteração indevida de dados, ou chave
exposta. Na dúvida, trate como incidente.

| Etapa | Prazo | O que fazer |
|-------|-------|-------------|
| 1. Conter | Imediato | Revogar a credencial exposta (6.2); se houver abuso em andamento, desligar a funcionalidade (Admin → funcionalidades) ou pausar o deploy na Vercel |
| 2. Registrar | Mesmo dia | Abrir registro privado (fora do repositório público): data/hora, como foi descoberto, o que foi afetado, ações tomadas |
| 3. Avaliar | 24 h | Quais dados e quantos titulares; consultar `audit_log`, logs da Vercel e *Auth logs* do Supabase |
| 4. Comunicar | **3 dias úteis** (Resolução CD/ANPD nº 15/2024) se houver risco ou dano relevante | Comunicar à ANPD e aos titulares afetados: natureza dos dados, riscos, medidas tomadas e o canal de contato |
| 5. Corrigir | Conforme gravidade | Corrigir a causa, adicionar teste que reproduz o problema ([04](04-plano-de-testes.md)) |
| 6. Revisar | 2 semanas | Atualizar estes documentos e as [pendências](05-pendencias.md) |

## 6.2 Revogar credenciais

| Credencial | Onde revogar | Depois |
|------------|--------------|--------|
| Chave secreta do Supabase | Supabase → Project Settings → API Keys → criar nova *secret key* e apagar a antiga | Atualizar `SUPABASE_SECRET_KEY` na Vercel e fazer Redeploy |
| Sessões de usuários | Supabase → Authentication → Users → usuário → *Sign out* / reset de senha | Avisar o usuário |
| `GEMINI_API_KEY` | aistudio.google.com/apikey → apagar e criar | Vercel + Redeploy |
| `FACEIT_API_KEY` | developers.faceit.com → App → API Keys | Vercel + Redeploy |
| `TWITCH_CLIENT_SECRET` | dev.twitch.tv/console → MeuMix → Gerenciar → **Novo segredo** | Vercel + Redeploy |
| `CSREP_API_KEY` | csrep.gg → conta → API | Vercel + Redeploy |
| Senha de app do Gmail (SMTP) | myaccount.google.com → Segurança → Senhas de app → revogar | Supabase → Authentication → SMTP |
| Link pessoal de um jogador | Admin → Jogadores → ícone de link → gerar novo | Mandar o link novo ao jogador |

Toda chave fica só na Vercel (marcada *Sensitive*) ou no Supabase. Nunca no Git, em prints ou no chat.

## 6.3 Backups e restauração

- **Banco:** confirmar no painel do Supabase (Database → Backups) o que o plano atual oferece. Se o
  plano não guardar backups diários acessíveis, fazer um `pg_dump` semanal manual:
  `pg_dump "$DATABASE_URL" --format=custom --no-owner --file meumix-AAAA-MM-DD.dump`
  - Guardar **criptografado** fora do repositório (o repositório é público): ex. pasta privada no
    Google Drive da conta do MeuMix, arquivo `.dump` dentro de um `.7z` com senha.
  - Reter as 4 últimas cópias semanais e a de cada mês por 6 meses; apagar as mais antigas
    (backups também contêm dados pessoais e seguem a retenção).
- **Teste de restauração (trimestral):** restaurar o dump num Postgres local descartável
  (`pg_restore --no-owner -d postgres meumix.dump`), conferir contagem de perfis, partidas e
  registros, e anotar a data do teste neste arquivo.
- **Código e migrações:** GitHub. Recriar o banco do zero = aplicar `supabase/migrations/*` em ordem.
- **Configuração:** a lista de variáveis está em `.env.example` (sem valores).

| Data | Teste de restauração | Responsável | Resultado |
|------|----------------------|-------------|-----------|
| — | ainda não realizado | — | — |

## 6.4 Logs

- **Não registrar:** senhas, tokens, chaves, cookies, conteúdo de prints, e-mail completo em
  `console.*`. O `audit_log` guarda ids, ações e o mínimo de contexto.
- **Registrar:** ações administrativas (ELO, papel, exclusões, penalidades, finalização de mix,
  mudanças de configuração) — já feito em `services/audit.ts`.
- **Acesso:** `audit_log` só por administradores, pelo painel; sem leitura pela API pública.
- **Retenção:** ver [03-dados-pessoais.md](03-dados-pessoais.md) (6 meses para IP/UA, 24 meses
  para o restante — implementação em P-02).
