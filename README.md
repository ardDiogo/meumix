# MeuMix

Plataforma web para organizar **mixes de Counter-Strike 2**, acompanhar o desempenho dos jogadores e construir comunidades competitivas.

> **Status:** este é o MVP inicial. Todos os dados exibidos são **fictícios** (modo demonstração) e a aplicação mostra isso na interface. Ainda não há autenticação, banco de dados nem integrações externas.

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
      admin/               # Painel administrativo (criação de mixes)
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

## Permissões

- Apenas **administradores** criam mixes (painel em `/admin`). Admins da plataforma são definidos pela variável `ADMIN_EMAILS` (somente servidor); admins de comunidade usam o papel `owner`/`admin` em `community_members`.
- A regra está em `src/lib/auth/permissions.ts` e é verificada **no servidor** (Server Action em `src/app/(app)/admin/actions.ts`), não apenas escondendo botões.
- Enquanto o login não existe, **ninguém é administrador em produção** e o painel fica bloqueado.
- Para visualizar o painel localmente, rode com `MEUMIX_DEV_SESSION_EMAIL=<email do admin>` e `ADMIN_EMAILS=<email do admin>` no `.env.local` (ignorado em produção).

## Próximos passos sugeridos

1. Criar projeto no Supabase, aplicar `supabase/migrations/0001_init.sql` e implementar `services/supabase`.
2. Autenticação (Supabase Auth) e vínculo usuário ↔ jogador.
3. Persistir criação de mixes (Server Actions) e registro de placares/estatísticas.
4. Integração Steam (OpenID + Web API) e, depois, CSRep e Twitch.
5. Suporte a múltiplas comunidades (seletor de comunidade, rankings por comunidade).
