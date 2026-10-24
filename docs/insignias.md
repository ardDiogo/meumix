# Insígnias automáticas

Insígnias **dinâmicas** acompanham a fase atual do jogador e podem ser perdidas e reconquistadas.
Insígnias **permanentes** são marcos e nunca são removidas. As **manuais** continuam sendo
concedidas pelo admin, como antes.

## Como funciona

- O cálculo é feito no servidor, em `src/lib/badge-engine.ts` (função pura, testada em
  `badge-engine.test.ts`). Ele relê **todos** os resultados oficiais em ordem cronológica e
  devolve todas as conquistas que deveriam existir, inclusive as já encerradas.
- `src/services/badge-sync.ts` grava o resultado com `sync_auto_badges` (migração 0025), numa
  transação e com um cálculo por vez:
  - conquista nova → nova linha em `player_badges` (sem duplicar: `user_id + badge_id + source_ref`);
  - perdeu a condição → a linha recebe `deactivated_at` e `end_reason` (o histórico fica);
  - conquista dinâmica que deixou de existir porque um resultado foi corrigido ou excluído →
    removida; **permanentes nunca são removidas**; manuais não são tocadas.
- Recalcula sozinho depois de: finalizar mix, excluir mix, mudar a data do mix, vincular
  convidados e ajustar ELO. Também há o botão **Recalcular** (Admin → Insígnias) e o cron diário
  `/api/cron/insignias` (protegido por `CRON_SECRET`).
- Só contam partidas finalizadas (só elas existem em `mix_matches`) e jogadores com conta e ELO
  aplicado (`calculate_elo`). Mapa sem placar ou empatado não conta e não quebra sequência.

## Regras (parâmetros editáveis em Admin → Insígnias → ícone de regra)

| Insígnia                                                                                      | Tipo                | Regra                                                                                                                                                              | Perde quando                                      | Parâmetros                          |
| --------------------------------------------------------------------------------------------- | ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------- | ----------------------------------- |
| Foguinho (nova)                                                                               | Dinâmica            | Vencer **3 mapas seguidos**                                                                                                                                        | Perde um mapa                                     | `n` = 3                             |
| Pé Frio                                                                                       | Dinâmica            | Perder 3 mapas seguidos                                                                                                                                            | Vence um mapa                                     | `n` = 3                             |
| Rei do Mix (nova)                                                                             | Dinâmica            | 1º do ranking geral (mesma regra da página Rankings: ELO, desempate pela taxa de vitória nos mixes, depois mais mixes, depois id) entre quem tem o mínimo de mixes | Outro jogador assume a liderança                  | `min_mixes` = 3                     |
| MVP (nova)                                                                                    | Dinâmica            | MVP (`is_mvp`) do mix mais recente                                                                                                                                 | Próximo mix finalizado com outro MVP              | —                                   |
| Foguete                                                                                       | Dinâmica            | Subir 5+ posições no ranking em relação a 4 mixes atrás                                                                                                            | A subida na janela fica abaixo do mínimo          | `positions` = 5, `window` = 4       |
| Consistente                                                                                   | Dinâmica            | Nota de desempenho (a mesma do perfil, aproximação do Rating 2.0) ≥ 0,90 em **cada** um dos últimos 10 mixes jogados                                               | Um dos 10 últimos fica abaixo ou sem nota         | `mixes` = 10, `min_rating` = 0,9    |
| Rei do Mapa                                                                                   | Dinâmica (por mapa) | Melhor aproveitamento num mapa, com ≥ 5 partidas nele e ≥ 60% de vitórias                                                                                          | Outro jogador passa a ter o melhor aproveitamento | `min_maps` = 5, `min_win_rate` = 60 |
| Veterano de Guerra                                                                            | Permanente          | 50 mixes concluídos                                                                                                                                                | Nunca                                             | `mixes` = 50                        |
| Lanterna                                                                                      | Dinâmica            | Ser o lanterna (pior desempenho, `is_lanterna`) do último mix                                                                                                      | Próximo mix com outro lanterna                    | —                                   |
| Lanterna Vermelha (nova)                                                                      | Dinâmica            | Lanterna em 3 mixes seguidos que jogou (mix que não jogou não conta)                                                                                               | Primeiro mix fora da lanterna                     | `n` = 3                             |
| Maior Matador, Maior ADR, Maior KDR, Mais First Kills, Mais Assistências, Mais Mortes (novas) | Dinâmica            | Ser o destaque do último mix (mesma regra dos cards "Destaques da partida")                                                                                        | Próximo mix com outro destaque                    | —                                   |
| Baiter                                                                                        | Dinâmica            | Menos first kills no último mix                                                                                                                                    | Próximo mix com outro jogador                     | —                                   |
| Rei do Pitaco (bolão)                                                                         | Dinâmica            | 1º no ranking do bolão (pontos; desempate igual ao da página Bolão), com o mínimo de palpites                                                                      | Outro palpiteiro assume a liderança               | `min_bets` = 3                      |
| Alambrado do Mix (bolão)                                                                      | Dinâmica            | Palpitar em 3 mixes seguidos (com bolão) sem jogar nenhum deles                                                                                                    | Joga um mix ou deixa de palpitar                  | `n` = 3                             |
| Mãe Diná (bolão)                                                                              | Permanente          | Gabaritar um bolão: vencedor, placar, MVP e lanterna (10 pontos)                                                                                                   | Nunca                                             | —                                   |
| Zicado (bolão)                                                                                | Dinâmica            | Errar o vencedor em 3 bolões seguidos (mix empatado não conta)                                                                                                     | Acerta o vencedor                                 | `n` = 3                             |
| Chutômetro Quebrado (bolão)                                                                   | Dinâmica            | 0 pontos no bolão do último mix                                                                                                                                    | Pontua no próximo bolão                           | —                                   |

Insígnias do bolão: só contam mixes que tiveram palpites, conferidos pelo resultado oficial
(migração `0033_badges_bolao.sql`). Quem só palpita, sem jogar, também ganha e vê no perfil.

Ranking usado no Rei do Mix e no Foguete: o ELO após cada mix (`elo_after`). Se o admin ajustar
o ELO depois do último mix, o líder atual segue o ELO de agora.

## PICK dos capitães

- Cada jogador disponível mostra posição, ELO, taxa de vitória, nota média dos 5 últimos mixes,
  últimos resultados e **até 3 insígnias ativas**, das mais relevantes para as outras (liderança,
  mapa, sequência de vitórias, consistência, subida, MVP, marcos, manuais e, por último, Pé Frio).
  O restante aparece como “+N”.
- Tocar no jogador abre os detalhes (todas as insígnias com descrição e motivo, melhores mapas e
  estatísticas) sem sair do PICK; dá para escolher dali mesmo.
- As insígnias são só informação: não mudam a ordem, não dão pontos e não bloqueiam ninguém.
- Tudo é carregado de uma vez para os jogadores do mix (sem consulta por jogador).

## Limitações

- **Máquina de HS**: o MeuMix não guarda headshots, então ela continua **manual**.
- **Lenda do MeuMix**, **Capa de Jornal** e as demais insígnias sem dado confiável continuam
  manuais. Não existe a “Recordista”.
- **Patrão do Mix** (manual) tem a mesma ideia do Rei do Mix; não foi alterada. Se quiser, desabilite-a.
- Insígnias que viraram automáticas (Pé Frio, Foguete, Consistente, Rei do Mapa, Veterano) e
  tinham sido dadas à mão: a concessão manual foi para o histórico; quem tem agora é decidido
  pelo cálculo.
- Desabilitar uma insígnia esconde de perfis e do PICK e para o cálculo dela, sem apagar o
  histórico. Excluir apaga tudo.
- O histórico das dinâmicas é reconstruído pelos resultados: corrigir um placar antigo pode
  mudar datas e motivos de conquistas passadas.

## Controle manual pelo admin

- **Ativa/Desativada** (na lista de insígnias): liga ou desliga a insígnia para todos, sem apagar o histórico.
- **Desativar/Reativar** (em Concedidas, para automáticas): desativa a conquista de um jogador e a
  trava — o recálculo não reativa (`player_badges.locked`). Reativar devolve à regra: se o jogador
  não cumpre mais, o recálculo encerra de novo.
- **Conceder** também aceita automáticas: vira uma conquista manual, que o recálculo não mexe.
