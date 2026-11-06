# Campeonatos (MeuMix Championship)

Módulo de campeonatos de CS2 dentro do MeuMix: equipes formadas por draft, fase classificatória,
playoffs, premiação e estatísticas. Menu **Campeonatos** (`/campeonatos`).

## Decisões

- Separado do mix: tabelas e telas próprias; nada do mix (ELO, ranking, insígnias, estatísticas)
  é lido ou alterado pelo campeonato.
- A ordem do draft sai de uma **adedonha** entre os capitães, jogada no site.
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

## Etapas 2 e 3

Aba **Equipes** (`/campeonatos/<slug>/equipes`), pública; quem organiza vê os botões:

- **Inscrever jogadores**: busca entre os cadastrados e marca vários de uma vez, até completar
  as vagas (equipes × jogadores por equipe). Remover inscrição (o capitão precisa ser trocado antes).
- **Times**: nome, sigla (sugerida pelo nome), cor, escudo (imagem reduzida a 256 px) e capitão
  entre os inscritos. O capitão entra no time na hora; um jogador só pode ser capitão de um time.
  Editar troca o capitão (o antigo volta a ficar sem time); excluir o time não tira a inscrição.
- Quadro "Para montar os potes": aponta o que falta (inscritos, times, capitães).
- Depois que o campeonato começa (Em andamento, Playoffs, Finalizado), inscritos e times ficam fechados.
