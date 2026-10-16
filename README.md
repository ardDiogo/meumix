# MeuMix

Plataforma web para organizar **mixes de Counter-Strike 2**, acompanhar o desempenho dos jogadores e construir comunidades competitivas.

> **Status:** com o Supabase configurado, o site usa dados reais (inscrições, votações, partidas finalizadas, ELO e ranking). Sem ele, roda em modo demonstração com dados fictícios, sinalizados na interface.

## Documentação

- [`docs/regras-do-mix.md`](docs/regras-do-mix.md) — regras e lógica completa do mix.
- [`docs/especificacao-tecnica.md`](docs/especificacao-tecnica.md) — especificação técnica e como o MeuMix a adapta.
- [`docs/roadmap.md`](docs/roadmap.md) — o que já foi implementado de cada regra.

## Stack

- [Next.js](https://nextjs.org) (App Router) + TypeScript
- Tailwind CSS v4 (tokens de design em `src/app/globals.css`)
- Componentes no padrão [shadcn/ui](https://ui.shadcn.com) (Radix + CVA) em `src/components/ui`
- [Lucide](https://lucide.dev) (ícones) · [Recharts](https://recharts.org) (gráficos) · [Sonner](https://sonner.emilkowal.ski) (feedback)
- Supabase (PostgreSQL + Auth) **planejado** — schema em `supabase/migrations`

## Rodando localmente

Requisitos: Node.js 20.9+ e npm.

```bash
npm install
cp .env.example .env.local   # opcional por enquanto
npm run dev
```

Acesse http://localhost:3000 (redireciona para `/dashboard`).

Outros comandos:

| Comando             | O que faz                     |
| ------------------- | ----------------------------- |
| `npm run build`     | Build de produção             |
| `npm start`         | Sobe o build de produção      |
| `npm run lint`      | ESLint                        |
| `npm run typecheck` | Verificação de tipos          |
| `npm run format`    | Formata o código com Prettier |

## Deploy na Vercel

1. Em [vercel.com/meumix](https://vercel.com/meumix), **Add New → Project** e importe o repositório `meumix` do GitHub.
2. O framework (Next.js) é detectado automaticamente; não é preciso alterar comandos.
3. Variáveis de ambiente são opcionais nesta fase (`MEUMIX_DATA_SOURCE=demo` é o padrão).

O plano gratuito (Hobby) da Vercel é suficiente para o MVP.

## Estrutura

```
src/
  app/
    (app)/                 # Rotas com o shell (sidebar + topbar)
      dashboard/           # Dashboard do jogador
      mixes/               # Lista e detalhes ([id])
      admin/               # Painel administrativo (mixes e administradores)
    entrar/                # Login, cadastro e recuperação de senha
    auth/callback/         # Retorno dos links enviados por e-mail
      jogadores/           # Busca e perfil ([id])
      rankings/            # Ranking com filtro de período e busca
      estatisticas/        # Números da comunidade
      clipes/              # Clipes e highlights
      configuracoes/       # Conta, comunidade e integrações
      loading.tsx, error.tsx
  components/
    brand/                 # Marca "meumix"
    layout/                # Sidebar, topbar, navegação mobile, busca, menu do usuário
    ui/                    # Componentes base reutilizáveis
    stats/ mixes/ players/ # Componentes de domínio
  lib/                     # Regras de negócio puras (estatísticas, ELO, times, formatação)
    integrations/          # Utilitários de integrações (ainda não implementadas)
  services/
    data-source.ts         # Contrato de acesso a dados
    demo/                  # Implementação com dados FICTÍCIOS (isolada)
    queries.ts             # Consultas usadas pelas páginas
  types/                   # Modelo de domínio e view models
supabase/migrations/       # Schema PostgreSQL planejado
```

### Princípios

- **Dados demonstrativos isolados.** Tudo que é fictício vive em `src/services/demo` e a UI exibe o selo "Demo" / a faixa "Modo demonstração" sempre que `dataSource.kind === "demo"`.
- **Trocar a fonte de dados sem mexer nas páginas.** As páginas usam `services/queries.ts`, que depende apenas da interface `DataSource`. Para o Supabase, basta criar `services/supabase/` implementando a mesma interface e selecioná-la em `services/index.ts`.
- **Estatísticas incrementais.** Só K/A/D são obrigatórios; ADR, KAST, HS%, primeiros abates, multikills e clutches são opcionais e aparecem como "—" quando ausentes.
- **Multi-comunidade.** Jogadores participam de várias comunidades, com ELO, mixes e rankings próprios em cada uma (`community_members`).
- **Sem ações falsas.** Funcionalidades ainda não implementadas informam isso explicitamente ao serem acionadas.
- **Segredos só no servidor.** Apenas variáveis `NEXT_PUBLIC_*` chegam ao navegador; chaves privadas (Supabase service role, Steam Web API) nunca devem usar esse prefixo.

## Login e permissões

O login usa **Supabase Auth** (e-mail e senha, confirmação por e-mail e recuperação de senha) em `/entrar`.

| Papel         | Como é definido                                        | Pode                                           |
| ------------- | ------------------------------------------------------ | ---------------------------------------------- |
| Super admin   | E-mail em `SUPER_ADMIN_EMAILS` (com e-mail confirmado) | Tudo, inclusive nomear/remover administradores |
| Administrador | `profiles.role = 'admin'`, concedido pelo super admin  | Criar e gerenciar mixes                        |
| Jogador       | Padrão de toda conta nova                              | Usar a plataforma                              |

- Regras em `src/lib/auth/permissions.ts`, verificadas **no servidor** nas Server Actions (`src/app/(app)/admin/actions.ts`).
- Ninguém consegue se promover: o banco bloqueia a edição de `role` pelo usuário (`0002_auth.sql`); só o servidor altera com a chave service role, após checar o super admin.
- Sem Supabase configurado, ninguém é administrador em produção. Localmente, `MEUMIX_DEV_SESSION_EMAIL` simula uma sessão.

### Ativando o login

1. Crie um projeto gratuito em [supabase.com](https://supabase.com).
2. No **SQL Editor**, execute em ordem `supabase/migrations/0001_init.sql`, `0002_auth.sql`, `0003_registrations.sql`, `0004_votes_audit_realtime.sql`, `0005_draft.sql`, `0006_penalties_tiebreaker.sql`, `0007_elo_matches.sql`, `0008_full_name.sql`, `0009_steam.sql`, `0010_admin_config.sql`, `0011_match_stats.sql`, `0012_link_guests.sql`, `0013_csrep.sql` e `0014_team_suggestion.sql`.
3. Em **Authentication → URL Configuration**, defina **Site URL** como `https://meumix.vercel.app` e adicione `https://meumix.vercel.app/auth/callback` (e `http://localhost:3000/auth/callback`) em **Redirect URLs**.
4. Na Vercel (**Settings → Environment Variables**), adicione `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SECRET_KEY` e `SUPER_ADMIN_EMAILS`, e faça um novo deploy.
5. Opcional — leitura dos prints da GC por IA: adicione `GEMINI_API_KEY` (crie em https://aistudio.google.com/apikey). Envie um print por mapa com o nome do mapa no nome do arquivo (ex.: `mirage.png`).

## Próximos passos sugeridos

1. Criar projeto no Supabase, aplicar `supabase/migrations/0001_init.sql` e implementar `services/supabase`.
2. Autenticação (Supabase Auth) e vínculo usuário ↔ jogador.
3. Persistir criação de mixes (Server Actions) e registro de placares/estatísticas.
4. Integração Steam (OpenID + Web API) e, depois, CSRep e Twitch.
5. Suporte a múltiplas comunidades (seletor de comunidade, rankings por comunidade).
