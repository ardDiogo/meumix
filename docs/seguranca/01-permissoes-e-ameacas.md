# 1. Modelo de permissões e ameaças

## 1.1 Arquitetura de confiança

```
Navegador ──(chave pública + JWT do usuário)──▶ Supabase PostgREST ──▶ RLS (só SELECT público)
    │
    └──▶ Next.js (Vercel) ── server actions / rotas ──(chave secreta)──▶ Supabase (escrita)
                         └── checa sessão e papel ANTES de escrever
```

- **O navegador nunca escreve direto no banco.** Toda escrita é uma _server action_ que valida a
  sessão (`getSession`) e o papel (`canManageMixes`, `canManageAdmins`) e só então usa a chave
  secreta (`createSupabaseAdminClient`).
- A chave pública (`NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`) é, por definição, conhecida por qualquer
  pessoa. Tudo o que ela consegue ler é **público** — o RLS precisa ser escrito assumindo isso.
- O frontend esconde botões por conveniência; a permissão real é sempre conferida no servidor.

## 1.2 Papéis

| Papel                    | Como é definido hoje                           | Alvo                                                |
| ------------------------ | ---------------------------------------------- | --------------------------------------------------- |
| Visitante                | sem sessão                                     | igual                                               |
| Jogador                  | conta confirmada (`profiles.role = 'user'`)    | igual                                               |
| Jogador via link pessoal | cookie `mm_confirm` (só confirmar/sair do mix) | igual, com rotação do link                          |
| Organizador              | **não existe** — hoje é o `admin`              | `community_members.role = 'organizer'`              |
| Moderador                | **não existe**                                 | `community_members.role = 'moderator'`              |
| Administrador            | `profiles.role = 'admin'`                      | `community_members.role = 'admin'` (por comunidade) |
| Super administrador      | e-mail em `SUPER_ADMIN_EMAILS` (fora do banco) | igual                                               |

## 1.3 Matriz de permissões (alvo)

| Ação                                          | Visitante | Jogador | Organizador | Moderador |  Admin   |  Super   |
| --------------------------------------------- | :-------: | :-----: | :---------: | :-------: | :------: | :------: |
| Ver mixes, ranking, perfis públicos           |    ✅     |   ✅    |     ✅      |    ✅     |    ✅    |    ✅    |
| Confirmar presença / votar mapa e capitão     |     —     | próprio |   próprio   |  próprio  | próprio  | próprio  |
| Editar o próprio perfil (nick, Steam, Twitch) |     —     |   ✅    |     ✅      |    ✅     |    ✅    |    ✅    |
| Baixar / excluir os próprios dados            |     —     |   ✅    |     ✅      |    ✅     |    ✅    |    ✅    |
| Enviar clipe                                  |     —     | próprio |  qualquer   | qualquer  | qualquer | qualquer |
| Excluir clipe                                 |     —     | próprio |      —      | qualquer  | qualquer | qualquer |
| Criar mix, finalizar, importar placar         |     —     |    —    |     ✅      |     —     |    ✅    |    ✅    |
| Remover inscrição, aplicar penalidade         |     —     |    —    |     ✅      |    ✅     |    ✅    |    ✅    |
| Ver e-mail de outros jogadores                |     —     |    —    |      —      |     —     |    ✅    |    ✅    |
| Alterar ELO, nível, insígnias                 |     —     |    —    |      —      |     —     |    ✅    |    ✅    |
| Redefinir senha / excluir conta de outro      |     —     |    —    |      —      |     —     |   ✅*    |    ✅    |
| Conceder/remover administrador                |     —     |    —    |      —      |     —     |    —     |    ✅    |
| Ver log de auditoria                          |     —     |    —    |      —      |     —     |    ✅    |    ✅    |

\* Nunca sobre outro administrador ou o super administrador (regra já aplicada em `user-actions.ts`).

**Hoje** o `admin` acumula organizador + moderador + administrador. A divisão em papéis menores é a
pendência P-06.

## 1.4 Ameaças (STRIDE) e mitigações

| #   | Ameaça                     | Exemplo concreto                                                              | Mitigação atual                                                                               | Situação                                |
| --- | -------------------------- | ----------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- | --------------------------------------- |
| T1  | Escrita direta via API     | `PATCH /rest/v1/profiles?id=eq.<eu>` com `{"role":"admin"}` ou `{"elo":5000}` | `UPDATE` revogado; só `display_name` tem _grant_ de coluna                                    | ✅ testar (S-04, S-05)                  |
| T2  | Leitura indevida via API   | anônimo lê `profiles.full_name` com a chave pública                           | política `SELECT using (true)` na tabela inteira                                              | ❌ **aberto** (P-01)                    |
| T3  | Server action sem checagem | chamar `updateUserElo` sem ser admin                                          | `authorize()` em toda ação                                                                    | ✅ testar (S-02)                        |
| T4  | Escalada de privilégio     | admin promove a si mesmo a super / rebaixa o super                            | super fora do banco; `setUserRole` só para super                                              | ✅ testar (S-04)                        |
| T5  | Link pessoal vazado        | alguém usa o link de confirmação de outro                                     | token aleatório 20–64 chars, só confirma/sai do mix, rotacionável                             | ⚠️ token guardado em texto puro (P-12)  |
| T6  | Abuso / custo              | robô chama a análise por IA (Gemini) ou o envio de clipes em loop             | nenhuma                                                                                       | ❌ **aberto** (P-03)                    |
| T7  | Força bruta de senha       | tentativas no login                                                           | limites do Supabase Auth                                                                      | ⚠️ revisar limites no painel            |
| T8  | Vazamento de segredo       | chave secreta no bundle do cliente                                            | `server-only`, `NEXT_PUBLIC_` só para chave pública                                           | ✅ testar (S-09)                        |
| T9  | XSS / clickjacking         | página embutida em iframe malicioso                                           | React escapa saída                                                                            | ❌ sem CSP nem `frame-ancestors` (P-04) |
| T10 | Dados pessoais em log      | IP e _user agent_ das inscrições guardados para sempre                        | `audit_log` sem leitura pública                                                               | ⚠️ sem prazo de retenção (P-02)         |
| T11 | Acesso entre comunidades   | membro da comunidade A lê dados restritos da B                                | —                                                                                             | n/a hoje: comunidade única (P-07)       |
| T12 | Integrações externas       | resposta maliciosa da Steam/Twitch/Allstar                                    | validação de formato (SteamID64, login Twitch, ids de clipe), _timeouts_, `https` obrigatório | ✅                                      |
| T13 | Exclusão incompleta        | conta excluída, nick continua nos placares e no log                           | `on delete set null`                                                                          | ❌ falta anonimização (P-05)            |

## 1.5 Superfícies públicas sem login

- Páginas: dashboard, mixes, jogadores, rankings, estatísticas, clipes, `/confirmar`.
- `GET /api/historico` (mixes finalizados, sem e-mails), `GET /api/flags`, `GET /api/time`.
- `GET /c/<token>` (grava o cookie do link pessoal).
- API do Supabase com a chave pública: só `SELECT` nas tabelas com política pública.
