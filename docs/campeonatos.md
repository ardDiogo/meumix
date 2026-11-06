# Campeonatos (MeuMix Championship)

Módulo de campeonatos de CS2 dentro do MeuMix: equipes formadas por draft, fase classificatória,
playoffs, premiação e estatísticas. Menu **Campeonatos** (`/campeonatos`).

## Decisões

- O **capitão** é o líder e um dos jogadores do time; os potes completam o resto
  (5x5 = capitão + 4 potes; 25 jogadores com 5 times).
- A ordem do draft sai de um **jogo entre os capitães** (eles mesmos jogam no site).
- Todos os participantes têm conta no MeuMix. O capitão propõe a data do jogo e o capitão
  adversário aceita ou recusa.
- **Pagamento** é controlado fora do site; o site só calcula a premiação.
- Quem organiza: **quem criou** (administrador) e quem o **super admin** liberar.
- Os jogos são na **GC**: resultado e estatísticas entram pelo "Enviar ao MeuMix".

## Etapas

| Etapa | Entrega                                             | Status                 |
| ----- | --------------------------------------------------- | ---------------------- |
| 1     | Cadastro do campeonato, permissões e menu           | pronta (migração 0038) |
| 2     | Inscritos (jogadores cadastrados)                   |                        |
| 3     | Times e capitães                                    |                        |
| 4     | Potes                                               |                        |
| 5     | Ordem (jogo entre capitães) e draft em serpentina   |                        |
| 6     | Confrontos, calendário e agendamento entre capitães |                        |
| 7     | Resultados (GC) e classificação                     |                        |
| 8     | Playoffs                                            |                        |
| 9     | Estatísticas, premiação e visão geral               |                        |

## Etapa 1

- Migração `0038_championships.sql`: `championships`, `championship_organizers`,
  `championship_teams` e `championship_players` (leitura pública; escrita só pelo servidor).
- Cadastro: nome, edição, descrição, banner, datas, status, equipes, jogadores por equipe (os
  potes acompanham: jogadores − 1), fase classificatória (formato, MD, pontos), playoffs (formato,
  MD), dias e horário permitidos, servidores, inscrição, custos e percentuais da premiação.
- Premiação calculada: (inscrições × valor − custos) × percentual; centavos que sobram vão
  para o 1º lugar.
- Regras puras em `src/lib/championship.ts`; testes: `npm run test:campeonato`.
