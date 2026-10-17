# 3. Dados pessoais: finalidades, bases legais e retenção

Registro das operações de tratamento (LGPD, art. 37). **Rascunho técnico para revisão jurídica**:
as bases legais abaixo são a proposta do time técnico, não um parecer. Nem todo tratamento depende
de consentimento; a base de cada finalidade foi escolhida pelo que de fato a sustenta.

Bases (art. 7º): **Contrato** = execução de contrato ou procedimentos preliminares a pedido do
titular (V) · **LI** = legítimo interesse (IX, com teste de balanceamento) · **Consentimento** (I) ·
**Obrigação legal** (II).

## 3.1 Inventário

| Dado | Onde fica | Finalidade | Base legal proposta | Visibilidade | Retenção proposta |
|------|-----------|------------|---------------------|--------------|-------------------|
| E-mail | `auth.users` | Login, recuperação de senha, avisos da conta | Contrato | Titular e administradores | Até excluir a conta |
| Senha (hash) | `auth.users` (Supabase) | Autenticação | Contrato | Ninguém (só hash) | Até excluir a conta |
| Nick | `profiles.display_name` | Identificação nos mixes, ranking, placares | Contrato | **Pública** | Até excluir a conta; nos placares, anonimizado (P-05) |
| Nome completo (opcional) | `profiles.full_name` | Organizadores identificarem quem é quem | LI (ou consentimento, se for opcional e informado) | **Deve ser** só admins — hoje é público (P-01) | Até excluir a conta ou o titular apagar |
| Estatísticas, ELO, nível, histórico de partidas | `player_match_records`, `elo_change_logs`, `profiles` | Ranking, equilíbrio de times, estatísticas | Contrato | Pública | Enquanto a comunidade existir; anonimizado após exclusão da conta |
| Steam ID, link e foto da Steam (opcional) | `profiles` | Foto do perfil, link do perfil, clipes do Allstar, CSRep | Contrato (vínculo feito pelo próprio titular) | Pública | Até desvincular ou excluir a conta |
| Canal da Twitch (opcional) | `profiles.twitch_login` | Mostrar live e gravações dos mixes | Contrato (vínculo pelo titular) | Pública | Até remover ou excluir a conta |
| Link do CSRep e análise por IA | `profiles.csrep_url`, `player_ai_analyses` | Análise informativa de desempenho | Contrato (pedida pelo titular) | Pública | Até excluir a análise ou a conta |
| Clipes (Allstar/Twitch) | `clips` | Destaques dos mixes | Contrato | Pública | Até excluir o clipe ou a conta |
| Inscrições, votos de mapa/capitão | `mix_registrations`, `map_votes`, `captain_votes` | Organizar o mix | Contrato | Pública | 12 meses (proposta) |
| Penalidades | `user_penalties` | Regras de convivência (faltas, atrasos) | LI | Titular e administradores | 12 meses após expirar (proposta) |
| IP, *user agent*, dispositivo e horários da inscrição | `audit_log.detail` | Segurança e prevenção de fraude na fila de inscrição | LI; avaliar Marco Civil art. 15 (guarda de registros de acesso por 6 meses, se aplicável) | Administradores | **6 meses**, depois apagar IP e *user agent* (P-02) |
| Ações administrativas | `audit_log` | Prestação de contas, investigação de incidentes | LI | Administradores | 24 meses (proposta) |
| Token do link pessoal | `confirm_links` + cookie `mm_confirm` | Confirmar presença sem login | Contrato | Ninguém (cookie *httpOnly*) | Até rotacionar ou excluir a conta; cookie 1 ano |
| Prints da GC / do CSRep | não armazenados (só o resultado) | Ler placar e estatísticas por IA | Contrato / LI | — | Não guardados |

## 3.2 Compartilhamento com terceiros (operadores e fontes)

| Terceiro | Papel | Dados | Observação |
|----------|-------|-------|------------|
| Supabase | Operador (banco e autenticação) | Todos acima | Confirmar a **região** do projeto no painel (transferência internacional, art. 33, se fora do Brasil) |
| Vercel | Operador (hospedagem) | Requisições, IP em logs da plataforma | EUA — transferência internacional |
| Google (Gmail SMTP) | Operador (envio de e-mails) | E-mail, conteúdo do e-mail | Conta `meumix.cs@gmail.com` |
| Google (Gemini) | Operador (IA) | Prints com nicks e estatísticas | Avaliar termos de uso de dados da API; EUA |
| Steam, Twitch, Faceit | Fontes de dados públicos | Consulta por Steam ID, canal, sala | Só leitura de dados públicos; nada do usuário é enviado além do identificador |
| Allstar, CSRep | Fontes (quando disponíveis) | Steam ID | Integrações não oficiais/pendentes: não presumir permissão de API |

## 3.3 Cookies e armazenamento local

| Nome | Tipo | Finalidade | Duração |
|------|------|------------|---------|
| `sb-*-auth-token` | Necessário | Sessão do Supabase | Sessão ou "lembrar de mim" |
| `mm-remember` | Necessário | Lembrar a escolha "manter conectado" | Conforme escolha |
| `mm_confirm` | Necessário | Link pessoal de confirmação | 1 ano |
| `localStorage` (música de fundo, fila de inscrição) | Preferência/funcional | Música mudo/ligado, inscrição pendente | Até limpar o navegador |

Não há cookies de publicidade nem de análise de terceiros. Com só cookies necessários, basta a
**Política de Cookies** informativa (sem banner de consentimento); se entrar analytics, o banner
passa a ser obrigatório.

## 3.4 Direitos do titular (art. 18) — como atender

| Direito | Como | Situação |
|---------|------|----------|
| Confirmação e acesso | Botão **Baixar meus dados** (JSON) em Minha conta | A implementar (P-09) |
| Correção | Configurações (nick via servidor, Steam, Twitch) + pedido ao canal | Parcial |
| Exclusão / anonimização | Botão **Excluir minha conta** (exige senha), com anonimização dos placares | A implementar (P-05, P-09) |
| Portabilidade | Mesmo JSON do acesso | A implementar |
| Informação sobre compartilhamento | Política de Privacidade | A escrever (P-10) |
| Revogação de consentimento | Desvincular Steam/Twitch/CSRep, apagar análise | Parcial |
| Canal do titular | E-mail do encarregado na Política | A definir (P-10) |

Prazo de resposta a pedidos pelo canal: **15 dias** (art. 19, II), registrado no `audit_log`.
