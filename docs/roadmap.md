# Roadmap — implementação das regras do mix

Referência: [`regras-do-mix.md`](./regras-do-mix.md). Legenda: ✅ feito · 🟡 parcial · ⬜ pendente.

## Fase 1 — Inscrições e votações (atual)

| Item                                                                            | Seção | Status                                       |
| ------------------------------------------------------------------------------- | ----- | -------------------------------------------- |
| Mix agendado (semanal ou data única), criado só por admin                       | 1     | ✅                                           |
| Abertura pelo relógio do servidor (sincroniza com RTT, 5 min + ao voltar à aba) | 1     | ✅                                           |
| Contagem regressiva de 1s; botão bloqueado até sincronizar                      | 1     | ✅                                           |
| 10 classificados + reservas pela ordem de chegada; reordena ao cancelar         | 2     | ✅                                           |
| Já inscrito → sucesso; cliques simultâneos → banco impede duplicidade           | 2     | ✅                                           |
| Cedo demais → recusa se faltar mais de 1s                                       | 2     | ✅                                           |
| Log de auditoria de toda tentativa e ação de admin                              | 2, 10 | ✅                                           |
| Fila de nova tentativa (10 tentativas, 1–10s, reconectar/aba/5s)                | 2     | ✅                                           |
| Renovação da sessão e "acordar" o servidor antes da abertura                    | 2     | ✅                                           |
| Dispositivo da inscrição e registro de cancelamentos                            | 12    | ✅                                           |
| Votação de mapas (exatamente 4, só classificados, troca o voto)                 | 3     | ✅                                           |
| Votação de capitães (até 2, não em si, só classificados)                        | 4     | ✅                                           |
| Janela de votação obrigatória com 10 classificados                              | 8     | 🟡 (capitães e mapas; sem sugestão de times) |
| Tempo real: inscrições e votos atualizam sem recarregar                         | 11    | ✅                                           |
| Compartilhar convite no WhatsApp                                                | —     | ✅                                           |

## Fase 2 — Disputa e escolha dos times

| Item                                                                                         | Seção | Status |
| -------------------------------------------------------------------------------------------- | ----- | ------ |
| Bloqueio de voto de capitão quando o PPT começa                                              | 4     | ⬜     |
| Pedra, papel ou tesoura entre capitães (oculto até ambos prontos, empate salvo, reset em 3s) | 5     | ⬜     |
| Escolha dos times 1-2-2-2-1 com checagem no banco a cada escolha                             | 6     | ⬜     |
| Admin: reiniciar escolha / tudo; remover jogador zera escolhas                               | 6     | ⬜     |
| Desempate de mapas (rounds 1 e 2 + sorteio)                                                  | 3     | ⬜     |
| Sugestão de times balanceados (252 combinações) + votação 80%                                | 7     | ⬜     |
| Probabilidade de vitória                                                                     | 7     | ⬜     |

## Fase 3 — Cargos e administração

| Item                                                                | Seção | Status                    |
| ------------------------------------------------------------------- | ----- | ------------------------- |
| Cargos master / admin / usuário                                     | 10    | 🟡 (super admin = master) |
| Punições (atraso na abertura, expiração automática, ícone na lista) | 2, 10 | ⬜                        |
| Reset de senha por admin/master                                     | 10    | ⬜                        |
| Insígnias                                                           | 10    | ⬜                        |
| Chaves de funcionalidades (sugestão de times, música, desempate)    | 10    | ⬜                        |
| Música de fundo                                                     | 10    | ⬜                        |
| Tela de logs de auditoria                                           | 10    | ⬜                        |

## Fase 4 — Finalização, ELO e histórico

| Item                                                                    | Seção | Status                              |
| ----------------------------------------------------------------------- | ----- | ----------------------------------- |
| Níveis 1–10 por ELO e ELO inicial a partir do nível GC                  | 9     | ⬜                                  |
| Finalização via Faceit (link/ID da partida)                             | 9     | ⬜                                  |
| Finalização via prints da Gamers Club (leitura por IA)                  | 9     | ⬜                                  |
| MVP, lanterna e cálculo de ELO                                          | 9     | ⬜                                  |
| Estatísticas reais por jogador, ranking e histórico com filtro de datas | 9     | ⬜ (hoje são dados de demonstração) |
