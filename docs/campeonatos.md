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

## Etapas 4 e 5 — potes e draft

Aba **Draft** (`/campeonatos/<slug>/draft`), ao vivo (tempo real do Supabase e, por garantia,
atualização a cada 8 s). Migração `0039_championship_draft.sql`.

1. **Potes** (quem organiza): cada inscrito que não é capitão vai para um pote; cada pote recebe um
   jogador por time. O quadro diz o que falta; **Começar draft** só libera com tudo completo.
   Ao começar, inscritos, times e potes ficam fechados.
2. **Adedonha** (ordem): em cada rodada, os capitães dos times ainda sem posição jogam de 0 a 5
   sem ver o do outro (as jogadas ficam numa tabela sem leitura pública). Quando todos jogam, o
   servidor revela, soma e conta em roda a partir do time sorteado ("começa a contagem"): quem o
   total atingir pega a próxima posição. O último que sobra fecha a ordem. Quem organiza pode
   jogar por um capitão ausente.
3. **Escolhas em serpentina**: pote ímpar segue a ordem (1→5), pote par volta (5→1). Só o capitão
   do time da vez (ou quem organiza) vê o botão **Escolher**, e só no pote da vez. Índices únicos no
   banco impedem escolher o mesmo jogador ou a mesma vez duas vezes. Cada escolha coloca o jogador no
   time na hora; a última conclui o draft.
4. **Correções** (quem organiza): **Desfazer última** (fica no histórico como desfeita) e
   **Reiniciar** (ordem e escolhas do zero; potes e capitães mantidos).

Regras puras em `src/lib/championship-draft.ts` (serpentina, adedonha, potes), com testes.

## Etapa 6 — confrontos e agendamento

Aba **Calendário** (`/campeonatos/<slug>/calendario`), ao vivo. Migração `0040_championship_matches.sql`.

- **Gerar confrontos** (quem organiza, depois do draft): todos contra todos. Com 5 times usa o
  calendário publicado, na ordem de cadastro dos times (Snkk, Beli, Koder, Mald, Marlon):
  R1 Beli×Marlon, Koder×Mald (folga Snkk) · R2 Snkk×Marlon, Beli×Koder (folga Mald) ·
  R3 Snkk×Mald, Marlon×Koder (folga Beli) · R4 Snkk×Koder, Mald×Beli (folga Marlon) ·
  R5 Snkk×Beli, Mald×Marlon (folga Koder). Outros tamanhos: método do círculo; ida e volta inverte o
  mando. Dá para gerar de novo enquanto nenhum jogo tiver data.
- **Agendamento pelos capitães**: o capitão de um dos times **propõe** data e hora (com recado
  opcional) → *Aguardando resposta do adversário*; o capitão adversário **aceita** (→ *Aguardando
  aprovação da organização*) ou **recusa** (→ *Aguardando agendamento*) e pode propor outra. A
  organização **aprova** (escolhe o servidor ou pega o primeiro livre) → *Agendada*.
- **Regras** (servidor e testes): a data precisa cair nos dias e horários do campeonato (fuso de
  Brasília; janela que passa da meia-noite vale para a madrugada seguinte); nenhum time em dois
  jogos ao mesmo tempo; no máximo `servidores` jogos simultâneos e cada servidor com um jogo. Cada
  jogo reserva 75 min por mapa possível (MD1 75 min, MD3 3h45).
- **Organização**: marcar direto (sem passar pelos capitães, sem exigir a janela), editar rodada e
  inverter mando (sem pôr um time duas vezes na mesma rodada), adiar, cancelar e reabrir.
- **Avisos na tela**: propostas esperando a sua resposta, jogos esperando aprovação e jogos do seu
  time sem data.
